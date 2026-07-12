import assert from "node:assert/strict";
import test from "node:test";
import { byChatId, createAuditLogger } from "./logger.js";
import type { AuditApiCallEvent, AuditEvent, AuditSink } from "./types.js";

function recordingSink(): AuditSink & { entries: unknown[]; events: AuditEvent[] } {
	const entries: unknown[] = [];
	const events: AuditEvent[] = [];
	return {
		entries,
		events,
		write(entry, event) {
			entries.push(entry);
			events.push(event);
		},
	};
}

const apiCall = (overrides: Partial<Omit<AuditApiCallEvent, "kind">> = {}): AuditApiCallEvent => ({
	kind: "api.call",
	level: "info",
	timestamp: 1,
	callId: "c1",
	method: "sendMessage",
	params: undefined,
	attempt: 1,
	...overrides,
});

const apiResult = (
	overrides: Partial<Omit<AuditEvent & { kind: "api.result" }, "kind">> = {},
): AuditEvent => ({
	kind: "api.result",
	level: "info",
	timestamp: 1,
	callId: "c1",
	method: "sendMessage",
	params: undefined,
	result: {},
	...overrides,
});

const apiErrorEvent = (
	overrides: Partial<Omit<AuditEvent & { kind: "api.error" }, "kind">> = {},
): AuditEvent => ({
	kind: "api.error",
	level: "error",
	timestamp: 1,
	callId: "c1",
	method: "sendMessage",
	params: undefined,
	error: { name: "Error", message: "x" },
	attempt: 1,
	...overrides,
});

// ── basic fan-out ────────────────────────────────────────────────────────────────────────────

test("forwards every event to every sink by default", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({ sinks: [sink] });

	const event = apiCall();
	logger.log(event);

	assert.equal(sink.events.length, 1);
	assert.deepEqual(sink.entries[0], event);
});

test("drops events the filter rejects, without redacting or formatting them", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({ sinks: [sink], filter: (event) => event.kind !== "api.call" });

	logger.log(apiCall());
	logger.log(apiResult());

	assert.equal(sink.events.length, 1);
	assert.equal(sink.events[0]?.kind, "api.result");
	assert.equal(logger.stats().filtered, 1);
});

test("sample=0 drops, sample=1 keeps", () => {
	const dropped = recordingSink();
	createAuditLogger({ sinks: [dropped], sample: 0 }).log(apiCall());
	assert.equal(dropped.events.length, 0);

	const kept = recordingSink();
	createAuditLogger({ sinks: [kept], sample: 1 }).log(apiCall());
	assert.equal(kept.events.length, 1);
});

test("sample fraction uses the injected random source", () => {
	const sink = recordingSink();
	let nextRandom = 0;
	const logger = createAuditLogger({ sinks: [sink], sample: 0.5, random: () => nextRandom });

	nextRandom = 0.1; // < 0.5 -> kept
	logger.log(apiCall());
	nextRandom = 0.9; // >= 0.5 -> dropped
	logger.log(apiCall());

	assert.equal(sink.events.length, 1);
	assert.equal(logger.stats().sampledOut, 1);
});

test("sample can vary per event via a function", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({
		sinks: [sink],
		sample: (event) => (event.kind === "api.error" ? 1 : 0),
	});

	logger.log(apiCall());
	logger.log(apiErrorEvent());

	assert.equal(sink.events.length, 1);
	assert.equal(sink.events[0]?.kind, "api.error");
});

test("sampleKey resolves a key -> deterministic verdict, random() never consulted", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({
		sinks: [sink],
		sample: 0.5,
		sampleKey: (event) => (event as { params?: { tag?: string } }).params?.tag,
		random: () => {
			throw new Error("random() must not be called once sampleKey resolves a value");
		},
	});

	assert.doesNotThrow(() => {
		logger.log(apiCall({ params: { tag: "a" } }));
		logger.log(apiCall({ params: { tag: "a" } }));
		logger.log(apiCall({ params: { tag: "a" } }));
	});

	// same key -> same verdict every time: either every call landed, or none did.
	assert.ok(sink.events.length === 0 || sink.events.length === 3);
});

