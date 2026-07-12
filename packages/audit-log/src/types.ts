import type { Api, BotPlugin, Context } from "@yaebal/core";
import type { SerializedError } from "./errors.js";
import type { RedactOptions } from "./redact.js";

export type MaybePromise<T> = T | Promise<T>;

/** severity — lets sinks (notably {@link chatSink}) gate on how noisy an event is
 * without parsing `kind`. `"error"`: a handler threw, or an api call failed.
 * `"warn"`: reserved for future use (e.g. a retry). `"info"`: everything else. */
export type AuditLevel = "info" | "warn" | "error";

interface AuditCorrelation {
	/** the `update_id` of the update being handled when this event fired, if any —
	 * `undefined` for calls made outside update handling (`bot.onStart`, a cron job) or
	 * when correlation is off / unavailable. see {@link AuditLogOptions.correlate}. */
	updateId?: number;
	/** a fresh id minted per update, shared by every event that update's handling
	 * produces — the trace key: filter a log by one `correlationId` to see the update
	 * and every api call it made, in order. */
	correlationId?: string;
	chatId?: number;
	userId?: number;
}

/** an incoming update finished middleware processing. */
export interface AuditUpdateEvent extends AuditCorrelation {
	kind: "update";
	level: AuditLevel;
	timestamp: number;
	updateId: number;
	correlationId: string;
	updateType: string;
	durationMs: number;
	/** set when the middleware chain threw; the error still propagates after logging. */
	error?: SerializedError;
	update: unknown;
}

/** an outgoing api call is about to be sent (`api.before`). */
export interface AuditApiCallEvent extends AuditCorrelation {
	kind: "api.call";
	level: AuditLevel;
	timestamp: number;
	/** stable across every retry attempt of this logical call — see {@link
	 * beginCall} in `correlation.ts` for how (and when) it's tracked. */
	callId: string;
	method: string;
	params: Record<string, unknown> | undefined;
	/** 1-based; increments on retry (e.g. via `@yaebal/again`). */
	attempt: number;
}

/** an outgoing api call succeeded (`api.after`). */
export interface AuditApiResultEvent extends AuditCorrelation {
	kind: "api.result";
	level: AuditLevel;
	timestamp: number;
	callId: string;
	method: string;
	params: Record<string, unknown> | undefined;
	result: unknown;
	/** total elapsed time across every attempt of this call. `undefined` when the call's
	 * `params` couldn't be tracked (a no-arg method, or another plugin replaced the
	 * params reference before audit-log's `before` hook saw it). */
	durationMs?: number;
}

/** an outgoing api call threw (`api.onError`). */
export interface AuditApiErrorEvent extends AuditCorrelation {
	kind: "api.error";
	level: AuditLevel;
	timestamp: number;
	callId: string;
	method: string;
	params: Record<string, unknown> | undefined;
	error: SerializedError;
	attempt: number;
	durationMs?: number;
}

/** `bot.start()` resolved (long polling only — webhook deployments never fire this). */
export interface AuditLifecycleStartEvent {
	kind: "bot.start";
	level: AuditLevel;
	timestamp: number;
	info: unknown;
}

/** `bot.stop()` was requested, or polling exited. */
export interface AuditLifecycleStopEvent {
	kind: "bot.stop";
	level: AuditLevel;
	timestamp: number;
}

export type AuditEvent =
	| AuditUpdateEvent
	| AuditApiCallEvent
	| AuditApiResultEvent
	| AuditApiErrorEvent
	| AuditLifecycleStartEvent
	| AuditLifecycleStopEvent;

/** shape an {@link AuditEvent} into whatever a sink actually writes (a string line, a
 * JSON-ready object, a db row, …). */
export type AuditFormatter = (event: AuditEvent) => unknown;

/** a destination for formatted audit entries — console, memory, a file, a log shipper,
 * a db, the bot's own admin chat. an adapter throwing (or rejecting) never breaks
 * request handling — failures go to {@link AuditLogOptions.onError} instead. `event` is
 * the same event `entry` was formatted from, **after** redaction — sinks that read
 * structured fields directly (bypassing `entry`) still get the masked values. */
export interface AuditSink {
	write(entry: unknown, event: AuditEvent): MaybePromise<unknown>;
	/** drain any buffered entries. called by {@link AuditLogger.flush}. */
	flush?(): MaybePromise<unknown>;
}

/** methods excluded from `api.*` logging by default — `getUpdates` fires every poll
 * tick and would otherwise dwarf every other event in the log. */
export const DEFAULT_EXCLUDED_METHODS = ["getUpdates"];

/** running counters exposed via {@link AuditLogger.stats} / `AuditLogPlugin.stats()` —
 * a cheap, dependency-free health signal for {@link auditAdmin} or a status endpoint. */
export interface AuditLoggerStats {
	/** every event handed to `.log()`, before filter/sample. */
	received: number;
	/** dropped by `filter`. */
	filtered: number;
	/** dropped by `sample`. */
	sampledOut: number;
	/** handed to at least one sink's `write()` — fire-and-forget dispatch, not a
	 * confirmed durable write. */
	written: number;
	/** a pipeline stage threw; see {@link AuditLogOptions.onError}. */
	errors: Record<AuditLogErrorStage, number>;
}

/** which pipeline stage a {@link AuditLogOptions.onError} report came from. */
export type AuditLogErrorStage = "filter" | "sample" | "redact" | "format" | "sink" | "flush";

