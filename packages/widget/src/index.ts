/**
 * `@yaebal/widget` — html widgets (Bot API 10.4), both halves:
 *
 * - **bot side** — {@link widgets} (`ctx.widget`: typed answers, state edits, auto-answer),
 *   {@link defineWidget} (html + state codecs + send params in one place), {@link widgetState}
 *   (json `public_data` / `chat_data` with revisions), {@link guardWidgets} (limits checked
 *   locally), and core's `bot.widgetQuery()` router.
 * - **widget side** — {@link widgetClient}, a ~1 KB script that packs typed queries in the
 *   `@yaebal/callback-data` wire format, decodes state, and runs TON wallet payments; plus
 *   `TelegramWidget` types.
 * - **tooling** — {@link measureHtml} / {@link checkHtml} (zlib level 9, like telegram),
 *   {@link lintHtml} (the widget sandbox), {@link minifyHtml}, {@link html}, {@link previewPage}.
 */

export {
	describeActions,
	type WidgetAction,
	type WidgetActionDescriptor,
	type WidgetActionField,
	type WidgetClientApi,
	type WidgetClientOptions,
	widgetClient,
	widgetClientSource,
} from "./client.js";
export { guardWidgets } from "./guard.js";
export {
	escapeHtml,
	type HtmlSource,
	type HtmlValue,
	html,
	htmlString,
	json,
	minifyHtml,
	RawHtml,
	raw,
} from "./html.js";
export {
	assertAnswer,
	assertCacheTime,
	assertData,
	assertDimension,
	assertQueryData,
	byteLength,
	type DataField,
	WIDGET_LIMITS,
	WidgetError,
	type WidgetErrorCode,
} from "./limits.js";
export { lintHtml, type WidgetLintIssue, type WidgetLintSeverity } from "./lint.js";
export {
	type AnyWidgetQuery,
	targetOf,
	targetParams,
	type WidgetControl,
	type WidgetsContext,
	type WidgetsOptions,
	type WidgetTarget,
	widgets,
} from "./plugin.js";
export { PREVIEW_THEMES, type PreviewOptions, previewPage } from "./preview.js";
export {
	checkHtml,
	compressedSize,
	type Deflate,
	deflaterFrom,
	type HtmlSize,
	measureHtml,
	streamDeflateSize,
} from "./size.js";
export {
	nextRevision,
	type RevisionedEnvelope,
	type WidgetState,
	type WidgetStateOptions,
	widgetState,
} from "./state.js";
export type {
	TelegramWidget,
	WidgetContentSafeAreaInset,
	WidgetEventType,
	WidgetHapticFeedback,
	WidgetRequestAnswer,
	WidgetRequestError,
	WidgetRequestErrorCode,
	WidgetSignDataPayload,
	WidgetThemeParams,
	WidgetTonMessage,
	WidgetTonTransaction,
	WidgetViewer,
	WidgetWallet,
} from "./telegram-widget.js";
export {
	fromNano,
	parseSignData,
	TON_NETWORK,
	type TonTransactionOptions,
	type TonTransfer,
	toNano,
	tonTransaction,
} from "./ton.js";
export {
	defineWidget,
	sharedWidgetId,
	type Widget,
	type WidgetCheck,
	type WidgetDefinition,
	type WidgetEditValues,
	type WidgetValues,
} from "./widget.js";
