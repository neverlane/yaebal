import type { Composer, Context, Plugin } from "@yaebal/core";
import { autoCaptureMiddleware } from "./auto-capture.js";
import { createAnalytics as createAnalyticsImpl } from "./client.js";
import type { Analytics, AnalyticsControl, AnalyticsOptions, EventsCatalog } from "./types.js";

export {
	type ClickHouseAdapterOptions,
	type ClickHouseLike,
	clickhouseAdapter,
	clickhouseSchema,
	consoleAdapter,
	type HttpAdapterOptions,
	httpAdapter,
	type MemoryAdapter,
	memoryAdapter,
	type PlausibleAdapterOptions,
	type PostHogAdapterOptions,
	type PostHogLike,
	plausibleAdapter,
	postHogAdapter,
	type SqliteAdapterOptions,
	type SqliteLike,
	sqliteAdapter,
	sqliteSchema,
} from "./adapters/index.js";
export { type AnalyticsAdminOptions, analyticsAdmin } from "./admin.js";
export { autoCaptureMiddleware } from "./auto-capture.js";
export type { Batched, BatchedOptions, DropReason } from "./batched.js";
export { batched } from "./batched.js";
export { type PropsField, p, validateCatalog } from "./catalog.js";
export { createAnalytics, fromEvent } from "./client.js";
export type {
	Analytics,
	AnalyticsAdapter,
	AnalyticsControl,
	AnalyticsEvent,
	AnalyticsOptions,
	AnalyticsQuery,
	AnalyticsReport,
	Anonymize,
	AutoTrackKind,
	EventDef,
	EventKeys,
	EventProps,
	EventsCatalog,
	MaybePromise,
	PropsSchema,
	PropsShape,
	TrackArgs,
	TrackCall,
	TrackInput,
} from "./types.js";

/** the plugin function plus adapter controls. */
export type AnalyticsPlugin<C extends EventsCatalog = EventsCatalog> = Plugin<
	Context,
	AnalyticsControl<C>
> & {
	/**
	 * drain every adapter's buffer now. auto-wired to `bot.onStop` when `analytics()` is installed
	 * on a `Bot` (detected structurally, so this works whether you import `Bot` from
	 * `@yaebal/core` directly or a subclass) — `bot.stop()` won't resolve until it completes, so
	 * a buffered adapter's partial batch (see `clickhouseAdapter`) is never lost on shutdown.
	 * still exposed for manual wiring on a bare `Composer`, or a webhook/serverless deployment
	 * where `bot.onStop` never fires.
	 */
	flush(): Promise<void>;
};

/** the `Bot` surface auto-flush needs — kept structural so this package takes no dependency on
 * `Bot` itself (mirrors `@yaebal/toml`'s `isBotLike`). */
interface StoppableBot {
	onStop(handler: () => unknown): unknown;
}

function isStoppableBot(target: object): target is StoppableBot {
	return typeof (target as Partial<StoppableBot>).onStop === "function";
}

function isAnalyticsClient<C extends EventsCatalog>(
	source: AnalyticsOptions<C> | Analytics<C>,
): source is Analytics<C> {
	return typeof (source as Partial<Analytics<C>>).track === "function";
}

/**
 * install `ctx.track(name, properties?)` / `ctx.identify(properties)` on the bot, backed by
 * `source` (an `AnalyticsOptions` config, or a client already built with `createAnalytics` — see
 * "a unified collection point" in the README for why you'd share one).
 *
 * ```ts
 * const bot = new Bot(token).install(
 *   analytics({
 *     events: { purchase: { props: p.object({ amount: p.number() }) } },
 *     adapters: [consoleAdapter()],
 *     autoTrack: ["commands"],
 *   }),
 * );
 *
 * bot.command("buy", (ctx) => {
 *   ctx.track("purchase", { amount: 9 }); // name + props type-checked against `events`
 *   return ctx.reply("thanks!");
 * });
 * ```
 */
export function analytics<const C extends EventsCatalog = EventsCatalog>(
	source: AnalyticsOptions<C> | Analytics<C>,
): AnalyticsPlugin<C> {
	const client = isAnalyticsClient(source) ? source : createAnalyticsImpl(source);
	const getContext = isAnalyticsClient(source) ? undefined : source.context;
	const autoTrack = isAnalyticsClient(source) ? undefined : source.autoTrack;

	const plugin = ((composer: Composer<Context>) => {
		if (isStoppableBot(composer)) {
			// bot.stop() awaits every onStop handler in order (see @yaebal/core's #runStopHandlers),
			// so returning the flush promise here — not firing it and forgetting — is what makes
			// "bot.stop() won't resolve until buffered events are drained" true. flush() itself never
			// rejects (its own adapter failures route through onError), so there's nothing to catch.
			composer.onStop(() => client.flush());
		}

		let next = composer.derive(async (ctx) => {
			const extra = getContext ? await getContext(ctx) : undefined;
			const userId = ctx.from?.id;
			const chatId = ctx.chat?.id;

			const control: AnalyticsControl<C> = {
				track: ((name: string, properties?: Record<string, unknown>) => {
					// the catalog's per-event `K` isn't known at this generic call site (the caller's
					// literal event name only exists inside their own `ctx.track("...")` call, already
					// type-checked there against `EventKeys<C>`/`TrackArgs<C, K>`) — this cast is the one
					// place that type-level guarantee is trusted rather than re-proven structurally.
					client.track({
						name,
						properties: extra ? { ...extra, ...properties } : properties,
						userId,
						chatId,
					} as never);
				}) as AnalyticsControl<C>["track"],
				identify(properties) {
					// nothing to identify without a user — see AnalyticsControl.identify
					if (userId !== undefined) client.identify(String(userId), properties);
				},
			};

			return control;
		});

		if (autoTrack && autoTrack.length > 0) {
			next = next.use(autoCaptureMiddleware(autoTrack));
		}

		return next;
	}) as AnalyticsPlugin<C>;

	plugin.flush = () => client.flush();

	return plugin;
}
