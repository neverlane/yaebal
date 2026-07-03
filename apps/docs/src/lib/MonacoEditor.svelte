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
    const telegram = `declare module "@yaebal/types" {
  export type ParseMode = "MarkdownV2" | "HTML" | "Markdown";
  export interface User { id: number; is_bot: boolean; first_name: string; last_name?: string; username?: string; language_code?: string; }
  export interface Chat { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string; username?: string; first_name?: string; last_name?: string; }
  export interface MessageEntity { type: string; offset: number; length: number; url?: string; user?: User; language?: string; custom_emoji_id?: string; }
  export interface WebAppInfo { url: string; }
  export interface LoginUrl { url: string; forward_text?: string; bot_username?: string; request_write_access?: boolean; }
  export interface CopyTextButton { text: string; }
  export interface CallbackGame {}
  export interface SwitchInlineQueryChosenChat { query?: string; allow_user_chats?: boolean; allow_bot_chats?: boolean; allow_group_chats?: boolean; allow_channel_chats?: boolean; }
  export interface InlineKeyboardButton { text: string; url?: string; callback_data?: string; web_app?: WebAppInfo; login_url?: LoginUrl; switch_inline_query?: string; switch_inline_query_current_chat?: string; switch_inline_query_chosen_chat?: SwitchInlineQueryChosenChat; copy_text?: CopyTextButton; callback_game?: CallbackGame; pay?: boolean; style?: "primary" | "success" | "danger"; icon_custom_emoji_id?: string; }
  export interface InlineKeyboardMarkup { inline_keyboard: InlineKeyboardButton[][]; }
  export interface KeyboardButton { text: string; request_contact?: boolean; request_location?: boolean; request_poll?: { type?: "quiz" | "regular" }; web_app?: WebAppInfo; style?: "primary" | "success" | "danger"; icon_custom_emoji_id?: string; }
  export interface ReplyKeyboardMarkup { keyboard: KeyboardButton[][]; is_persistent?: boolean; resize_keyboard?: boolean; one_time_keyboard?: boolean; input_field_placeholder?: string; selective?: boolean; }
  export interface ReplyKeyboardRemove { remove_keyboard: true; selective?: boolean; }
  export interface ForceReply { force_reply: true; input_field_placeholder?: string; selective?: boolean; }
  export type ReplyMarkup = InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply | { toJSON(): InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply };
  export interface ReplyParameters { message_id: number; chat_id?: number | string; allow_sending_without_reply?: boolean; quote?: string; quote_parse_mode?: ParseMode; quote_entities?: MessageEntity[]; quote_position?: number; }
  export interface LinkPreviewOptions { is_disabled?: boolean; url?: string; prefer_small_media?: boolean; prefer_large_media?: boolean; show_above_text?: boolean; }
  export interface Message { message_id: number; date?: number; chat: Chat; from?: User; text?: string; caption?: string; entities?: MessageEntity[]; caption_entities?: MessageEntity[]; reply_markup?: InlineKeyboardMarkup; }
  export interface CallbackQuery { id: string; from: User; message?: Message; data?: string; chat_instance?: string; }
  export interface Update { update_id?: number; message?: Message; edited_message?: Message; channel_post?: Message; callback_query?: CallbackQuery; [key: string]: unknown; }
  export interface SendMessageParams { chat_id: number | string; text: string; parse_mode?: ParseMode; entities?: MessageEntity[]; link_preview_options?: LinkPreviewOptions; disable_notification?: boolean; protect_content?: boolean; reply_parameters?: ReplyParameters; reply_markup?: ReplyMarkup; }
  export interface SendPhotoParams { chat_id: number | string; photo: unknown; caption?: string; parse_mode?: ParseMode; caption_entities?: MessageEntity[]; has_spoiler?: boolean; disable_notification?: boolean; protect_content?: boolean; reply_parameters?: ReplyParameters; reply_markup?: ReplyMarkup; }
  export interface SendDocumentParams { chat_id: number | string; document: unknown; caption?: string; parse_mode?: ParseMode; caption_entities?: MessageEntity[]; disable_notification?: boolean; protect_content?: boolean; reply_parameters?: ReplyParameters; reply_markup?: ReplyMarkup; }
  export interface EditMessageTextParams { chat_id?: number | string; message_id?: number; inline_message_id?: string; text: string; parse_mode?: ParseMode; entities?: MessageEntity[]; link_preview_options?: LinkPreviewOptions; reply_markup?: InlineKeyboardMarkup; }
  export interface EditMessageCaptionParams { chat_id?: number | string; message_id?: number; inline_message_id?: string; caption?: string; parse_mode?: ParseMode; caption_entities?: MessageEntity[]; reply_markup?: InlineKeyboardMarkup; }
  export type ReactionType = { type: "emoji"; emoji: string } | { type: "custom_emoji"; custom_emoji_id: string };
}`;

    const core = `declare module "@yaebal/core" {
  import type * as t from "@yaebal/types";
  import type { CallbackQueryContext, MessageContext } from "@yaebal/contexts";
  export type NextFn = () => Promise<void>;
  export type Middleware<C = Context> = (ctx: C, next: NextFn) => unknown | Promise<unknown>;
  export type Plugin<In extends Context = Context, Out extends object = {}> = <C extends In>(composer: Composer<C>) => Composer<C & Out>;
  export type SendText = string | { text: string; entities?: t.MessageEntity[] };
  export type SendMessageExtra = Omit<t.SendMessageParams, "chat_id" | "text">;
  export interface Api { call<R = unknown>(method: string, params?: Record<string, unknown>): Promise<R>; sendMessage(params: t.SendMessageParams): Promise<t.Message>; }
  export interface BotOptions { apiRoot?: string; allowedUpdates?: string[]; contextFactory?: unknown; readFile?: unknown; }
  export class Context { readonly api: Api; readonly update: t.Update; readonly updateType: string; readonly message?: t.Message; readonly callbackQuery?: t.CallbackQuery; readonly from?: t.User; readonly chat?: t.Chat; readonly text?: string; is(updateType: string): boolean; send(text: SendText, extra?: SendMessageExtra): Promise<t.Message>; reply(text: SendText, extra?: SendMessageExtra): Promise<t.Message>; sendPhoto(media: unknown, extra?: Omit<t.SendPhotoParams, "chat_id" | "photo">): Promise<t.Message>; sendDocument(media: unknown, extra?: Omit<t.SendDocumentParams, "chat_id" | "document">): Promise<t.Message>; answerCallbackQuery(text?: string): Promise<boolean>; }
  export class Composer<C extends Context = Context> { use(...m: Middleware<C>[]): this; on(query: "message:text", ...h: Middleware<C & MessageContext & { text: string }>[]): this; on(query: "message", ...h: Middleware<C & MessageContext>[]): this; on(query: "callback_query:data", ...h: Middleware<C & CallbackQueryContext & { data: string }>[]): this; on(query: "callback_query", ...h: Middleware<C & CallbackQueryContext>[]): this; on<Q extends string>(query: Q, ...h: Middleware<C>[]): this; command(name: string, ...h: Middleware<C & MessageContext & { command: string; args: string[]; text: string }>[]): this; install<Add extends object>(plugin: (c: Composer<C>) => Composer<C & Add>): Composer<C & Add>; derive<D extends object>(fn: (ctx: C) => D | Promise<D>): Composer<C & D>; decorate<D extends object>(value: D): Composer<C & D>; }
  export class Bot<C extends Context = Context> extends Composer<C> { constructor(token: string, options?: BotOptions); api: Api; start(): Promise<void>; stop(): void; onStart(handler: (info: unknown) => unknown | Promise<unknown>): this; onError(handler: (error: unknown, ctx: Context) => unknown | Promise<unknown>): this; }
  export const media: { path(path: string): unknown; url(url: string): unknown; buffer(bytes: Uint8Array | ArrayBuffer): unknown; fileId(id: string): unknown };
  export function format(strings: TemplateStringsArray, ...values: unknown[]): { text: string; entities: unknown[] };
}`;
    const contexts = `declare module "@yaebal/contexts" {
  import type * as t from "@yaebal/types";
  import type { Context, SendMessageExtra, SendText } from "@yaebal/core";
  export type ReactionInput = string | { emoji: string } | { custom_emoji_id: string } | t.ReactionType;
  export class MessageContext extends Context { chat: t.Chat; message_id: number; from?: t.User; text?: string; caption?: string; send(text: SendText, params?: SendMessageExtra): Promise<t.Message>; send(params: Omit<t.SendMessageParams, "chat_id">): Promise<t.Message>; reply(text: SendText, params?: SendMessageExtra): Promise<t.Message>; reply(params: Omit<t.SendMessageParams, "chat_id">): Promise<t.Message>; editText(text: string, params?: Omit<t.EditMessageTextParams, "chat_id" | "message_id" | "text">): Promise<t.Message | boolean>; editText(params: Omit<t.EditMessageTextParams, "chat_id" | "message_id">): Promise<t.Message | boolean>; editCaption(caption: string, params?: Omit<t.EditMessageCaptionParams, "chat_id" | "message_id" | "caption">): Promise<t.Message | boolean>; react(reaction?: ReactionInput | ReactionInput[]): Promise<boolean>; delete(): Promise<boolean>; pin(): Promise<boolean>; unpin(): Promise<boolean>; }
  export class CallbackQueryContext extends Context { id: string; from: t.User; data?: string; message?: t.Message; answer(text?: string, params?: Record<string, unknown>): Promise<boolean>; answerCallbackQuery(text?: string): Promise<boolean>; editText(text: string, params?: Omit<t.EditMessageTextParams, "chat_id" | "message_id" | "text">): Promise<t.Message | boolean>; reply(text: SendText, params?: SendMessageExtra): Promise<t.Message>; }
  export class InlineQueryContext extends Context { id: string; from: t.User; query: string; answer(results: unknown[], params?: Record<string, unknown>): Promise<boolean>; }
  export class ChatJoinRequestContext extends Context { from: t.User; chat: t.Chat; approve(): Promise<boolean>; decline(): Promise<boolean>; send(text: SendText, params?: SendMessageExtra): Promise<t.Message>; }
  export class PreCheckoutQueryContext extends Context { id: string; from: t.User; answer(ok: boolean, error_message?: string): Promise<boolean>; }
  export class ShippingQueryContext extends Context { id: string; from: t.User; answer(ok: boolean, shipping_options?: unknown[], error_message?: string): Promise<boolean>; }
  export type ContextByType = { message: MessageContext; edited_message: MessageContext; channel_post: MessageContext; callback_query: CallbackQueryContext; inline_query: InlineQueryContext; chat_join_request: ChatJoinRequestContext; pre_checkout_query: PreCheckoutQueryContext; shipping_query: ShippingQueryContext; };
  export function contextFor(type: keyof ContextByType, api: unknown, update: t.Update): ContextByType[keyof ContextByType];
}`;
    const keyboard = `declare module "@yaebal/keyboard" {
  import type * as t from "@yaebal/types";
  export class InlineKeyboard { add(...buttons: t.InlineKeyboardButton[]): this; columns(columns?: number): this; text(label: string, data: string): this; static text(label: string, data: string): t.InlineKeyboardButton; url(label: string, url: string): this; static url(label: string, url: string): t.InlineKeyboardButton; webApp(label: string, url: string): this; static webApp(label: string, url: string): t.InlineKeyboardButton; login(label: string, url: string, options?: Omit<t.LoginUrl, "url">): this; switchInline(label: string, query?: string): this; switchInlineCurrentChat(label: string, query?: string): this; switchInlineChosenChat(label: string, options?: t.SwitchInlineQueryChosenChat): this; copyText(label: string, text: string): this; pay(label: string): this; game(label: string): this; style(style: "primary" | "success" | "danger"): this; icon(customEmojiId: string): this; row(): this; build(): t.InlineKeyboardMarkup; toJSON(): t.InlineKeyboardMarkup; }
  export class Keyboard { add(...buttons: t.KeyboardButton[]): this; columns(columns?: number): this; text(label: string): this; static text(label: string): t.KeyboardButton; requestContact(label: string): this; requestLocation(label: string): this; requestPoll(label: string, type?: "quiz" | "regular"): this; resized(value?: boolean): this; oneTime(value?: boolean): this; persistent(value?: boolean): this; placeholder(text: string): this; selective(value?: boolean): this; style(style: "primary" | "success" | "danger"): this; icon(customEmojiId: string): this; row(): this; build(): t.ReplyKeyboardMarkup; toJSON(): t.ReplyKeyboardMarkup; static remove(selective?: boolean): t.ReplyKeyboardRemove; static forceReply(placeholder?: string, selective?: boolean): t.ForceReply; }
}`;
    const fmt = `declare module "@yaebal/fmt" { export function html(strings: TemplateStringsArray, ...values: unknown[]): { text: string; entities: import("@yaebal/types").MessageEntity[] }; export function md(strings: TemplateStringsArray, ...values: unknown[]): { text: string; entities: import("@yaebal/types").MessageEntity[] }; }`;
    const globals = `declare const process: { env: Record<string, string | undefined> };
declare namespace NodeJS { interface ProcessEnv extends Record<string, string | undefined> {} }`;
    const meta = `declare module "yaebal" { export * from "@yaebal/core"; export * from "@yaebal/contexts"; export * from "@yaebal/keyboard"; export * from "@yaebal/fmt"; export function createBot(token: string, options?: import("@yaebal/core").BotOptions): import("@yaebal/core").Bot; export function callbackData(prefix: string, schema: Record<string, NumberConstructor | StringConstructor | BooleanConstructor>): any; export function session<S>(options: { initial: () => S }): import("@yaebal/core").Plugin<import("@yaebal/core").Context, { session: S }>; export const richContext: NonNullable<import("@yaebal/core").BotOptions["contextFactory"]>; }`;
    ts.typescriptDefaults.addExtraLib(
      globals,
      "file:///node_modules/@types/node/process.d.ts",
    );
    ts.typescriptDefaults.addExtraLib(
      telegram,
      "file:///node_modules/@yaebal/types/index.d.ts",
    );
    ts.typescriptDefaults.addExtraLib(
      core,
      "file:///node_modules/@yaebal/core/index.d.ts",
    );
    ts.typescriptDefaults.addExtraLib(
      contexts,
      "file:///node_modules/@yaebal/contexts/index.d.ts",
    );
    ts.typescriptDefaults.addExtraLib(
      keyboard,
      "file:///node_modules/@yaebal/keyboard/index.d.ts",
    );
    ts.typescriptDefaults.addExtraLib(
      fmt,
      "file:///node_modules/@yaebal/fmt/index.d.ts",
    );
    ts.typescriptDefaults.addExtraLib(
      meta,
      "file:///node_modules/yaebal/index.d.ts",
    );
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

      ts.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });
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
          focusBorder: "#5857d400",
        },
      });

      editor = monaco.editor.create(host, {
        value,
        language: "typescript",
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

  onDestroy(() => editor?.dispose());
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
