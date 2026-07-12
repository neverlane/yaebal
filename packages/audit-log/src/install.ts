import type { Context } from "@yaebal/core";
import {
	beginCall,
	type CorrelationStore,
	currentCorrelation,
	endCall,
	newCorrelationId,
	runWithCorrelation,
} from "./correlation.js";
import { serializeError } from "./errors.js";
import { createAuditLogger } from "./logger.js";
import {
	type AuditLogger,
	type AuditLogHandle,
	type AuditLogOptions,
	type AuditLogPlugin,
	type AuditTarget,
	DEFAULT_EXCLUDED_METHODS,
} from "./types.js";

function matchesMethod(method: string, pattern: string): boolean {
	return pattern.endsWith("*") ? method.startsWith(pattern.slice(0, -1)) : method === pattern;
}

function buildMethodFilter(options: AuditLogOptions): (method: string) => boolean {
	const excluded = options.excludedMethods ?? DEFAULT_EXCLUDED_METHODS;
	const include = options.includeMethods;

	return (method) => {
		if (excluded.some((pattern) => matchesMethod(method, pattern))) return false;
		if (!include) return true;
		return include.some((pattern) => matchesMethod(method, pattern));
	};
}

function isAuditTarget(value: unknown): value is AuditTarget {
	const candidate = value as Partial<AuditTarget> | undefined;
	return typeof candidate?.use === "function" && typeof candidate.api?.before === "function";
}

function installAuditLog<C extends Context>(
	target: AuditTarget<C>,
	options: AuditLogOptions,
	logger: AuditLogger,
): void {
	const now = options.now ?? Date.now;
	const isLogged = buildMethodFilter(options);
	const correlate = options.correlate ?? true;

	if (options.logUpdates ?? true) {
		target.use(async (ctx, next) => {
			const correlationId = newCorrelationId();
			const store: CorrelationStore = {
				updateId: ctx.update.update_id,
				correlationId,
				chatId: ctx.chat?.id,
				userId: ctx.from?.id,
			};

			const start = now();
			let error: unknown;

			const run = async () => {
				try {
					await next();
				} catch (caught) {
					error = caught;
					throw caught;
				} finally {
					logger.log({
						kind: "update",
						level: error === undefined ? "info" : "error",
						timestamp: start,
						updateId: store.updateId,
						correlationId,
						chatId: store.chatId,
						userId: store.userId,
						updateType: ctx.updateType,
						durationMs: now() - start,
						error: error === undefined ? undefined : serializeError(error),
						update: ctx.update,
					});
				}
			};

			await (correlate ? runWithCorrelation(store, run) : run());
		});
	}

	if (options.logApiCalls ?? true) {
		target.api.before((method, params) => {
			if (!isLogged(method)) return undefined;

			const { callId, attempt } = beginCall(params);
			const correlation = correlate ? currentCorrelation() : undefined;

			logger.log({
				kind: "api.call",
				level: "info",
				timestamp: now(),
				callId,
				method,
				params,
				attempt,
				updateId: correlation?.updateId,
				correlationId: correlation?.correlationId,
				chatId: correlation?.chatId,
				userId: correlation?.userId,
			});

			return undefined;
		});
	}

	if (options.logApiResults ?? true) {
		target.api.after((method, params, result) => {
			if (!isLogged(method)) return undefined;

			const tracking = endCall(params);
			const correlation = correlate ? currentCorrelation() : undefined;

			logger.log({
				kind: "api.result",
				level: "info",
				timestamp: now(),
				callId: tracking?.callId ?? newCorrelationId(),
				method,
				params,
				result,
				durationMs: tracking?.durationMs,
				updateId: correlation?.updateId,
				correlationId: correlation?.correlationId,
				chatId: correlation?.chatId,
				userId: correlation?.userId,
			});

			return undefined;
		});
	}

	if (options.logApiErrors ?? true) {
		target.api.onError((method, error, attempt, params) => {
			if (!isLogged(method)) return undefined;

			const tracking = endCall(params);
			const correlation = correlate ? currentCorrelation() : undefined;

			logger.log({
				kind: "api.error",
				level: "error",
				timestamp: now(),
				callId: tracking?.callId ?? newCorrelationId(),
				method,
				params,
				error: serializeError(error),
				attempt,
				durationMs: tracking?.durationMs,
				updateId: correlation?.updateId,
				correlationId: correlation?.correlationId,
				chatId: correlation?.chatId,
				userId: correlation?.userId,
			});

			return undefined;
		});
	}

	if (typeof target.onStart === "function" && (options.logLifecycle ?? true)) {
		target.onStart((info) => {
			logger.log({ kind: "bot.start", level: "info", timestamp: now(), info });
		});
	}

	if (typeof target.onStop === "function") {
		const logLifecycle = options.logLifecycle ?? true;
		const autoFlush = options.autoFlush ?? true;

		if (logLifecycle || autoFlush) {
			target.onStop(async () => {
				if (logLifecycle) logger.log({ kind: "bot.stop", level: "info", timestamp: now() });
				if (autoFlush) await logger.flush();
			});
		}
	}
}

/**
 * install structured audit logging: every incoming update (via middleware) and every
 * outgoing api call (via `api.before`/`api.after`/`api.onError`) is turned into an
 * `AuditEvent` — correlated back to the triggering update, redacted, optionally
 * filtered and sampled — then handed to every configured sink.
 *
 * ```ts
 * bot.install(auditLog());
 * ```
 *
 * `flush()`/`stats()` are attached to the returned plugin; with a real `Bot`, `flush()`
 * also runs automatically on `bot.onStop()` (see {@link AuditLogOptions.autoFlush}) —
 * no separate wiring needed.
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
		return { flush: () => logger.flush(), stats: () => logger.stats() };
	}

	const options = targetOrOptions ?? {};
	const logger = createAuditLogger(options);
	let installed = false;

	const plugin = ((bot) => {
		if (installed) {
			throw new Error(
				"auditLog(): this plugin instance is already installed on a bot — call auditLog() " +
					"again to build a second, independent instance if you need one installed elsewhere.",
			);
		}
		installed = true;
		installAuditLog(bot as AuditTarget, options, logger);
		return bot;
	}) as AuditLogPlugin;

	plugin.flush = () => logger.flush();
	plugin.stats = () => logger.stats();

	return plugin;
}
