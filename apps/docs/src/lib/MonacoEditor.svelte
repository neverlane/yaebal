<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  let {
    value = $bindable(""),
    theme = "dark",
  }: { value?: string; theme?: "dark" | "light" } = $props();

  const VER = "0.52.2";
  const VS = `https://cdn.jsdelivr.net/npm/monaco-editor@${VER}/min/vs`;

  let host = $state<HTMLDivElement>();
  // biome-ignore lint/suspicious/noExplicitAny: monaco has no types loaded here
  let editor = $state<any>(null);
  // biome-ignore lint/suspicious/noExplicitAny: loaded from CDN at runtime
  let monaco = $state<any>(null);
  let failed = $state(false);

  // biome-ignore lint/suspicious/noExplicitAny: AMD loader bootstrap
  function loadMonaco(): Promise<any> {
    const w = window as any;
    if (w.monaco) return Promise.resolve(w.monaco);
    if (w.__monacoLoading) return w.__monacoLoading;
    w.__monacoLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${VS}/loader.js`;
      s.onload = () => {
        const req = w.require;
        req.config({ paths: { vs: VS } });

        w.MonacoEnvironment = {
          getWorkerUrl: () =>
            `data:text/javascript;charset=utf-8,${encodeURIComponent(
              `self.MonacoEnvironment={baseUrl:'https://cdn.jsdelivr.net/npm/monaco-editor@${VER}/min/'};importScripts('${VS}/base/worker/workerMain.js');`,
            )}`,
        };

        req(["vs/editor/editor.main"], () => resolve(w.monaco));
      };

      s.onerror = reject;
      document.head.appendChild(s);
    });

    return w.__monacoLoading;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Monaco is loaded dynamically from the CDN.
  async function addYaebalTypes(ts: any): Promise<boolean> {
    // the real generated d.ts of every workspace package (own lazy chunk — it's big)
    const { PLAYGROUND_DTS } = await import("./playground-dts");
    const entries = Object.entries(PLAYGROUND_DTS);

    // empty means the docs app was built without `pnpm build` (no packages/*/lib) —
    // report it and leave semantic validation off rather than flag every import red
    if (!entries.length) {
      console.warn(
        "playground: no package d.ts bundled — build the workspace packages (pnpm build) before building the docs app; editor diagnostics stay off",
      );
      return false;
    }

    for (const [path, content] of entries) ts.typescriptDefaults.addExtraLib(content, path);

    const globals = `declare const process: { env: Record<string, string | undefined> };
declare namespace NodeJS { interface ProcessEnv extends Record<string, string | undefined> {} }`;
    ts.typescriptDefaults.addExtraLib(
      globals,
      "file:///node_modules/@types/playground-globals/index.d.ts",
    );

    return true;
  }


  const EDITOR_FONT = {
    family: '"JetBrains Mono"',
    size: 13.5,
    weight: 400,
    lineHeight: 1.7,
    letterSpacing: 0.2,
  } as const;

  // monaco caches character-width metrics at creation time — if the webfont hasn't
  // finished loading yet, it measures the fallback font and the grid stays misaligned.
  // Force the configured weights/size/family to load first.
  async function loadEditorFont(): Promise<void> {
    if (!document.fonts?.load) return;

    try {
      await document.fonts.load(
        `${EDITOR_FONT.weight} ${EDITOR_FONT.size}px ${EDITOR_FONT.family}`,
      );
    } catch {
      /* webfont failed to load — Monaco falls back to the next stack entry */
    }
  }

  function applyEditorFont() {
    if (!editor) return;

    editor.updateOptions({
      fontFamily: EDITOR_FONT.family,
      fontSize: EDITOR_FONT.size,
      fontWeight: String(EDITOR_FONT.weight),
      lineHeight: EDITOR_FONT.lineHeight,
      letterSpacing: EDITOR_FONT.letterSpacing,
      disableMonospaceOptimizations: true,
      allowVariableFonts: true,
    });
    monaco?.editor.remeasureFonts();
  }

  onMount(async () => {
    try {
      await loadEditorFont();
      monaco = await loadMonaco();
      const ts = monaco.languages.typescript;

      // semantic validation stays off until the package d.ts are registered —
      // otherwise every import flashes "cannot find module" while the chunk loads
      ts.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: false,
      });
      ts.typescriptDefaults.setCompilerOptions({
        target: ts.ScriptTarget.ESNext,
        allowNonTsExtensions: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        module: ts.ModuleKind.ESNext,
        strict: true,
      });
      void addYaebalTypes(ts)
        .then((loaded) => {
          if (!loaded) return;

          ts.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
          });
        })
        .catch(() => {
          /* types chunk failed to load — editor still works, just without diagnostics */
        });

      monaco.editor.defineTheme("yaebal-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": "#0d0d10",
          "editor.lineHighlightBackground": "#ffffff08",
          "editor.lineHighlightBorder": "#00000000",
          "editorLineNumber.foreground": "#46464e",
          "editorLineNumber.activeForeground": "#9a9aa6",
          "editorGutter.background": "#0d0d10",
          "editorIndentGuide.background1": "#ffffff0d",
          "editorIndentGuide.activeBackground1": "#ffffff1a",
          "scrollbarSlider.background": "#ffffff12",
          "scrollbarSlider.hoverBackground": "#ffffff20",
          "editorWidget.background": "#16161a",
          "editorSuggestWidget.background": "#16161a",
          focusBorder: "#5857d400",
        },
      });

      // the model needs a file:/// URI — node-style module resolution walks up from
      // the model's directory, so the default inmemory:// URI would never reach the
      // file:///node_modules/... extra libs registered by addYaebalTypes.
      const modelUri = monaco.Uri.parse("file:///playground.ts");
      const model =
        monaco.editor.getModel(modelUri) ??
        monaco.editor.createModel(value, "typescript", modelUri);
      model.setValue(value);

      editor = monaco.editor.create(host, {
        model,
        theme: theme === "dark" ? "yaebal-dark" : "vs",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: EDITOR_FONT.size,
        fontFamily: EDITOR_FONT.family,
        fontWeight: String(EDITOR_FONT.weight),
        disableMonospaceOptimizations: true,
        allowVariableFonts: true,
        fontLigatures: false,
        lineHeight: EDITOR_FONT.lineHeight,
        letterSpacing: EDITOR_FONT.letterSpacing,
        scrollBeyondLastLine: false,
        padding: { top: 14, bottom: 14 },
        tabSize: 2,
        lineNumbersMinChars: 3,
        renderLineHighlight: "none",
        guides: { indentation: false },
        overviewRulerLanes: 0,
        cursorBlinking: "smooth",
        smoothScrolling: true,
      });

      editor.onDidChangeModelContent(() => {
        value = editor.getModel().getValue();
      });

      applyEditorFont();

      if (document.fonts?.ready)
        document.fonts.ready.then(() => applyEditorFont());
    } catch {
      failed = true;
    }
  });

  $effect(() => {
    const next = value;
    if (editor && editor.getModel().getValue() !== next)
      editor.getModel().setValue(next);
  });

  $effect(() => {
    if (monaco) monaco.editor.setTheme(theme === "dark" ? "yaebal-dark" : "vs");
  });

  onDestroy(() => {
    const model = editor?.getModel();
    editor?.dispose();
    model?.dispose();
  });
</script>

{#if failed}
  <textarea
    class="fallback"
    bind:value
    spellcheck="false"
    style:--editor-font-family={EDITOR_FONT.family}
    style:--editor-font-size={`${EDITOR_FONT.size}px`}
    style:--editor-font-weight={String(EDITOR_FONT.weight)}
    style:--editor-line-height={String(EDITOR_FONT.lineHeight)}></textarea>
{:else}
  <div
    class="host"
    bind:this={host}
    style:--editor-font-family={EDITOR_FONT.family}
    style:--editor-font-size={`${EDITOR_FONT.size}px`}
    style:--editor-font-weight={String(EDITOR_FONT.weight)}
    style:--editor-line-height={String(EDITOR_FONT.lineHeight)}
  ></div>
{/if}

<style>
  .host {
    width: 100%;
    height: 100%;
    min-height: 420px;
    font-family: var(--editor-font-family);
    font-weight: var(--editor-font-weight);
  }

  .host :global(.monaco-editor),
  .host :global(.monaco-editor *),
  .host :global(.monaco-editor .line-numbers),
  .host :global(.monaco-editor .inputarea),
  .host :global(.monaco-hover),
  .host :global(.suggest-widget),
  .host :global(.monaco-editor .view-lines),
  .host :global(.monaco-editor .view-line),
  .host :global(.monaco-editor .view-line span) {
    --monaco-monospace-font: var(--editor-font-family) !important;
    font-family: var(--editor-font-family) !important;
    font-weight: var(--editor-font-weight) !important;
  }

  .fallback {
    display: block;
    width: 100%;
    min-height: 420px;
    resize: vertical;
    border: none;
    outline: none;
    background: transparent;
    color: var(--secondary);
    padding: 14px 16px;
    font-family: var(--editor-font-family);
    font-size: var(--editor-font-size);
    font-weight: var(--editor-font-weight);
    line-height: var(--editor-line-height);
    tab-size: 2;
  }
</style>
