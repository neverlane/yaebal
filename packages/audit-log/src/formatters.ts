import { formatError } from "./errors.js";
import type { AuditEvent } from "./types.js";

/** the structured default: pass the event through as-is (sinks that serialize to JSON,
 * ship to a log aggregator, or write db rows want the raw fields — including {@link
 * AuditUpdateEvent.error}, already normalized to a plain, JSON-safe {@link
 * SerializedError} by the time a formatter sees it). */
export function jsonFormatter(event: AuditEvent): AuditEvent {
	return event;
}

/** a human-readable single line, e.g. for {@link consoleSink} or {@link fileSink} in
 * local dev. */
export function textFormatter(event: AuditEvent): string {
	const at = new Date(event.timestamp).toISOString();
	const trace = "correlationId" in event && event.correlationId ? ` [${event.correlationId}]` : "";

	switch (event.kind) {
		case "update": {
			const chat = event.chatId !== undefined ? ` chat=${event.chatId}` : "";
			const user = event.userId !== undefined ? ` user=${event.userId}` : "";
			const err = event.error !== undefined ? ` error=${formatError(event.error)}` : "";
			return `${at}${trace} update#${event.updateId} ${event.updateType}${chat}${user} (${event.durationMs}ms)${err}`;
		}
		case "api.call": {
			const attempt = event.attempt > 1 ? ` attempt=${event.attempt}` : "";
			const body = event.params ? ` ${JSON.stringify(event.params)}` : "";
			return `${at}${trace} -> ${event.method}${attempt}${body}`.trimEnd();
		}
		case "api.result": {
			const duration = event.durationMs !== undefined ? ` (${event.durationMs}ms)` : "";
			return `${at}${trace} <- ${event.method} ok${duration}`;
		}
		case "api.error": {
			const duration = event.durationMs !== undefined ? ` (${event.durationMs}ms)` : "";
			return `${at}${trace} x  ${event.method} attempt=${event.attempt}${duration} ${formatError(event.error)}`;
		}
		case "bot.start":
			return `${at} bot started`;
		case "bot.stop":
			return `${at} bot stopped`;
	}
}

/** an indented, multi-line JSON rendering — easier to eyeball than {@link
 * textFormatter} for events with large `params`/`result`/`update` payloads, while
 * staying just as sink-agnostic (a string) as `textFormatter`. */
export function prettyFormatter(event: AuditEvent): string {
	return JSON.stringify(event, null, 2);
}
