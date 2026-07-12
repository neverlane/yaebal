import assert from "node:assert/strict";
import test from "node:test";
import { p } from "./catalog.js";
import { createAnalytics, fromEvent } from "./client.js";
import type { AnalyticsAdapter, AnalyticsEvent } from "./types.js";

function fakeAdapter() {
	const events: AnalyticsEvent[] = [];
	const adapter: AnalyticsAdapter = { track: (event) => void events.push(event) };
	return { adapter, events };
}

test("track() forwards name/properties/userId/chatId to every adapter", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter] });

	client.track({ name: "start", properties: { source: "deeplink" }, userId: 42, chatId: 7 });
	await client.flush();

	assert.equal(events.length, 1);
	assert.equal(events[0]?.name, "start");
	assert.deepEqual(events[0]?.properties, { source: "deeplink" });
	assert.equal(events[0]?.userId, 42);
	assert.equal(events[0]?.chatId, 7);
	assert.equal(typeof events[0]?.timestamp, "number");
});

test("dispatches to every configured adapter", async () => {
	const first = fakeAdapter();
	const second = fakeAdapter();
	const client = createAnalytics({ adapters: [first.adapter, second.adapter] });

	client.track({ name: "start" });
	await client.flush();

	assert.equal(first.events.length, 1);
	assert.equal(second.events.length, 1);
});

test("a throwing or rejecting adapter is isolated via onError, other adapters still run", async () => {
	const errors: unknown[] = [];
	const ok = fakeAdapter();
	const throwing: AnalyticsAdapter = {
		track: () => {
			throw new Error("boom");
		},
	};
	const rejecting: AnalyticsAdapter = { track: () => Promise.reject(new Error("async boom")) };

	const client = createAnalytics({
		adapters: [throwing, rejecting, ok.adapter],
		onError: (error) => errors.push(error),
	});

	client.track({ name: "start" });
	await client.flush();

	assert.equal(ok.events.length, 1);
	assert.equal(errors.length, 2);
});

test("a throwing onError never propagates out of track() or flush()", async () => {
	const throwing: AnalyticsAdapter = {
		track: () => {
			throw new Error("adapter boom");
		},
	};
	const client = createAnalytics({
		adapters: [throwing],
		onError: () => {
			throw new Error("onError itself threw");
		},
	});

	assert.doesNotThrow(() => client.track({ name: "start" }));
	await assert.doesNotReject(() => client.flush());
});

test("flush() resolves even when an adapter's flush() rejects, routing the error to onError", async () => {
	const errors: unknown[] = [];
	const flushed: string[] = [];
	const bad: AnalyticsAdapter = {
		track: () => {},
		flush: () => Promise.reject(new Error("flush boom")),
	};
	const good: AnalyticsAdapter = { track: () => {}, flush: () => void flushed.push("good") };

	const client = createAnalytics({ adapters: [bad, good], onError: (error) => errors.push(error) });

	await assert.doesNotReject(() => client.flush());
	assert.deepEqual(flushed, ["good"]);
	assert.equal(errors.length, 1);
	assert.match(String(errors[0]), /flush boom/);
});

test("flush() awaits in-flight track() dispatches before returning", async () => {
	let resolveTrack: (() => void) | undefined;
	const slow: AnalyticsAdapter = {
		track: () =>
			new Promise<void>((resolve) => {
				resolveTrack = resolve;
			}),
	};
	const client = createAnalytics({ adapters: [slow] });

	client.track({ name: "start" });
	let flushed = false;
	const flushPromise = client.flush().then(() => {
		flushed = true;
	});

	await Promise.resolve();
	await Promise.resolve();
	assert.equal(flushed, false, "flush() must not resolve while track() is still in flight");

	resolveTrack?.();
	await flushPromise;
	assert.equal(flushed, true);
});

test("identify() forwards to every adapter's identify, isolating failures", async () => {
	const errors: unknown[] = [];
	const calls: Array<[string, Record<string, unknown>]> = [];
	const ok: AnalyticsAdapter = {
		track: () => {},
		identify: (id, props) => void calls.push([id, props]),
	};
	const throwing: AnalyticsAdapter = {
		track: () => {},
		identify: () => {
			throw new Error("identify boom");
		},
	};
	const client = createAnalytics({ adapters: [throwing, ok], onError: (e) => errors.push(e) });

	client.identify("42", { plan: "pro" });
	await client.flush();

	assert.deepEqual(calls, [["42", { plan: "pro" }]]);
	assert.equal(errors.length, 1);
});

// ── sampling ────────────────────────────────────────────────────────────────────────────────

test("sample: 0 drops every event", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter], sample: 0 });

	for (let i = 0; i < 20; i++) client.track({ name: "noisy" });
	await client.flush();

	assert.equal(events.length, 0);
});

test("a catalog entry's sample overrides the client's global sample", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		sample: 0,
		events: { important: { sample: 1 } },
	});

	client.track({ name: "important" });
	await client.flush();

	assert.equal(events.length, 1);
});

test("an out-of-range sample throws at construction, not on first track()", () => {
	assert.throws(() => createAnalytics({ adapters: [], sample: 1.5 }), /sample/);
});

