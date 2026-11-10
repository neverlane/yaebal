import type { Api, Context, Plugin, SharedWidgetQuery, WidgetQuery } from "@yaebal/core";
import type { TonWalletCard, WidgetQueryWallet } from "@yaebal/types";
import { guardWidgets } from "./guard.js";
import { assertAnswer, assertCacheTime, assertData, WidgetError } from "./limits.js";

/** the update a {@link WidgetControl} is about. */
export type AnyWidgetQuery = WidgetQuery | SharedWidgetQuery;

/** where a widget lives — what `editMessageWidgetData` needs to address it. */
export type WidgetTarget =
	| { chatId: number | string; messageId: number }
	| { inlineMessageId: string };

/** `ctx.widget` — see {@link widgets}. */
export interface WidgetControl {
	/** this update's widget query, if it is one. */
	readonly query: AnyWidgetQuery | undefined;
	/** `"data"`, `"sign_data"` or `"sent_transaction"` — `undefined` outside a widget query. */
	readonly kind: AnyWidgetQuery["type"]["type"] | undefined;
	/** the query came from a shared widget (it carries `widget_id`). */
	readonly isShared: boolean;
	/** the query came from a forwarded copy of a shared widget (`shared_widget_query`). */
	readonly isForward: boolean;
	/** the widget is in an inline message (addressed by `inline_message_id`). */
	readonly isInline: boolean;
	/** the shared widget's id, when {@link WidgetControl.isShared}. */
	readonly widgetId: string | undefined;
	/** the user's wallet on `sign_data` / `sent_transaction` queries. */
	readonly wallet: WidgetQueryWallet | undefined;
	/** the wallet card sent along a `data` query made with `{ wallet: true }`. */
	readonly walletCard: TonWalletCard | undefined;
	/** `msg_hash` of a `sent_transaction` query — verify it on-chain before delivering. */
	readonly msgHash: string | undefined;
	/** the JSON-serialized signed payload of a `sign_data` query (see `parseSignData`). */
	readonly signData: string | undefined;
	/** where this query's widget message is — `undefined` for `shared_widget_query`. */
	readonly target: WidgetTarget | undefined;
	/** an answer was already sent for this query (by this control or a raw `answerWidgetQuery`). */
	readonly answered: boolean;
	/**
	 * answer the query with `value` JSON-encoded (≤1024 bytes) — the client's `yw.ask()` resolves
	 * with it parsed. `undefined` answers with no data. resolves `true` once sent, `false` (sending
	 * nothing) when the query was already answered.
	 */
	answer(value?: unknown): Promise<boolean>;
	/** answer with `data` sent verbatim (no JSON) — for widgets that call `request()` themselves. */
	answerRaw(data?: string): Promise<boolean>;
	/**
	 * edit this query's widget data with already-encoded strings (e.g. from `widgetState().encode`).
	 * `null` clears a slot, an omitted key leaves it unchanged. pass `target` to edit another message.
	 */
	setData(
		data: { publicData?: string | null; chatData?: string | null },
		target?: WidgetTarget,
	): Promise<boolean>;
	/** edit the public data of this query's shared widget (or `widgetId`). at most once per second. */
	setSharedData(
		publicData: string | null,
		options?: { cacheTime?: number; widgetId?: string },
	): Promise<boolean>;
	/** don't auto-answer this query — the handler will answer it later, outside the chain. */
	skipAutoAnswer(): void;
}

export interface WidgetsOptions {
	/**
	 * answer every widget query the handler chain left unanswered, with no data, once the chain
	 * finishes — so the widget's promise resolves (`null`) instead of hitting `TIMEOUT` after 15 s.
	 * a chain that throws is not answered (the widget gets `TIMEOUT`, which it should treat as a
	 * failure). default `true`.
	 */
	autoAnswer?: boolean;
	/**
	 * install {@link guardWidgets} on each update's `ctx.api`, so widget payloads that break a
	 * telegram limit throw locally. default `true`. (calls on `bot.api` outside a handler need
	 * `guardWidgets(bot.api)` yourself.)
	 */
	guard?: boolean;
	/** observe a failed auto-answer. the error is swallowed either way. */
	onError?: (error: unknown, ctx: Context) => unknown;
}

/** what {@link widgets} adds to the context. */
export interface WidgetsContext {
	widget: WidgetControl;
}

/** answered-query ids remembered per `Api` — the oldest are dropped past this. */
export const TRACKER_CAP = 2048;
/** `skipAutoAnswer()` state per control — kept off the public surface. */
const skips = new WeakMap<WidgetControl, () => boolean>();
const trackers = new WeakMap<Api, Set<string>>();

function mark(ids: Set<string>, id: string): void {
	if (!ids.has(id) && ids.size >= TRACKER_CAP) {
		const oldest = ids.values().next().value as string;
		ids.delete(oldest);
	}
	ids.add(id);
}

/** per-`Api` set of answered query ids — also catches raw `answerWidgetQuery` calls. */
function tracker(api: Api): Set<string> {
	const existing = trackers.get(api);
	if (existing) return existing;

	const ids = new Set<string>();
	trackers.set(api, ids);
	api.before((method, params) => {
		if (method !== "answerWidgetQuery") return;
		const id = params?.widget_query_id;
		if (typeof id === "string") mark(ids, id);
	});
	return ids;
}

