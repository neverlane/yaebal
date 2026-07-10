import type { Api, BotPlugin, Context } from "@yaebal/core";

export type MaybePromise<T> = T | Promise<T>;

/** an incoming update finished middleware processing. */
export interface AuditUpdateEvent {
	kind: "update";
	timestamp: number;
	updateId: number;
	updateType: string;
	chatId?: number;
	userId?: number;
	durationMs: number;
	/** set when the middleware chain threw; the error still propagates after logging. */
	error?: unknown;
	update: unknown;
}

/** an outgoing api call is about to be sent (`api.before`). */
export interface AuditApiCallEvent {
	kind: "api.call";
	timestamp: number;
	method: string;
	params: Record<string, unknown> | undefined;
}

/** an outgoing api call succeeded (`api.after`). */
export interface AuditApiResultEvent {
	kind: "api.result";
	timestamp: number;
	method: string;
	params: Record<string, unknown> | undefined;
	result: unknown;
}

/** an outgoing api call threw (`api.onError`). */
export interface AuditApiErrorEvent {
	kind: "api.error";
	timestamp: number;
	method: string;
	params: Record<string, unknown> | undefined;
	error: unknown;
	attempt: number;
}

export type AuditEvent =
	| AuditUpdateEvent
	| AuditApiCallEvent
	| AuditApiResultEvent
	| AuditApiErrorEvent;

/** shape an {@link AuditEvent} into whatever a sink actually writes (a string line, a
 * JSON-ready object, a db row, …). */
export type AuditFormatter = (event: AuditEvent) => unknown;

/** a destination for formatted audit entries — console, file, a log shipper, a db. an
 * adapter throwing (or rejecting) never breaks request handling. */
export interface AuditSink {
	write(entry: unknown, event: AuditEvent): MaybePromise<unknown>;
	/** drain any buffered entries. called by {@link AuditLogPlugin.flush}. */
	flush?(): MaybePromise<unknown>;
}

/** methods excluded from `api.*` logging by default — `getUpdates` fires every poll
 * tick and would otherwise dwarf every other event in the log. */
export const DEFAULT_EXCLUDED_METHODS = ["getUpdates"];

export interface AuditLogOptions {
	/** where formatted entries go. defaults to a single {@link consoleSink}. */
	sinks?: AuditSink | AuditSink[];
	/** shape events before they reach a sink. defaults to {@link jsonFormatter}. */
	formatter?: AuditFormatter;
	/** drop events this returns `false` for — runs before sampling. */
	filter?: (event: AuditEvent) => boolean;
	/**
	 * fraction of matching events actually written, `0`–`1` (default `1`, i.e. no
	 * sampling). a function can vary the rate per event — e.g. always keep errors but
	 * sample successful calls: `(e) => (e.kind === "api.error" ? 1 : 0.1)`.
	 */
	sample?: number | ((event: AuditEvent) => number);
	/** log incoming updates via middleware. default `true`. */
	logUpdates?: boolean;
	/** log outgoing calls via `api.before`. default `true`. */
	logApiCalls?: boolean;
	/** log successful outgoing calls via `api.after`. default `true`. */
	logApiResults?: boolean;
	/** log failed outgoing calls via `api.onError`. default `true`. */
	logApiErrors?: boolean;
	/** api methods excluded from `api.*` logging. default {@link DEFAULT_EXCLUDED_METHODS}. */
	excludedMethods?: readonly string[];
	/** a sink threw — observe it here. never breaks request handling either way. */
	onSinkError?: (error: unknown, event: AuditEvent) => unknown;
	/** injected clock, mainly for tests. */
	now?: () => number;
	/** injected RNG for {@link AuditLogOptions.sample}, mainly for tests. */
	random?: () => number;
}

/** the plugin function plus a `flush()` for graceful shutdown. */
export type AuditLogPlugin<In extends Context = Context> = BotPlugin<In> & {
	/** await every sink's {@link AuditSink.flush}. call it from `bot.onStop`. */
	flush(): Promise<void>;
};

/** the structured default: pass the event through as-is (sinks that serialize to JSON,
 * ship to a log aggregator, or write db rows want the raw fields). */
export function jsonFormatter(event: AuditEvent): AuditEvent {
	return event;
}

