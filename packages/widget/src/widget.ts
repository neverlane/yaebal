import type {
	EditMessageWidgetDataParams,
	InputSharedWidgetMessageContent,
	InputWidgetMessageContent,
	Message,
	SendSharedWidgetParams,
	SendWidgetParams,
} from "@yaebal/types";
import { type HtmlSource, htmlString, minifyHtml } from "./html.js";
import { assertData, assertDimension, WidgetError } from "./limits.js";
import { lintHtml, type WidgetLintIssue } from "./lint.js";
import { targetParams, type WidgetTarget } from "./plugin.js";
import { type PreviewOptions, previewPage } from "./preview.js";
import { checkHtml, type HtmlSize, measureHtml } from "./size.js";
import type { WidgetState } from "./state.js";

/** a codec or nothing — `defineWidget` slots. */
type Codec<T> = WidgetState<T> | undefined;
type ValueOf<S> = S extends WidgetState<infer T> ? T : never;

export interface WidgetDefinition<P extends Codec<unknown>, D extends Codec<unknown>> {
	/** the widget's html (usually built with `html` + `widgetClient()`). */
	html: HtmlSource;
	/** codec for `public_data` — the shared / forwarded state. */
	publicData?: P;
	/** codec for `chat_data` — the per-message state. */
	chatData?: D;
	/** logical px; omit to fill the bubble width. */
	width?: number;
	/** logical px; omit for an auto height (50–600). */
	height?: number;
	/** the widget may send queries to the bot. default `true`. */
	allowQueries?: boolean;
	/** send it as a shared widget (one state for every copy; resend it with `sendSharedWidget`). */
	shared?: boolean;
	/** run {@link minifyHtml} on the html. default `true`. */
	minify?: boolean;
}

/** per-message values for a send / edit. state values go through the definition's codecs. */
export interface WidgetValues<P extends Codec<unknown>, D extends Codec<unknown>> {
	publicData?: P extends WidgetState<unknown> ? ValueOf<P> : string;
	chatData?: D extends WidgetState<unknown> ? ValueOf<D> : string;
}

/** {@link WidgetValues} where `null` clears a slot — for edits. */
export interface WidgetEditValues<P extends Codec<unknown>, D extends Codec<unknown>> {
	publicData?: (P extends WidgetState<unknown> ? ValueOf<P> : string) | null;
	chatData?: (D extends WidgetState<unknown> ? ValueOf<D> : string) | null;
}

type SendExtra = Omit<
	SendWidgetParams,
	| "chat_id"
	| "html"
	| "width"
	| "height"
	| "public_data"
	| "chat_data"
	| "allow_queries"
	| "is_shared"
>;
type InlineExtra = Omit<
	InputWidgetMessageContent,
	"html" | "width" | "height" | "public_data" | "chat_data" | "allow_queries" | "is_shared"
>;

/** the result of {@link Widget.check}. */
export interface WidgetCheck {
	size: HtmlSize;
	issues: WidgetLintIssue[];
	/** fits the size limits and has no lint errors. */
	ok: boolean;
}

export interface Widget<P extends Codec<unknown>, D extends Codec<unknown>> {
	/** the html that is actually sent (minified unless `minify: false`). */
	readonly html: string;
	readonly publicData: P;
	readonly chatData: D;
	/** measure + lint without throwing. */
	check(): Promise<WidgetCheck>;
	/** throw a `WidgetError` unless the html fits telegram's limits. */
	assert(): Promise<HtmlSize>;
	/** `sendWidget` params minus `chat_id` — `await ctx.sendWidget(await poll.message({ ... }))`. */
	message(
		values?: WidgetValues<P, D>,
		extra?: SendExtra,
	): Promise<Omit<SendWidgetParams, "chat_id">>;
	/** full `sendWidget` params for `chatId` — `bot.api.sendWidget(await poll.to(chatId))`. */
	to(
		chatId: number | string,
		values?: WidgetValues<P, D>,
		extra?: SendExtra,
	): Promise<SendWidgetParams>;
	/** an inline result's `input_message_content`. */
	inline(values?: WidgetValues<P, D>, extra?: InlineExtra): Promise<InputWidgetMessageContent>;
	/** `sendSharedWidget` params minus `chat_id`, re-sending an existing shared widget. */
	resend(
		widgetId: string,
		values?: Pick<WidgetValues<P, D>, "chatData">,
		extra?: Omit<SendSharedWidgetParams, "chat_id" | "widget_id" | "chat_data">,
	): Omit<SendSharedWidgetParams, "chat_id">;
	/** `InputSharedWidgetMessageContent` for an existing shared widget. */
	resendInline(
		widgetId: string,
		values?: Pick<WidgetValues<P, D>, "chatData">,
		extra?: Omit<InputSharedWidgetMessageContent, "widget_id" | "chat_data">,
	): InputSharedWidgetMessageContent;
	/** `editMessageWidgetData` params (`null` clears a slot, omitted = unchanged). */
	edit(target: WidgetTarget, values: WidgetEditValues<P, D>): EditMessageWidgetDataParams;
	/** encode a `public_data` value (through the codec, or verbatim for a codec-less string). */
	encodePublic(value: WidgetValues<P, D>["publicData"]): string;
	/** encode a `chat_data` value. */
	encodeChat(value: WidgetValues<P, D>["chatData"]): string;
	/** decode a message's `widget.public_data`. */
	decodePublic(
		raw: string | null | undefined,
	): (P extends WidgetState<unknown> ? ValueOf<P> : string) | undefined;
	/** decode a message's `widget.chat_data`. */
	decodeChat(
		raw: string | null | undefined,
	): (D extends WidgetState<unknown> ? ValueOf<D> : string) | undefined;
	/** a standalone browser page running the widget with a `TelegramWidget` stub. */
	preview(
		values?: WidgetValues<P, D>,
		options?: Omit<PreviewOptions, "publicData" | "chatData">,
	): string;
}