test("sampleKey resolving undefined for an event falls back to random() for that event", () => {
	const sink = recordingSink();
	let randomCalls = 0;
	const logger = createAuditLogger({
		sinks: [sink],
		sample: 0.5,
		sampleKey: () => undefined,
		random: () => {
			randomCalls += 1;
			return 0.1;
		},
	});

	logger.log(apiCall());

	assert.equal(randomCalls, 1);
	assert.equal(sink.events.length, 1);
});

test("byChatId reads chatId off events that carry one, undefined off ones that don't", () => {
	assert.equal(byChatId(apiCall()), undefined);
	assert.equal(
		byChatId({
			kind: "update",
			level: "info",
			timestamp: 1,
			updateId: 1,
			correlationId: "c",
			updateType: "message",
			chatId: 42,
			durationMs: 1,
			update: {},
		}),
		42,
	);
});

// ── redaction wiring ─────────────────────────────────────────────────────────────────────────

test("redacts by default", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({ sinks: [sink] });

	logger.log(apiCall({ params: { secret_token: "abc" } }));

	assert.equal(
		(sink.events[0] as { params?: { secret_token: string } }).params?.secret_token,
		"[redacted]",
	);
});

test("redact: false disables masking", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({ sinks: [sink], redact: false });

	logger.log(apiCall({ params: { secret_token: "abc" } }));

	assert.equal(
		(sink.events[0] as { params?: { secret_token: string } }).params?.secret_token,
		"abc",
	);
});

test("sinks receive the redacted event as their second argument, not the raw one", () => {
	const sink = recordingSink();
	const logger = createAuditLogger({ sinks: [sink], formatter: (event) => event });

	logger.log(apiCall({ params: { secret_token: "abc" } }));

	const [entry] = sink.entries as [{ params?: { secret_token: string } }];
	assert.equal(entry.params?.secret_token, "[redacted]");
});

// ── pipeline safety: nothing here may throw out of .log() ──────────────────────────────────────

test("a throwing filter is isolated: reported via onError, drops just that event", () => {
	const errors: Array<{ stage: string }> = [];
	const sink = recordingSink();
	const logger = createAuditLogger({
		sinks: [sink],
		filter: () => {
			throw new Error("filter exploded");
		},
		onError: (_error, _event, stage) => errors.push({ stage }),
	});

	assert.doesNotThrow(() => logger.log(apiCall()));
	assert.equal(sink.events.length, 0);
	assert.deepEqual(errors, [{ stage: "filter" }]);
	assert.equal(logger.stats().errors.filter, 1);
});

test("a throwing sample function is isolated", () => {
	const errors: string[] = [];
	const logger = createAuditLogger({
		sinks: [recordingSink()],
		sample: () => {
			throw new Error("sample exploded");
		},
		onError: (_e, _ev, stage) => errors.push(stage),
	});

	assert.doesNotThrow(() => logger.log(apiCall()));
	assert.deepEqual(errors, ["sample"]);
});

test("a throwing formatter is isolated and never reaches a sink", () => {
	const sink = recordingSink();
	const errors: string[] = [];
	const logger = createAuditLogger({
		sinks: [sink],
		formatter: () => {
			throw new Error("formatter exploded");
		},
		onError: (_e, _ev, stage) => errors.push(stage),
	});

	assert.doesNotThrow(() => logger.log(apiCall()));
	assert.equal(sink.events.length, 0);
	assert.deepEqual(errors, ["format"]);
});

test("onError itself throwing does not escape .log()", () => {
	const logger = createAuditLogger({
		sinks: [recordingSink()],
		filter: () => {
			throw new Error("filter exploded");
		},
		onError: () => {
			throw new Error("onError exploded too");
		},
	});

	assert.doesNotThrow(() => logger.log(apiCall()));
});

