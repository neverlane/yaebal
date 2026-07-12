import type { Context } from "@yaebal/core";

export type MaybePromise<T> = T | Promise<T>;

/** a single tracked event, after `userId`/`chatId` have been resolved from `ctx` (or passed
 * explicitly to a standalone {@link Analytics} client) and every privacy transform has run. this
 * is what adapters actually receive — always epoch milliseconds, always plain JSON-safe values. */
export interface AnalyticsEvent {
	name: string;
	properties?: Record<string, unknown>;
	/** the caller's raw telegram id, or its {@link AnalyticsOptions.anonymize}d replacement if one
	 * was configured — adapters only ever see the post-anonymize value. */
	userId?: number | string;
	chatId?: number | string;
	timestamp: number;
}

/** what callers pass to a standalone {@link Analytics} client's `track` — `timestamp` is filled
 * in for them, and `userId`/`chatId` are always the RAW telegram id (anonymization, if any, is
 * applied internally before adapters see the resulting {@link AnalyticsEvent}). `ctx.track` (the
 * plugin's `AnalyticsControl`) skips `userId`/`chatId` since those come from `ctx.from`/`ctx.chat`. */
export interface TrackInput {
	name: string;
	properties?: Record<string, unknown>;
	userId?: number;
	chatId?: number;
}

// ── typed event catalog ─────────────────────────────────────────────────────────────────────

export type PropsShape = Record<string, unknown>;

/**
 * a runtime validator for one event's properties, carrying its TS shape `P` at the type level
 * (via the phantom `~props`, never present at runtime — same trick as `Filter["~adds"]` in
 * `@yaebal/core`). build one with {@link p}`.object({ ... })`, not by hand.
 */
export interface PropsSchema<P extends PropsShape = PropsShape> {
	/** throws a `TypeError` if `value` doesn't match the schema; otherwise returns the coerced,
	 * unknown-key-stripped object adapters will see. */
	parse(value: Record<string, unknown>): P;
	readonly "~props"?: P;
}

/** one event in a catalog: its property schema (omit for "any properties, untyped"), and
 * per-event overrides for the client's global sampling/redaction. */
export interface EventDef<P extends PropsShape = PropsShape> {
	/** validates/types this event's `properties`. omit to accept anything (untyped, like the
	 * bare `true` shorthand). */
	props?: PropsSchema<P>;
	/** fraction of calls that reach adapters (0-1). overrides {@link AnalyticsOptions.sample} for
	 * this event only — e.g. sample a noisy `message_received` at 0.1 while keeping `purchase` at 1. */
	sample?: number;
	/** property keys stripped before adapters see this event. merges with the client's global
	 * {@link AnalyticsOptions.redact}. */
	redact?: (keyof P & string)[];
	/** free-text note shown in `analyticsAdmin()`'s catalog listing and docs generation. */
	description?: string;
}

/** an event catalog entry: `true` (declared, untyped — like a plain boolean flag in
 * `@yaebal/feature-flags`) or a full {@link EventDef}. */
// biome-ignore lint/suspicious/noExplicitAny: a catalog mixes events of unrelated props shapes
export type EventsCatalog = Record<string, EventDef<any> | true>;

/** the event names declared in `C` — `string` when no catalog was given (untyped mode), the
 * literal union of keys when one was. */
export type EventKeys<C extends EventsCatalog> = Extract<keyof C, string>;

/** the properties type for event `K` in catalog `C` — inferred from its {@link PropsSchema}, or
 * `Record<string, unknown>` for a `true`/schema-less entry (and for untyped mode, where `C` is
 * the bare `EventsCatalog` index signature rather than a literal object). the `[C[K]]` tuple
 * wrap suppresses conditional-type distribution over the `EventDef<any> | true` union so the
 * untyped fallback doesn't collapse to `any`. */
export type EventProps<C extends EventsCatalog, K extends EventKeys<C>> = [C[K]] extends [
	EventDef<infer P>,
]
	? P
	: Record<string, unknown>;

/** whether `properties` may be omitted for a `EventProps<C, K>` shape — true for the untyped
 * fallback (`Record<string, unknown>`) and for a schema with no fields, false once the schema
 * declares at least one property (so a typo'd required prop is a compile error, not a runtime
 * surprise). */
type PropsOptional<P> =
	Record<string, unknown> extends P ? true : keyof P extends never ? true : false;

/** the trailing args `ctx.track(name, ...)`/standalone `track(name, ...)` accepts for event `K` —
 * `properties` is required exactly when the catalog gave `K` a non-empty schema. */
export type TrackArgs<C extends EventsCatalog, K extends EventKeys<C>> =
	PropsOptional<EventProps<C, K>> extends true
		? [properties?: EventProps<C, K>]
		: [properties: EventProps<C, K>];

/** the object form a standalone {@link Analytics} client's `track` accepts — same required/optional
 * `properties` rule as {@link TrackArgs}, plus the `userId`/`chatId` a `ctx` would otherwise supply. */
export type TrackCall<C extends EventsCatalog, K extends EventKeys<C>> = {
	name: K;
	userId?: number;
	chatId?: number;
} & (PropsOptional<EventProps<C, K>> extends true
	? { properties?: EventProps<C, K> }
	: { properties: EventProps<C, K> });

// ── adapters ─────────────────────────────────────────────────────────────────────────────────

/**
 * a sink events are forwarded to. adapters take an already-constructed client and type it
 * structurally (see `postHogAdapter`, `sqliteAdapter`) so this package never dictates a driver
 * version or adds one as a dependency.
 */
