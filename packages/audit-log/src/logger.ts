import { jsonFormatter } from "./formatters.js";
import { applyRedaction } from "./redact.js";
import { consoleSink } from "./sinks.js";
import type {
	AuditEvent,
	AuditLogErrorStage,
	AuditLogger,
	AuditLoggerStats,
	AuditLogOptions,
	AuditSink,
} from "./types.js";

function normalizeSinks(sinks: AuditSink | AuditSink[] | undefined): AuditSink[] {
	if (sinks === undefined) return [consoleSink()];
	const list = Array.isArray(sinks) ? sinks : [sinks];

	if (list.length === 0) {
		throw new Error(
			"createAuditLogger: sinks is an empty array — that's a silent no-op logger, not a valid " +
				"config. omit `sinks` for the default consoleSink(), or pass at least one sink.",
		);
	}

	return list;
}

function validateSample(sample: AuditLogOptions["sample"]): void {
	if (typeof sample !== "number") return;
	if (Number.isNaN(sample) || sample < 0 || sample > 1) {
		throw new Error(
			`createAuditLogger: sample must be a number in [0, 1] or a function — got ${sample}`,
		);
	}
}

function newStats(): AuditLoggerStats {
	return {
		received: 0,
		filtered: 0,
		sampledOut: 0,
		written: 0,
		errors: { filter: 0, sample: 0, redact: 0, format: 0, sink: 0, flush: 0 },
	};
}

/** build a standalone {@link AuditLogger}: format + filter + sample + redact + fan out
 * to every sink, independent of any bot. every pipeline stage — `filter`, `sample`,
 * redaction, `formatter`, and each sink's `write`/`flush` — is isolated: a stage that
 * throws or rejects is reported via `onError` and drops just that event (or, for
 * `flush`, just that sink), never the request the event came from. used internally by
 * {@link auditLog}; exported for callers that want to feed events from outside the
 * api/middleware hooks (see {@link AuditLogger}).
 */
export function createAuditLogger(options: AuditLogOptions = {}): AuditLogger {
	const sinks = normalizeSinks(options.sinks);
	const formatter = options.formatter ?? jsonFormatter;
	const { filter, sample, sampleKey, onError } = options;
	const redactOptions = options.redact;
	const random = options.random ?? Math.random;
	const stats = newStats();

	validateSample(sample);

	const pendingWrites = new Set<Promise<unknown>>();

	const report = (stage: AuditLogErrorStage, error: unknown, event: AuditEvent): void => {
		stats.errors[stage] += 1;
		try {
			onError?.(error, event, stage);
		} catch {
			// onError itself throwing must not escape into the caller's request handling —
			// there's nowhere further to report it, so it's swallowed deliberately.
		}
	};

	const passesSample = (event: AuditEvent): boolean => {
		if (sample === undefined) return true;

		const rate = typeof sample === "function" ? sample(event) : sample;
		if (!Number.isFinite(rate) || rate <= 0) return false;
		if (rate >= 1) return true;

		const key = sampleKey?.(event);
		const unit = key === undefined ? random() : hashToUnit(String(key));
		return unit < rate;
	};

	return {
		log(event) {
			stats.received += 1;

			let passesFilter: boolean;
			try {
				passesFilter = !filter || filter(event);
			} catch (error) {
				report("filter", error, event);
				return;
			}
			if (!passesFilter) {
				stats.filtered += 1;
				return;
			}

			let sampled: boolean;
			try {
				sampled = passesSample(event);
			} catch (error) {
				report("sample", error, event);
				return;
			}
			if (!sampled) {
				stats.sampledOut += 1;
				return;
			}

			let redacted: AuditEvent;
			try {
				redacted = redactOptions === false ? event : applyRedaction(event, redactOptions);
			} catch (error) {
				report("redact", error, event);
				return;
			}

			let entry: unknown;
			try {
				entry = formatter(redacted);
			} catch (error) {
				report("format", error, redacted);
				return;
			}

			stats.written += 1;

			for (const sink of sinks) {
				try {
					const write = Promise.resolve(sink.write(entry, redacted)).catch((error: unknown) => {
						report("sink", error, redacted);
					});
					pendingWrites.add(write);
					void write.finally(() => pendingWrites.delete(write));
				} catch (error) {
					report("sink", error, redacted);
				}
			}
		},

		async flush() {
			await Promise.all(pendingWrites);

			await Promise.all(
				sinks.map(async (sink) => {
					try {
						await sink.flush?.();
					} catch (error) {
						stats.errors.flush += 1;
						try {
							// biome-ignore lint/suspicious/noExplicitAny: flush has no single associated event to report against
							onError?.(error, undefined as any, "flush");
						} catch {
							// see the identical guard in `report()` above.
						}
					}
				}),
			);
		},

		stats() {
			return {
				received: stats.received,
				filtered: stats.filtered,
				sampledOut: stats.sampledOut,
				written: stats.written,
				errors: { ...stats.errors },
			};
		},
	};
}

/** FNV-1a 32-bit, mapped to `[0, 1)` — deterministic, dependency-free sampling for
 * {@link AuditLogOptions.sampleKey}. */
function hashToUnit(key: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) {
		hash ^= key.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) / 0xffffffff;
}

/** a ready-made {@link AuditLogOptions.sampleKey}: sample by chat, so an entire
 * conversation's trace is kept or dropped together instead of random per-event
 * coin-flips cutting a trace mid-update. events with no `chatId` (lifecycle events, or
 * an update with no chat) fall back to `random()`. */
export function byChatId(event: AuditEvent): string | number | undefined {
	return "chatId" in event ? event.chatId : undefined;
}
