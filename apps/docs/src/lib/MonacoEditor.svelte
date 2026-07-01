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
	function addYaebalTypes(ts: any) {
		const core = `declare module "@yaebal/core" {
  export type NextFn = () => Promise<void>;
  export type Middleware<C = Context> = (ctx: C, next: NextFn) => unknown | Promise<unknown>;
  export type Plugin<In extends Context = Context, Out extends object = {}> = <C extends In>(composer: Composer<C>) => Composer<C & Out>;
  export interface BotOptions { apiRoot?: string; allowedUpdates?: string[]; contextFactory?: unknown; }
  export class Context { update: unknown; updateType: string; message?: any; callbackQuery?: any; from?: any; chat?: any; text?: string; send(text: string, extra?: object): Promise<any>; reply(text: string, extra?: object): Promise<any>; sendPhoto(media: unknown, extra?: object): Promise<any>; answerCallbackQuery(text?: string): Promise<boolean>; }
  export class Composer<C extends Context = Context> { use(...m: Middleware<C>[]): this; on<Q extends string>(query: Q, ...h: Middleware<C & { text: string; callbackQuery: any }>[]): this; command(name: string, ...h: Middleware<C & { command: string; args: string[] }>[]): this; install<Add extends object>(plugin: (c: Composer<C>) => Composer<C & Add>): Composer<C & Add>; derive<D extends object>(fn: (ctx: C) => D | Promise<D>): Composer<C & D>; decorate<D extends object>(value: D): Composer<C & D>; }
  export class Bot<C extends Context = Context> extends Composer<C> { constructor(token: string, options?: BotOptions); api: any; start(): Promise<void>; stop(): void; onStart(handler: (info: any) => unknown | Promise<unknown>): this; onError(handler: (error: unknown, ctx: Context) => unknown | Promise<unknown>): this; }
  export const media: { path(path: string): unknown; url(url: string): unknown; buffer(bytes: Uint8Array | ArrayBuffer): unknown; fileId(id: string): unknown };
  export function format(strings: TemplateStringsArray, ...values: unknown[]): { text: string; entities: unknown[] };
}`;
		const globals = `declare const process: { env: Record<string, string | undefined> };
declare namespace NodeJS { interface ProcessEnv extends Record<string, string | undefined> {} }`;
		const meta = `declare module "yaebal" { export * from "@yaebal/core"; export function createBot(token: string, options?: import("@yaebal/core").BotOptions): import("@yaebal/core").Bot; export function html(strings: TemplateStringsArray, ...values: unknown[]): { text: string; entities: unknown[] }; export function md(strings: TemplateStringsArray, ...values: unknown[]): { text: string; entities: unknown[] }; export class InlineKeyboard { text(label: string, data: string): this; url(label: string, url: string): this; row(): this; build(): unknown; } export function callbackData(prefix: string, schema: Record<string, NumberConstructor | StringConstructor | BooleanConstructor>): any; export function session<S>(options: { initial: () => S }): import("@yaebal/core").Plugin<import("@yaebal/core").Context, { session: S }>; }`;
		ts.typescriptDefaults.addExtraLib(globals, "file:///node_modules/@types/node/process.d.ts");
		ts.typescriptDefaults.addExtraLib(core, "file:///node_modules/@yaebal/core/index.d.ts");
		ts.typescriptDefaults.addExtraLib(meta, "file:///node_modules/yaebal/index.d.ts");
	}

	const FONT_FAMILY = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
	const FONT_SIZE = 13.5;

	// monaco caches character-width metrics at creation time — if the webfont hasn't
	// finished loading yet, it measures the fallback font and the grid stays misaligned
	// even after IBM Plex Mono swaps in. force the exact weights/size to load first.
	async function loadEditorFont(): Promise<void> {
		if (!document.fonts?.load) return;

		try {
			await Promise.all([
				document.fonts.load(`400 ${FONT_SIZE}px "IBM Plex Mono"`),
				document.fonts.load(`500 ${FONT_SIZE}px "IBM Plex Mono"`),
			]);
		} catch {
			/* webfont failed to load — Monaco falls back to the next stack entry */
		}
	}

	onMount(async () => {
		try {
			await loadEditorFont();
			monaco = await loadMonaco();
			const ts = monaco.languages.typescript;

			ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
			ts.typescriptDefaults.setCompilerOptions({
				target: ts.ScriptTarget.ESNext,
				allowNonTsExtensions: true,
				moduleResolution: ts.ModuleResolutionKind.NodeJs,
				module: ts.ModuleKind.ESNext,
				strict: true,
			});
			addYaebalTypes(ts);

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
				fontSize: FONT_SIZE,
				fontFamily: FONT_FAMILY,
				// IBM Plex Mono has no ligature glyphs, and enabling this drops Monaco out of its
				// fixed-width character grid into native text shaping — the moment the exact
				// webfont isn't what's painting (load race, blocked font, etc.) lines stop lining
				// up and the editor reads as a proportional font.
				fontLigatures: false,
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
		font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	.host :global(.monaco-editor),
	.host :global(.monaco-editor .inputarea),
	.host :global(.monaco-hover),
	.host :global(.suggest-widget),
	.host :global(.monaco-editor .view-line) {
		font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
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
		font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 13px;
		line-height: 1.7;
		tab-size: 2;
	}
</style>