export interface AnalyticsAdapter {
	track(event: AnalyticsEvent): MaybePromise<unknown>;
	/** attach person-level properties to a user, independent of any single event (e.g. PostHog's
	 * `identify`). adapters that have no such concept simply omit this. */
	identify?(id: string, properties: Record<string, unknown>): MaybePromise<unknown>;
	/** drain any buffered events. wired to `bot.onStop` automatically when `analytics()` is
	 * installed on a `Bot` (see {@link AnalyticsPlugin.flush}); call it yourself on a bare
	 * `Composer` or before shutdown in a standalone {@link Analytics} client. */
	flush?(): MaybePromise<unknown>;
	/** answer an aggregate query over stored events — powers `analyticsAdmin()`. adapters with no
	 * queryable store (posthog, plausible, a plain console log) omit this. */
	query?(query: AnalyticsQuery): Promise<AnalyticsReport>;
}

export interface AnalyticsQuery {
	/** only count events at/after this epoch-ms timestamp. */
	since: number;
	/** cap on how many distinct event names {@link AnalyticsReport.topEvents} returns, ranked by
	 * count descending. defaults to `10`. */
	limit?: number;
}

export interface AnalyticsReport {
	/** total events counted in the window. */
	total: number;
	/** distinct event names in the window, ranked by count descending. */
	topEvents: { name: string; count: number }[];
}

// ── privacy ──────────────────────────────────────────────────────────────────────────────────

/** how {@link AnalyticsOptions.anonymize} replaces a `userId`/`chatId` before adapters see it.
 * `"hash"` runs a fast non-cryptographic hash (fnv-1a) — stable per id (so funnels still group
 * correctly) and not reversible by casual inspection, but NOT a security control; a determined
 * party can still brute-force small id spaces. use a custom function (e.g. HMAC with a secret)
 * for anything stronger. */
export type Anonymize = "hash" | ((id: number, kind: "user" | "chat") => string | number);

// ── client & plugin surface ─────────────────────────────────────────────────────────────────

export interface AnalyticsOptions<C extends EventsCatalog = EventsCatalog> {
	/** the event catalog: event names and their property schemas (via `p.object({...})`), or
	 * `true` for a declared-but-untyped event. omit entirely to keep `ctx.track(name, properties?)`
	 * fully untyped, same as `@yaebal/analytics@0.0.x`. */
	events?: C;
	adapters: AnalyticsAdapter[];
	/** an adapter throwing (or rejecting) never breaks tracking — observe failures here. `onError`
	 * itself is never allowed to break tracking either: if it throws, the error is swallowed after
	 * one `console.warn` rather than propagating out of `ctx.track()`/`flush()`. */
	onError?: (error: unknown, event: AnalyticsEvent) => unknown;
	/** clock override, mainly for tests. */
	now?: () => number;
	/** fraction of tracked calls that reach adapters, 0-1. deterministic per call (not per user) —
	 * this is load-shedding, not a stable per-user rollout like `@yaebal/feature-flags`' `percentage`.
	 * a catalog entry's own {@link EventDef.sample} overrides this for that event. defaults to `1`
	 * (no sampling). */
	sample?: number;
	/** consulted before sampling/tracking, with the RAW `userId`/`chatId` (before {@link
	 * AnalyticsOptions.anonymize} runs, so an opt-out list keyed by real telegram ids still works)
	 * — return `false` to skip (consent/opt-out). a throwing or rejecting predicate is treated as
	 * `true` (fail-open), so a buggy check never silently blackholes every event. */
	shouldTrack?: (event: AnalyticsEvent) => MaybePromise<boolean>;
	/** replace `userId`/`chatId` with an anonymized id before adapters see them. see {@link Anonymize}. */
	anonymize?: Anonymize;
	/** property keys stripped from every event before adapters see it, on top of any per-event
	 * {@link EventDef.redact}. */
	redact?: string[];
	/** derive extra properties merged onto every event tracked through `ctx.track` (e.g. language,
	 * chat type, A/B bucket). only consulted by the `analytics()` plugin — `createAnalytics()`'s
	 * standalone client has no `ctx` to call it with. */
	context?: (ctx: Context) => MaybePromise<Record<string, unknown>>;
	/** auto-emit events for common update kinds with no manual `ctx.track` call — see
	 * `autoTrack()` in `auto-capture.ts`. only consulted by the `analytics()` plugin. */
	autoTrack?: AutoTrackKind[];
}

/** update kinds `AnalyticsOptions.autoTrack` can auto-emit: a fixed event name per kind
 * (`"command_used"`, `"callback_query"`, `"message_received"`) with the dynamic bit (command
 * name, callback data, message content type) carried as a *property*, not baked into the event
 * name — an event name per distinct callback payload would blow up adapters' event schemas
 * (posthog/plausible/your own SQL all key funnels off the event name). */
export type AutoTrackKind = "commands" | "callback_queries" | "messages";

/** what `analytics()` adds to `ctx`. */
export interface AnalyticsControl<C extends EventsCatalog = EventsCatalog> {
	track<K extends EventKeys<C>>(name: K, ...args: TrackArgs<C, K>): void;
	/** attach person-level properties to the current update's user (`ctx.from.id`) — forwarded to
	 * every adapter's `identify`. no-op (and never queued) if there's no `ctx.from`. */
	identify(properties: Record<string, unknown>): void;
}

/** a standalone collection point: fan out `track()`/`identify()` calls to every configured
 * adapter, independent of any bot or `ctx`. */
export interface Analytics<C extends EventsCatalog = EventsCatalog> {
	track<K extends EventKeys<C>>(input: TrackCall<C, K>): void;
	identify(id: string, properties: Record<string, unknown>): void;
	/** await every adapter's `flush`, plus every still-in-flight `track`/`identify` call. */
	flush(): Promise<void>;
}