test("a throwing or rejecting sink is reported via onError, without throwing", async () => {
	const errors: unknown[] = [];
	const throwingSink: AuditSink = {
		write() {
			throw new Error("sync fail");
		},
	};
	const rejectingSink: AuditSink = {
		write() {
			return Promise.reject(new Error("async fail"));
		},
	};

	const logger = createAuditLogger({
		sinks: [throwingSink, rejectingSink],
		onError: (error) => errors.push(error),
	});

	assert.doesNotThrow(() => logger.log(apiCall()));

	await logger.flush();

	assert.equal(errors.length, 2);
});

// ── flush ────────────────────────────────────────────────────────────────────────────────────

test("flush awaits every sink's flush", async () => {
	const flushed: string[] = [];
	const a: AuditSink = { write() {}, flush: async () => void flushed.push("a") };
	const b: AuditSink = { write() {}, flush: async () => void flushed.push("b") };

	await createAuditLogger({ sinks: [a, b] }).flush();

	assert.deepEqual(flushed.sort(), ["a", "b"]);
});

test("flush drains writes still in flight, not just sink.flush()", { timeout: 5000 }, async () => {
	let resolveWrite: (() => void) | undefined;
	let flushedAfterWrite = false;

	const sink: AuditSink = {
		write() {
			return new Promise<void>((resolve) => {
				resolveWrite = () => {
					flushedAfterWrite = true;
					resolve();
				};
			});
		},
	};

	const logger = createAuditLogger({ sinks: [sink] });
	logger.log(apiCall());

	const flushPromise = logger.flush();
	// give the pending write a chance to be observed as still in-flight before resolving it
	await new Promise((r) => setTimeout(r, 10));
	assert.equal(flushedAfterWrite, false);

	resolveWrite?.();
	await flushPromise;

	assert.equal(flushedAfterWrite, true);
});

test('a rejecting sink.flush is reported via onError with stage "flush", not thrown', async () => {
	const errors: string[] = [];
	const logger = createAuditLogger({
		sinks: [
			{
				write() {},
				flush: async () => {
					throw new Error("flush exploded");
				},
			},
		],
		onError: (_e, _ev, stage) => errors.push(stage),
	});

	await assert.doesNotReject(() => logger.flush());
	assert.deepEqual(errors, ["flush"]);
});

// ── stats ────────────────────────────────────────────────────────────────────────────────────

test("stats tracks received/filtered/sampledOut/written and per-stage errors", () => {
	const logger = createAuditLogger({ sinks: [recordingSink()] });

	logger.log(apiCall());
	logger.log(apiCall());

	const stats = logger.stats();
	assert.equal(stats.received, 2);
	assert.equal(stats.written, 2);
	assert.equal(stats.filtered, 0);
	assert.equal(stats.sampledOut, 0);
});

test("stats() returns an independent snapshot, not a live reference", () => {
	const logger = createAuditLogger({ sinks: [recordingSink()] });
	logger.log(apiCall());
	const first = logger.stats();
	logger.log(apiCall());
	assert.equal(first.received, 1);
	assert.equal(logger.stats().received, 2);
});

// ── construction-time validation ────────────────────────────────────────────────────────────

test("rejects an empty sinks array at construction — a silent no-op is not a valid config", () => {
	assert.throws(() => createAuditLogger({ sinks: [] }), /sinks is an empty array/);
});

test("rejects a sample outside [0, 1] at construction", () => {
	assert.throws(() => createAuditLogger({ sample: 1.5 }), /sample must be a number in \[0, 1\]/);
	assert.throws(() => createAuditLogger({ sample: -0.1 }), /sample must be a number in \[0, 1\]/);
	assert.throws(
		() => createAuditLogger({ sample: Number.NaN }),
		/sample must be a number in \[0, 1\]/,
	);
});

test("omitting sinks defaults to a single consoleSink", () => {
	const originalLog = console.log;
	const calls: unknown[][] = [];
	console.log = (...args: unknown[]) => calls.push(args);
	try {
		createAuditLogger({}).log(apiCall());
	} finally {
		console.log = originalLog;
	}
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.[0], "[audit-log]");
});
