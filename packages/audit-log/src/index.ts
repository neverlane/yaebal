/**
 * @yaebal/audit-log — structured, correlated, redacted-by-default logging of every
 * incoming update and every outgoing api call.
 *
 * ```ts
 * bot.install(auditLog());
 * ```
 */

export { type AuditAdminLogger, type AuditAdminOptions, auditAdmin } from "./admin.js";
export { type ChatSinkOptions, type ChatSinkTarget, chatSink } from "./chat-sink.js";
export { type CorrelationStore, currentCorrelation, newCorrelationId } from "./correlation.js";
export { formatError, type SerializedError, serializeError } from "./errors.js";
export { jsonFormatter, prettyFormatter, textFormatter } from "./formatters.js";
export { auditLog } from "./install.js";
export { byChatId, createAuditLogger } from "./logger.js";
export { applyRedaction, DEFAULT_SECRET_KEYS, type RedactOptions } from "./redact.js";
export {
	type BatchSinkOptions,
	batchSink,
	consoleSink,
	type FileSinkFs,
	type FileSinkOptions,
	fileSink,
	type MemorySink,
	type MemorySinkOptions,
	memorySink,
} from "./sinks.js";
export {
	type AuditApiCallEvent,
	type AuditApiErrorEvent,
	type AuditApiResultEvent,
	type AuditEvent,
	type AuditFormatter,
	type AuditLevel,
	type AuditLifecycleStartEvent,
	type AuditLifecycleStopEvent,
	type AuditLogErrorStage,
	type AuditLogger,
	type AuditLoggerStats,
	type AuditLogHandle,
	type AuditLogOptions,
	type AuditLogPlugin,
	type AuditSink,
	type AuditTarget,
	type AuditUpdateEvent,
	DEFAULT_EXCLUDED_METHODS,
	type MaybePromise,
} from "./types.js";
