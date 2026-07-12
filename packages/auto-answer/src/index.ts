import type { Api, CallbackQuery, Context, Plugin } from "@yaebal/core";

/** the context a callback-query update carries — narrowed like `on("callback_query")` would. */
export type CallbackContext = Context & { callbackQuery: CallbackQuery };

export interface AutoAnswerParams {
	text?: string;
	showAlert?: boolean;
	url?: string;
	cacheTime?: number;
}

export type AutoAnswerMode = "deadline" | "deferred" | "immediate";

export interface AutoAnswerOptions {
	/**
	 * `"deadline"` (default): race the handler chain against a timer (`timeout`). a handler that
	 * answers first — with its own text/alert — always wins; if nothing answers before the timer
	 * fires, the plugin fills the gap with an empty ack. best of both other modes: alerts work,
	 * and the spinner never outlives `timeout`.
	 *
	 * `"deferred"`: wait for the whole handler chain to finish (however long that takes) and only
	 * answer if nothing already did — no timer, no risk of an answer racing a slow handler, but a
	 * hung or truly slow handler leaves the spinner spinning for as long as it takes.
	 *
	 * `"immediate"`: answer the instant the update arrives, before any handler runs — zero added
	 * latency, but a handler's own `ctx.answerCallbackQuery(...)` (its alert, its url) can no
	 * longer win the race and reliably fails against Telegram instead. only reach for this if no
	 * handler downstream ever answers its own callback queries.
	 */
	mode?: AutoAnswerMode;
	/** how long `"deadline"` waits for the handler chain before answering on its own. default `1500`ms. */
	timeout?: number;
	/** static params, or computed per update (sync or async). */
	params?:
		| AutoAnswerParams
		| ((
				ctx: CallbackContext,
		  ) => AutoAnswerParams | undefined | Promise<AutoAnswerParams | undefined>);
	/** skip auto-answering this update — e.g. let another plugin answer it its own way. */
	filter?: (ctx: CallbackContext) => boolean | Promise<boolean>;
	/** observe every answer this plugin actually sent. */
	onAnswer?: (ctx: CallbackContext) => unknown;
	/**
	 * observe a failed auto-answer (Telegram's "query is too old", a dropped connection, a
	 * throwing `filter`/`params`, …). the error is always swallowed — an auto-answer plugin must
	 * never crash the chain over a best-effort spinner clear.
	 */
	onError?: (error: unknown, ctx: CallbackContext) => unknown;
}

/** added to every context: opt a specific update out of auto-answering from inside a handler. */
export interface AutoAnswerContext {
	/**
	 * skip auto-answering the current callback query — e.g. a handler that will answer later
	 * itself, asynchronously, outside the normal chain (a queued job, a webhook callback).
	 * a no-op outside a `callback_query` update.
	 */
	skipAutoAnswer(): void;
}

const DEFAULT_TIMEOUT_MS = 1500;
/** bounds the per-`Api` tracker so a long-lived bot can't leak memory over millions of queries. */
const TRACKER_CAP = 2048;

/**
 * one dispatch-time tracker per `Api` instance, keyed by `callback_query_id` — the single source
 * of truth for "did anything already answer this query". two complementary writers keep it
 * accurate:
 *
 * - the ergonomic path (`ctx.answerCallbackQuery`, shadowed below) marks **synchronously**, before
 *   the network call even starts. that matters because an `await` — even on an already-settled,
 *   non-promise value, as a hook return is — always costs a microtask; two calls issued back to
 *   back in the same synchronous tick (this plugin's own `"immediate"`/`"deadline"` fire racing a
 *   handler's manual answer, both started before either's own `before` hook has had a chance to
 *   run) would otherwise both see "not answered yet" and both go out.
 * - `api.before` marks on every `answerCallbackQuery` dispatch regardless of path, as a backstop
 *   for calls that skip the shadow entirely — a rich `contextFor("callback_query", ...).answer()`,
 *   or a raw `ctx.api.call("answerCallbackQuery", ...)`. this one *is* async (a real microtask
 *   behind it), so it only reliably catches calls that landed strictly before whatever checks the
 *   tracker next — true for `"deferred"`/`"deadline"`'s fallback (which waits for the whole handler
 *   chain first) but not for two calls racing in the same tick.
 *
 * marking (either path) happens before the network round trip resolves, not after — so a
 * concurrent fallback always sees the winner immediately. the trade-off: if the winning call
 * itself fails at the network layer, the id stays marked "answered" and no fallback retries —
 * accepted, since retrying blind into a possibly-already-delivered answer is the worse failure mode.
 */
