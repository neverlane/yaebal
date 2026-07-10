import type { CallbackQuery, Context, Plugin } from "@yaebal/core";

/** the context a callback-query update carries — narrowed like `on("callback_query")` would. */
export type CallbackContext = Context & { callbackQuery: CallbackQuery };

export interface AutoAnswerParams {
	text?: string;
	showAlert?: boolean;
	url?: string;
	cacheTime?: number;
}

export type AutoAnswerMode = "immediate" | "deferred";

export interface AutoAnswerOptions {
	/**
	 * `"immediate"` (default): answer the instant the update arrives, before handlers run —
	 * the client's loading spinner clears with no added latency. `"deferred"`: wait for the
	 * whole handler chain to finish and only answer if nothing already did, so a handler's
	 * own `ctx.answerCallbackQuery(...)` (its own text/alert) always wins.
	 */
	mode?: AutoAnswerMode;
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
	 * observe a failed auto-answer (Telegram's "query is too old", a dropped connection, …).
	 * the error is always swallowed — an auto-answer plugin must never crash the chain over a
	 * best-effort spinner clear.
	 */
	onError?: (error: unknown, ctx: CallbackContext) => unknown;
}

const ANSWERED = Symbol("yaebal.auto-answer.answered");

interface AnsweredMarker {
	[ANSWERED]?: boolean;
}

function isAnswered(ctx: CallbackContext): boolean {
	return (ctx as CallbackContext & AnsweredMarker)[ANSWERED] === true;
}

function markAnswered(ctx: CallbackContext): void {
	(ctx as CallbackContext & AnsweredMarker)[ANSWERED] = true;
}

/**
 * shadow `ctx.answerCallbackQuery` with an instance override that flags a manual answer, so
 * `"deferred"` mode (and a late-arriving `"immediate"` fire) can tell it already happened and
 * back off instead of double-answering.
 */
function trackManualAnswers(ctx: CallbackContext): void {
	const original = ctx.answerCallbackQuery.bind(ctx);

	ctx.answerCallbackQuery = (extra) => {
		markAnswered(ctx);
		return original(extra);
	};
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

async function fireAnswer(ctx: CallbackContext, options: AutoAnswerOptions): Promise<void> {
	try {
		if (isAnswered(ctx)) return;
		if (options.filter && !(await options.filter(ctx))) return;
		// the filter may have awaited long enough for a manual answer to land in the meantime.
		if (isAnswered(ctx)) return;

		markAnswered(ctx);

		const params =
			typeof options.params === "function" ? await options.params(ctx) : options.params;
		await ctx.answerCallbackQuery(toApiParams(params));
		await options.onAnswer?.(ctx);
	} catch (error) {
		await options.onError?.(error, ctx);
	}
}

/** auto-answer every `callback_query`, clearing the client's loading spinner with no manual call. */
export function autoAnswer(options: AutoAnswerOptions = {}): Plugin<Context, Record<never, never>> {
	const mode = options.mode ?? "immediate";

	const plugin: Plugin<Context, Record<never, never>> = (composer) =>
		composer.on("callback_query", async (ctx, next) => {
			trackManualAnswers(ctx);

			if (mode === "immediate") {
				void fireAnswer(ctx, options);
				await next();
				return;
			}

			await next();
			await fireAnswer(ctx, options);
		});

	return plugin;
}