/** a human-readable single line, e.g. for {@link consoleSink} in local dev. */
export function textFormatter(event: AuditEvent): string {
	const at = new Date(event.timestamp).toISOString();

	switch (event.kind) {
		case "update": {
			const chat = event.chatId !== undefined ? ` chat=${event.chatId}` : "";
			const user = event.userId !== undefined ? ` user=${event.userId}` : "";
			const err = event.error !== undefined ? ` error=${describeError(event.error)}` : "";
			return `${at} update#${event.updateId} ${event.updateType}${chat}${user} (${event.durationMs}ms)${err}`;
		}
		case "api.call":
			return `${at} -> ${event.method} ${event.params ? JSON.stringify(event.params) : ""}`.trimEnd();
		case "api.result":
			return `${at} <- ${event.method} ok`;
		case "api.error":
			return `${at} x  ${event.method} attempt=${event.attempt} ${describeError(event.error)}`;
	}
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** print formatted entries to `console.log`. the default sink. */
export function consoleSink(): AuditSink {
	return {
		write(entry) {
			console.log("[audit-log]", entry);
		},
	};
}

/** standalone collection point: format + filter + sample + fan out to every sink,
 * independent of any bot. used internally by {@link auditLog}; exported for callers
 * that want to feed events from outside the api/middleware hooks. */
export interface AuditLogger {
	log(event: AuditEvent): void;
	flush(): Promise<void>;
}

export function createAuditLogger(options: AuditLogOptions = {}): AuditLogger {
	const sinks = normalizeSinks(options.sinks);
	const formatter = options.formatter ?? jsonFormatter;
	const { filter, sample, onSinkError } = options;
	const random = options.random ?? Math.random;

	const passesSample = (event: AuditEvent): boolean => {
		if (sample === undefined) return true;

		const rate = typeof sample === "function" ? sample(event) : sample;
		if (rate >= 1) return true;
		if (rate <= 0) return false;
		return random() < rate;
	};

	return {
		log(event) {
			if (filter && !filter(event)) return;
			if (!passesSample(event)) return;

			const entry = formatter(event);
			for (const sink of sinks) {
				try {
					void Promise.resolve(sink.write(entry, event)).catch((error: unknown) => {
						onSinkError?.(error, event);
					});
				} catch (error) {
					onSinkError?.(error, event);
				}
			}
		},
		async flush() {
			await Promise.all(sinks.map((sink) => sink.flush?.()));
		},
	};
}

function normalizeSinks(sinks: AuditSink | AuditSink[] | undefined): AuditSink[] {
	if (sinks === undefined) return [consoleSink()];
	return Array.isArray(sinks) ? sinks : [sinks];
}

/** the subset of `Bot` the installer needs — `use` for incoming updates, `api` for
 * outgoing calls. kept structural so it works on any `Bot<C>` (or a hand-built
 * `{ use, api }` pair, e.g. in tests) without importing the concrete class. */
export interface AuditTarget<C extends Context = Context> {
	use(...middleware: ((ctx: C, next: () => Promise<void>) => unknown)[]): unknown;
	api: Api;
}

/** a handle returned by the direct-install form (`auditLog(target, options)`). */
export interface AuditLogHandle {
	/** await every sink's {@link AuditSink.flush}. */
	flush(): Promise<void>;
}

function isAuditTarget(value: unknown): value is AuditTarget {
	const candidate = value as Partial<AuditTarget> | undefined;
	return typeof candidate?.use === "function" && typeof candidate.api?.before === "function";
}

function installAuditLog<C extends Context>(
	bot: AuditTarget<C>,
	options: AuditLogOptions,
	logger: AuditLogger,
): void {
	const now = options.now ?? Date.now;
	const excluded = new Set(options.excludedMethods ?? DEFAULT_EXCLUDED_METHODS);

	if ((options.logUpdates ?? true) !== false) {
		bot.use(async (ctx, next) => {
			const start = now();
			let error: unknown;

			try {
				await next();
			} catch (caught) {
				error = caught;
				throw caught;
			} finally {
				logger.log({
					kind: "update",
					timestamp: start,
					updateId: ctx.update.update_id,
					updateType: ctx.updateType,
					chatId: ctx.chat?.id,
					userId: ctx.from?.id,
					durationMs: now() - start,
					error,
					update: ctx.update,
				});
			}
		});
	}

	if ((options.logApiCalls ?? true) !== false) {
		bot.api.before((method, params) => {
			if (!excluded.has(method)) {
				logger.log({ kind: "api.call", timestamp: now(), method, params });
			}
			return undefined;
		});
	}

	if ((options.logApiResults ?? true) !== false) {
		bot.api.after((method, params, result) => {
			if (!excluded.has(method)) {
				logger.log({ kind: "api.result", timestamp: now(), method, params, result });
			}
			return undefined;
		});
	}

	if ((options.logApiErrors ?? true) !== false) {
		bot.api.onError((method, error, attempt, params) => {
			if (!excluded.has(method)) {
				logger.log({ kind: "api.error", timestamp: now(), method, params, error, attempt });
			}
			return undefined;
		});
	}
}

/**
 * install structured audit logging: every incoming update (via middleware) and every
 * outgoing api call (via `api.before`/`api.after`/`api.onError`) is turned into an
 * {@link AuditEvent}, optionally filtered and sampled, then handed to every configured
 * {@link AuditSink}.
 *
 * ```ts
 * bot.install(auditLog());
 * bot.onStop(() => plugin.flush());
 * ```
 */
export function auditLog<In extends Context = Context>(
	options?: AuditLogOptions,
): AuditLogPlugin<In>;
/** install directly on a `{ use, api }` pair — `auditLog(bot, options)`, skipping `.install()`. */
export function auditLog<C extends Context>(
	target: AuditTarget<C>,
	options?: AuditLogOptions,
): AuditLogHandle;
export function auditLog(
	targetOrOptions?: AuditTarget | AuditLogOptions,
	maybeOptions: AuditLogOptions = {},
): AuditLogPlugin | AuditLogHandle {
	if (isAuditTarget(targetOrOptions)) {
		const logger = createAuditLogger(maybeOptions);
		installAuditLog(targetOrOptions, maybeOptions, logger);
		return { flush: () => logger.flush() };
	}

	const options = targetOrOptions ?? {};
	const logger = createAuditLogger(options);

	const plugin = ((bot) => {
		installAuditLog(bot as AuditTarget, options, logger);
		return bot;
	}) as AuditLogPlugin;

	plugin.flush = () => logger.flush();

	return plugin;
}