/** the shared widget's id from the message `sendWidget({ is_shared: true })` returned. */
export function sharedWidgetId(message: Pick<Message, "widget">): string | undefined {
	return message.widget?.id;
}

function encodeWith(
	codec: WidgetState<unknown> | undefined,
	value: unknown,
	field: "public_data" | "chat_data",
): string {
	if (codec) return codec.encode(value);
	if (typeof value !== "string") {
		throw new WidgetError(
			"INPUT_MEDIA_WIDGET_DATA_INVALID",
			`${field}: without a codec the value must be a string — pass a widgetState() codec for objects`,
		);
	}
	return assertData(value, field);
}

/**
 * one widget, defined once: its html, its state codecs and its send options. every method that
 * produces send params checks the html against telegram's limits first.
 *
 * ```ts
 * const poll = defineWidget({
 *   html: html`${widgetClient({ actions: { vote }, revision: true })}<div id=app></div>…`,
 *   publicData: widgetState<{ yes: number; no: number }>({ revision: true }),
 * });
 *
 * bot.command("poll", async (ctx) => ctx.sendWidget(await poll.message({ publicData: { yes: 0, no: 0 } })));
 * ```
 */
export function defineWidget<
	P extends Codec<unknown> = undefined,
	D extends Codec<unknown> = undefined,
>(definition: WidgetDefinition<P, D>): Widget<P, D> {
	const source = htmlString(definition.html);
	const markup = definition.minify === false ? source : minifyHtml(source);
	const width =
		definition.width === undefined ? undefined : assertDimension(definition.width, "width");
	const height =
		definition.height === undefined ? undefined : assertDimension(definition.height, "height");
	const allowQueries = definition.allowQueries ?? true;
	const publicCodec = definition.publicData as WidgetState<unknown> | undefined;
	const chatCodec = definition.chatData as WidgetState<unknown> | undefined;

	let checked: Promise<HtmlSize> | undefined;
	const assert = (): Promise<HtmlSize> => {
		checked ??= checkHtml(markup);
		// a failed check is not cached — the next call reports it again instead of a stale rejection
		checked.catch(() => {
			checked = undefined;
		});
		return checked;
	};

	const encodePublic = (value: unknown) => encodeWith(publicCodec, value, "public_data");
	const encodeChat = (value: unknown) => encodeWith(chatCodec, value, "chat_data");

	const content = (values: WidgetValues<P, D> = {}) => ({
		html: markup,
		...(width === undefined ? {} : { width }),
		...(height === undefined ? {} : { height }),
		...(values.publicData === undefined ? {} : { public_data: encodePublic(values.publicData) }),
		...(values.chatData === undefined ? {} : { chat_data: encodeChat(values.chatData) }),
		...(allowQueries ? { allow_queries: true } : {}),
		...(definition.shared ? { is_shared: true } : {}),
	});

	const decodeWith = (codec: WidgetState<unknown> | undefined, raw: string | null | undefined) =>
		codec ? codec.decode(raw) : raw === null || raw === undefined || raw === "" ? undefined : raw;

	const widget: Widget<P, D> = {
		html: markup,
		publicData: definition.publicData as P,
		chatData: definition.chatData as D,
		async check() {
			const size = await measureHtml(markup);
			const issues = lintHtml(markup);
			return { size, issues, ok: size.fits && !issues.some((i) => i.severity === "error") };
		},
		assert,
		async message(values, extra) {
			await assert();
			return { ...extra, ...content(values) };
		},
		async to(chatId, values, extra) {
			return { chat_id: chatId, ...(await widget.message(values, extra)) };
		},
		async inline(values, extra) {
			await assert();
			return { ...extra, ...content(values) };
		},
		resend(widgetId, values = {}, extra) {
			return {
				...extra,
				widget_id: widgetId,
				...(values.chatData === undefined ? {} : { chat_data: encodeChat(values.chatData) }),
			};
		},
		resendInline(widgetId, values = {}, extra) {
			return {
				...extra,
				widget_id: widgetId,
				...(values.chatData === undefined ? {} : { chat_data: encodeChat(values.chatData) }),
			};
		},
		edit(target, values) {
			return {
				...targetParams(target),
				...(values.publicData === undefined
					? {}
					: { public_data: values.publicData === null ? "" : encodePublic(values.publicData) }),
				...(values.chatData === undefined
					? {}
					: { chat_data: values.chatData === null ? "" : encodeChat(values.chatData) }),
			};
		},
		encodePublic,
		encodeChat,
		decodePublic: (raw) => decodeWith(publicCodec, raw) as ReturnType<Widget<P, D>["decodePublic"]>,
		decodeChat: (raw) => decodeWith(chatCodec, raw) as ReturnType<Widget<P, D>["decodeChat"]>,
		preview(values = {}, options = {}) {
			return previewPage(markup, {
				...options,
				...(values.publicData === undefined ? {} : { publicData: encodePublic(values.publicData) }),
				...(values.chatData === undefined ? {} : { chatData: encodeChat(values.chatData) }),
			});
		},
	};

	return widget;
}
