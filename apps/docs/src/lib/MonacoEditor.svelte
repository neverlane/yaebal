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

	function ensureFont() {
		if (document.getElementById("pg-fira")) return;

		const l = document.createElement("link");

		l.id = "pg-fira";
		l.rel = "stylesheet";
		l.href = "https://cdn.jsdelivr.net/npm/firacode@6.2.0/distr/fira_code.css";

		document.head.appendChild(l);
	}

	onMount(async () => {
		ensureFont();
		try {
			monaco = await loadMonaco();
			const ts = monaco.languages.typescript;

			ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
			ts.typescriptDefaults.setCompilerOptions({
				target: ts.ScriptTarget.ESNext,
				allowNonTsExtensions: true,
				moduleResolution: ts.ModuleResolutionKind.NodeJs,
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
					"focusBorder": "#5857d400",
				},
			});

			editor = monaco.editor.create(host, {
				value,
				language: "typescript",
				theme: theme === "dark" ? "yaebal-dark" : "vs",
				automaticLayout: true,
				minimap: { enabled: false },
				fontSize: 13.5,
				fontFamily: "'Fira Code', 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
				fontLigatures: true,
				lineHeight: 1.7,
				letterSpacing: 0.2,
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
			
			if (document.fonts?.ready) document.fonts.ready.then(() => monaco?.editor.remeasureFonts());
		} catch {
			failed = true;
		}
	});

	$effect(() => {
		const next = value;
		if (editor && editor.getModel().getValue() !== next) editor.getModel().setValue(next);
	});
	
	$effect(() => {
		if (monaco) monaco.editor.setTheme(theme === "dark" ? "yaebal-dark" : "vs");
	});

	onDestroy(() => editor?.dispose());
</script>

{#if failed}
	<textarea class="fallback mono" bind:value spellcheck="false"></textarea>
{:else}
	<div class="host" bind:this={host}></div>
{/if}

<style>
	.host {
		width: 100%;
		height: 100%;
		min-height: 420px;
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
		font-size: 13px;
		line-height: 1.7;
		tab-size: 2;
	}
</style>