/** the message a widget query's widget is in. */
export function targetOf(query: AnyWidgetQuery | undefined): WidgetTarget | undefined {
	if (!query || !("chat_instance" in query)) return undefined;
	if (query.inline_message_id !== undefined) return { inlineMessageId: query.inline_message_id };
	if (query.chat !== undefined && query.message_id !== undefined) {
		return { chatId: query.chat.id, messageId: query.message_id };
	}
	return undefined;
}

/** `editMessageWidgetData` params for `target`. */
export function targetParams(
	target: WidgetTarget,
): { chat_id: number | string; message_id: number } | { inline_message_id: string } {
	return "inlineMessageId" in target
		? { inline_message_id: target.inlineMessageId }
		: { chat_id: target.chatId, message_id: target.messageId };
}

const slot = (value: string | null, field: "public_data" | "chat_data"): string =>
	value === null ? "" : assertData(value, field);

function controlFor(ctx: Context): { control: WidgetControl; skipped: () => boolean } {
	const query = ctx.widgetQuery;
	const answered = tracker(ctx.api);
	let skipped = false;

	const requireQuery = (method: string): AnyWidgetQuery => {
		if (!query) {
			throw new WidgetError(
				"WIDGET_NOT_A_QUERY",
				`ctx.widget.${method}() needs a widget_query update`,
			);
		}
		return query;
	};

	const type = query?.type;
	const sendAnswer = (method: string, data: string | undefined): Promise<boolean> => {
		const q = requireQuery(method);
		if (answered.has(q.id)) return Promise.resolve(false);
		const payload = data === undefined ? undefined : assertAnswer(data);
		mark(answered, q.id);
		return ctx.api
			.answerWidgetQuery({
				widget_query_id: q.id,
				...(payload === undefined ? {} : { data: payload }),
			})
			.then(() => true);
	};

	const control: WidgetControl = {
		query,
		kind: type?.type,
		isShared: query?.widget_id !== undefined,
		isForward: query !== undefined && !("chat_instance" in query),
		isInline:
			query !== undefined && "inline_message_id" in query && query.inline_message_id !== undefined,
		widgetId: query?.widget_id,
		wallet: type && type.type !== "data" ? type.wallet : undefined,
		walletCard: type?.type === "data" ? type.wallet_card : undefined,
		msgHash: type?.type === "sent_transaction" ? type.msg_hash : undefined,
		signData: type?.type === "sign_data" ? type.sign_data : undefined,
		target: targetOf(query),
		get answered() {
			return query !== undefined && answered.has(query.id);
		},
		answer(value) {
			return sendAnswer(
				"answer",
				value === undefined ? undefined : (JSON.stringify(value) ?? "null"),
			);
		},
		answerRaw(data) {
			return sendAnswer("answerRaw", data);
		},
		setData(data, explicit) {
			const target = explicit ?? targetOf(query);
			if (!target) {
				throw new WidgetError(
					"WIDGET_NO_TARGET",
					"ctx.widget.setData(): this update has no widget message — pass a target",
				);
			}
			return ctx.api.editMessageWidgetData({
				...targetParams(target),
				...(data.publicData === undefined
					? {}
					: { public_data: slot(data.publicData, "public_data") }),
				...(data.chatData === undefined ? {} : { chat_data: slot(data.chatData, "chat_data") }),
			});
		},
		setSharedData(publicData, options = {}) {
			const widgetId = options.widgetId ?? query?.widget_id;
			if (widgetId === undefined) {
				throw new WidgetError(
					"WIDGET_NO_TARGET",
					"ctx.widget.setSharedData(): this update is not from a shared widget — pass widgetId",
				);
			}
			return ctx.api.editSharedWidgetData({
				widget_id: widgetId,
				public_data: slot(publicData, "public_data"),
				...(options.cacheTime === undefined
					? {}
					: { cache_time: assertCacheTime(options.cacheTime) }),
			});
		},
		skipAutoAnswer() {
			skipped = true;
		},
	};

	return { control, skipped: () => skipped };
}

/**
 * `ctx.widget` on every update, plus an auto-answer for widget queries.
 *
 * ```ts
 * bot.install(widgets()).widgetQuery(vote, async (ctx) => {
 *   const state = tally(ctx.queryData.option);
 *   await ctx.widget.setData({ publicData: votes.encode(state) });
 *   await ctx.widget.answer(state); // the widget's yw.ask() resolves with it
 * });
 * ```
 */
export function widgets(options: WidgetsOptions = {}): Plugin<Context, WidgetsContext> {
	const autoAnswer = options.autoAnswer ?? true;
	const guard = options.guard ?? true;

	return (composer) =>
		composer
			.derive((ctx) => {
				if (guard) guardWidgets(ctx.api);
				const { control, skipped } = controlFor(ctx);
				skips.set(control, skipped);
				return { widget: control };
			})
			.use(async (ctx, next) => {
				await next();

				const control = ctx.widget;
				if (!autoAnswer || !control.query || skips.get(control)?.() || control.answered) return;
				try {
					await control.answerRaw();
				} catch (error) {
					try {
						await options.onError?.(error, ctx);
					} catch {
						// a broken observer must not crash the chain over a best-effort answer
					}
				}
			});
}