const trackers = new WeakMap<Api, Set<string>>();

function markAnswered(ids: Set<string>, id: string): void {
	if (!ids.has(id) && ids.size >= TRACKER_CAP) {
		const oldest = ids.values().next().value;
		if (oldest !== undefined) ids.delete(oldest);
	}

	ids.add(id);
}

function tracker(api: Api): Set<string> {
	let ids = trackers.get(api);
	if (ids) return ids;

	ids = new Set();
	trackers.set(api, ids);

	const store = ids;
	api.before((method, params) => {
		if (method !== "answerCallbackQuery") return;

		const id = params?.callback_query_id;
		if (typeof id !== "string") return;

		markAnswered(store, id);
	});

	return ids;
}

function toApiParams(params: AutoAnswerParams | undefined): Record<string, unknown> {
	if (!params) return {};

	const out: Record<string, unknown> = {};
	if (params.text !== undefined) out.text = params.text;
	if (params.showAlert !== undefined) out.show_alert = params.showAlert;
	if (params.url !== undefined) out.url = params.url;
	if (params.cacheTime !== undefined) out.cache_time = params.cacheTime;

	return out;
}

/** run an observability hook without ever letting it crash the chain or masquerade as a failed answer. */
async function safe(fn: (() => unknown) | undefined): Promise<void> {
	if (!fn) return;

	try {
		await fn();
	} catch {
		// a broken onAnswer/onError is a bug in the caller's own callback, not this plugin's problem —
		// swallow it the same way a broken analytics call shouldn't take down the request it's watching.
	}
}

/** auto-answer every `callback_query`, clearing the client's loading spinner with no manual call. */
export function autoAnswer(options: AutoAnswerOptions = {}): Plugin<Context, AutoAnswerContext> {
	const mode = options.mode ?? "deadline";
	const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

	const plugin: Plugin<Context, AutoAnswerContext> = (composer) =>
		composer
			.decorate<AutoAnswerContext>({ skipAutoAnswer() {} })
			.on("callback_query", async (ctx, next) => {
				const id = ctx.callbackQuery.id;
				const answered = tracker(ctx.api);

				let skipped = false;
				ctx.skipAutoAnswer = () => {
					skipped = true;
				};

				// shadow the ergonomic path with a synchronous check-and-mark: whichever call — this
				// plugin's own fallback, or a handler's manual answer — reaches this line first wins,
				// and every later one (in the same tick or not) becomes a safe no-op instead of a
				// second network call racing the first to a Telegram "query is too old" rejection.
				const originalAnswer = ctx.answerCallbackQuery.bind(ctx);
				ctx.answerCallbackQuery = (extra) => {
					if (answered.has(id)) return Promise.resolve(false);
					markAnswered(answered, id);
					return originalAnswer(extra);
				};

				const fire = async (): Promise<void> => {
					try {
						if (skipped || answered.has(id)) return;

						if (options.filter && !(await options.filter(ctx))) return;
						// the filter may have awaited long enough for something else to answer meanwhile.
						if (skipped || answered.has(id)) return;

						const params =
							typeof options.params === "function" ? await options.params(ctx) : options.params;
						// same race, on the other side of the `params` await.
						if (skipped || answered.has(id)) return;

						await ctx.answerCallbackQuery(toApiParams(params));
						await safe(() => options.onAnswer?.(ctx));
					} catch (error) {
						await safe(() => options.onError?.(error, ctx));
					}
				};

				if (mode === "immediate") {
					void fire();
					await next();
					return;
				}

				if (mode === "deferred") {
					try {
						await next();
					} finally {
						await fire();
					}
					return;
				}

				// "deadline": race the handler chain against a timer; whichever answers first wins.
				let settled = false;
				const once = (): Promise<void> => {
					if (settled) return Promise.resolve();
					settled = true;
					return fire();
				};

				const timer = setTimeout(() => void once(), timeout);
				try {
					await next();
				} finally {
					clearTimeout(timer);
					await once();
				}
			});

	return plugin;
}