// ── consent / shouldTrack ───────────────────────────────────────────────────────────────────

test("shouldTrack: false skips the event; true lets it through", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		shouldTrack: (event) => event.userId !== 13,
	});

	client.track({ name: "a", userId: 13 });
	client.track({ name: "b", userId: 14 });
	await client.flush();

	assert.deepEqual(
		events.map((e) => e.name),
		["b"],
	);
});

test("a throwing shouldTrack fails open (event still tracked)", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		shouldTrack: () => {
			throw new Error("consent check boom");
		},
	});

	client.track({ name: "start" });
	await client.flush();

	assert.equal(events.length, 1);
});

test("shouldTrack sees the RAW userId, before anonymize runs", async () => {
	let seenUserId: unknown;
	const { adapter } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		anonymize: "hash",
		shouldTrack: (event) => {
			seenUserId = event.userId;
			return true;
		},
	});

	client.track({ name: "start", userId: 42 });
	await client.flush();

	assert.equal(seenUserId, 42);
});

// ── redaction ───────────────────────────────────────────────────────────────────────────────

test("global redact strips keys from every event", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter], redact: ["email"] });

	client.track({ name: "signup", properties: { email: "a@b.com", plan: "pro" } });
	await client.flush();

	assert.deepEqual(events[0]?.properties, { plan: "pro" });
});

test("a catalog entry's redact merges with the global redact", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		redact: ["email"],
		events: { signup: { redact: ["ip"] } },
	});

	client.track({ name: "signup", properties: { email: "a@b.com", ip: "1.2.3.4", plan: "pro" } });
	await client.flush();

	assert.deepEqual(events[0]?.properties, { plan: "pro" });
});

// ── anonymize ───────────────────────────────────────────────────────────────────────────────

test('anonymize: "hash" replaces userId/chatId, deterministically, without exposing the raw id', async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter], anonymize: "hash" });

	client.track({ name: "a", userId: 42, chatId: 7 });
	client.track({ name: "b", userId: 42, chatId: 7 });
	await client.flush();

	assert.equal(typeof events[0]?.userId, "string");
	assert.notEqual(events[0]?.userId, 42);
	assert.equal(events[0]?.userId, events[1]?.userId, "same id hashes the same way every time");
	assert.notEqual(events[0]?.userId, events[0]?.chatId, "user and chat hash spaces don't collide");
});

test("anonymize accepts a custom function", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		anonymize: (id, kind) => `${kind}:${id * 2}`,
	});

	client.track({ name: "a", userId: 5 });
	await client.flush();

	assert.equal(events[0]?.userId, "user:10");
});

// ── typed catalog ───────────────────────────────────────────────────────────────────────────

test("a declared event's props schema validates and coerces properties", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		events: { purchase: { props: p.object({ amount: p.number() }) } },
	});

	client.track({ name: "purchase", properties: { amount: 9 } } as never);
	await client.flush();

	assert.deepEqual(events[0]?.properties, { amount: 9 });
});

test("a props schema violation is reported to onError and dropped, not thrown", async () => {
	const errors: unknown[] = [];
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		events: { purchase: { props: p.object({ amount: p.number() }) } },
		onError: (error) => errors.push(error),
	});

	client.track({ name: "purchase", properties: { amount: "nine" } } as never);
	await client.flush();

	assert.equal(events.length, 0);
	assert.equal(errors.length, 1);
	assert.match(String(errors[0]), /amount/);
});

test("an event name not declared in the catalog is reported to onError and dropped", async () => {
	const errors: unknown[] = [];
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({
		adapters: [adapter],
		events: { known: true },
		onError: (error) => errors.push(error),
	});

	client.track({ name: "typo_event" } as never);
	await client.flush();

	assert.equal(events.length, 0);
	assert.match(String(errors[0]), /typo_event.*not declared/);
});

test("untyped mode (no catalog) accepts any event name with no validation", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter] });

	client.track({ name: "anything_goes", properties: { whatever: [1, 2, 3] } });
	await client.flush();

	assert.equal(events.length, 1);
});

test("an invalid catalog throws at construction time", () => {
	assert.throws(
		() => createAnalytics({ adapters: [], events: { "Not Valid": true } }),
		/event name/,
	);
	assert.throws(() => createAnalytics({ adapters: [], events: { ok: { sample: 5 } } }), /sample/);
});

// ── createAnalytics as a standalone client / fromEvent ─────────────────────────────────────

test("createAnalytics is usable outside any ctx", async () => {
	const { adapter, events } = fakeAdapter();
	const client = createAnalytics({ adapters: [adapter] });

	client.track({ name: "job_completed", properties: { total: 3 } });
	await client.flush();

	assert.equal(events.length, 1);
	assert.equal(events[0]?.name, "job_completed");
	assert.equal(events[0]?.userId, undefined);
});

test("fromEvent prefixes the name and strips type into properties", () => {
	assert.deepEqual(fromEvent("broadcast", { type: "rate_limited", waitMs: 10 }), {
		name: "broadcast.rate_limited",
		properties: { waitMs: 10 },
	});
});