export interface AuditLogOptions {
	/** where formatted entries go. defaults to a single {@link consoleSink}. an empty
	 * array is rejected at construction — that's a silent no-op plugin, not a valid
	 * config; omit `sinks` for the default, or pass `[consoleSink()]` explicitly. */
	sinks?: AuditSink | AuditSink[];
	/** shape events before they reach a sink. defaults to {@link jsonFormatter}. */
	formatter?: AuditFormatter;
	/** drop events this returns `false` for — runs before sampling, on the raw
	 * (pre-redaction) event. */
	filter?: (event: AuditEvent) => boolean;
	/**
	 * fraction of matching events actually written, `0`–`1` (default `1`, i.e. no
	 * sampling). a function can vary the rate per event — e.g. always keep errors but
	 * sample successful calls: `(e) => (e.kind === "api.error" ? 1 : 0.1)`.
	 */
	sample?: number | ((event: AuditEvent) => number);
	/**
	 * make sampling deterministic instead of random — events that share a key (e.g. the
	 * same chat) are kept or dropped together, so a trace never gets cut mid-update.
	 * `undefined` falls back to `random()` per event (the default). a key with no value
	 * for a given event (e.g. `chatId` on a `bot.start` event) also falls back to
	 * `random()` for that one event. see {@link byChatId}.
	 */
	sampleKey?: (event: AuditEvent) => string | number | undefined;
	/** mask secrets, message text (opt in via `paths`), long strings, and binary media
	 * buffers before an event reaches any sink. secure by default — pass `false` to
	 * disable outright. */
	redact?: RedactOptions | false;
	/** a pipeline stage threw (or a sink rejected) — observe it here. never breaks
	 * request handling either way. mirrors `AnalyticsOptions.onError`. */
	onError?: (error: unknown, event: AuditEvent, stage: AuditLogErrorStage) => unknown;
	/** log incoming updates via middleware. default `true`. */
	logUpdates?: boolean;
	/** log outgoing calls via `api.before`. default `true`. */
	logApiCalls?: boolean;
	/** log successful outgoing calls via `api.after`. default `true`. */
	logApiResults?: boolean;
	/** log failed outgoing calls via `api.onError`. default `true`. */
	logApiErrors?: boolean;
	/** log `bot.start`/`bot.stop` when the install target exposes `onStart`/`onStop`
	 * (a real `Bot`). default `true`. */
	logLifecycle?: boolean;
	/** api methods excluded from `api.*` logging. a trailing `*` matches by prefix (e.g.
	 * `"send*"`). default {@link DEFAULT_EXCLUDED_METHODS}. */
	excludedMethods?: readonly string[];
	/** if set, only these methods (same `"send*"` prefix syntax) are logged — applied
	 * after `excludedMethods`. default: every method not excluded. */
	includeMethods?: readonly string[];
	/** correlate every `api.*` event with the update that triggered it (`updateId`,
	 * `correlationId`, `chatId`, `userId`), via `node:async_hooks`. default `true`;
	 * degrades to `undefined` correlation fields (never throws) on a runtime without
	 * `AsyncLocalStorage`. */
	correlate?: boolean;
	/** await `flush()` automatically when the install target exposes `onStop` (a real
	 * `Bot`) — no more forgetting `bot.onStop(() => plugin.flush())`. default `true`. */
	autoFlush?: boolean;
	/** injected clock, mainly for tests. */
	now?: () => number;
	/** injected RNG for {@link AuditLogOptions.sample}, mainly for tests. */
	random?: () => number;
}

/** a standalone collection point: format + filter + sample + redact + fan out to every
 * sink, independent of any bot. used internally by {@link auditLog}; exported for
 * callers that want to feed events from outside the api/middleware hooks. */
export interface AuditLogger {
	log(event: AuditEvent): void;
	/** await every sink's {@link AuditSink.flush}, plus any writes still in flight. */
	flush(): Promise<void>;
	/** a snapshot of running counters — see {@link AuditLoggerStats}. */
	stats(): AuditLoggerStats;
}

/** the subset of `Bot` the installer needs — `use` for incoming updates, `api` for
 * outgoing calls. kept structural so it works on any `Bot<C>` (or a hand-built
 * `{ use, api }` pair, e.g. in tests) without importing the concrete class.
 * `onStart`/`onStop` are feature-detected when present (a real `Bot`) for lifecycle
 * events and {@link AuditLogOptions.autoFlush} — neither is required. */
export interface AuditTarget<C extends Context = Context> {
	use(...middleware: ((ctx: C, next: () => Promise<void>) => unknown)[]): unknown;
	api: Api;
	onStart?(handler: (info: unknown) => unknown): unknown;
	onStop?(handler: () => unknown): unknown;
}

/** a handle returned by the direct-install form (`auditLog(target, options)`). */
export interface AuditLogHandle {
	/** await every sink's {@link AuditSink.flush}. */
	flush(): Promise<void>;
	/** a snapshot of running counters — see {@link AuditLoggerStats}. */
	stats(): AuditLoggerStats;
}

/** the plugin function plus `flush()`/`stats()` for graceful shutdown and observability. */
export type AuditLogPlugin<In extends Context = Context> = BotPlugin<In> & {
	/** await every sink's {@link AuditSink.flush}. call it from `bot.onStop` — or don't:
	 * {@link AuditLogOptions.autoFlush} does this for you when the install target is a
	 * real `Bot`. */
	flush(): Promise<void>;
	/** a snapshot of running counters — see {@link AuditLoggerStats}. */
	stats(): AuditLoggerStats;
};
