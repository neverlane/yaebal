import assert from "node:assert/strict";
import test from "node:test";
import type { ClickHouseLike } from "./adapters/clickhouse.js";
import { clickhouseAdapter, clickhouseSchema } from "./adapters/clickhouse.js";
import { httpAdapter } from "./adapters/http.js";
import { memoryAdapter } from "./adapters/memory.js";
import { plausibleAdapter } from "./adapters/plausible.js";
import type { PostHogLike } from "./adapters/posthog.js";
import { postHogAdapter } from "./adapters/posthog.js";
import type { AnalyticsEvent } from "./types.js";

function event(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
	return { name: "start", timestamp: 1_700_000_000_000, ...overrides };
}

/** poll a real (tiny) interval until `condition()` is true — a retry chain crosses several
 * microtask hops between each backoff `setTimeout`, which races a virtual clock's `advance()`
 * (see `batched.test.ts`'s `waitUntil` for the full explanation); real short delays sidestep it. */
async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("waitUntil: condition never became true");
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

// ── memoryAdapter ───────────────────────────────────────────────────────────────────────────

test("memoryAdapter records events/identities and query()s a report", async () => {
	const adapter = memoryAdapter();

	adapter.track(event({ name: "a", timestamp: 1000 }));
	adapter.track(event({ name: "a", timestamp: 2000 }));
	adapter.track(event({ name: "b", timestamp: 2000 }));
	adapter.identify("42", { plan: "pro" });

	assert.equal(adapter.events.length, 3);
	assert.deepEqual(adapter.identities.get("42"), { plan: "pro" });

	const report = await adapter.query({ since: 1500 });
	assert.equal(report.total, 2);
	assert.deepEqual(report.topEvents, [
		{ name: "a", count: 1 },
		{ name: "b", count: 1 },
	]);

	adapter.clear();
	assert.equal(adapter.events.length, 0);
});

// ── postHogAdapter ──────────────────────────────────────────────────────────────────────────

test("postHogAdapter: default distinctId is userId, falling back to chatId then anonymous", async () => {
	const captured: Array<Record<string, unknown>> = [];
	const client: PostHogLike = { capture: (payload) => captured.push(payload) };
	const adapter = postHogAdapter(client);

	await adapter.track(event({ userId: 1 }));
	await adapter.track(event({ chatId: 2 }));
	await adapter.track(event());

	assert.equal(captured[0]?.distinctId, "1");
	assert.equal(captured[1]?.distinctId, "2");
	assert.equal(captured[2]?.distinctId, "anonymous");
});

test("postHogAdapter: a custom distinctId keeps userId reachable as a property", async () => {
	const captured: Array<Record<string, unknown>> = [];
	const client: PostHogLike = { capture: (payload) => captured.push(payload) };
	const adapter = postHogAdapter(client, { distinctId: () => "custom-id" });

	await adapter.track(event({ userId: 42, chatId: 7, properties: { a: 1 } }));

	assert.equal(captured[0]?.distinctId, "custom-id");
	assert.deepEqual(captured[0]?.properties, { a: 1, chatId: 7, userId: 42 });
});

test("postHogAdapter: no chatId property when the event has none", async () => {
	const captured: Array<Record<string, unknown>> = [];
	const client: PostHogLike = { capture: (payload) => captured.push(payload) };
	await postHogAdapter(client).track(event({ userId: 1 }));

	assert.equal("chatId" in (captured[0]?.properties as object), false);
});

test("postHogAdapter: forwards identify() and flush() when the client supports them", async () => {
	const identified: unknown[] = [];
	let flushed = false;
	const client: PostHogLike = {
		capture: () => {},
		identify: (payload) => void identified.push(payload),
		flush: async () => {
			flushed = true;
		},
	};
	const adapter = postHogAdapter(client);

	await adapter.identify?.("1", { plan: "pro" });
	await adapter.flush?.();

	assert.deepEqual(identified, [{ distinctId: "1", properties: { plan: "pro" } }]);
	assert.equal(flushed, true);
});

// ── plausibleAdapter ────────────────────────────────────────────────────────────────────────

test("plausibleAdapter: sends a synthetic per-user X-Forwarded-For and scalar props including ids", async () => {
	const requests: Array<{ url: string; init: RequestInit }> = [];
	const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
		requests.push({ url: String(url), init: init ?? {} });
		return new Response(null, { status: 202 });
	}) as typeof fetch;

	const adapter = plausibleAdapter({ domain: "bot.example", fetch: fakeFetch });

	await adapter.track(
		event({ userId: 42, chatId: 7, properties: { plan: "pro", nested: { a: 1 } } }),
	);
	await adapter.track(event({ userId: 42 }));

	const headers1 = requests[0]?.init.headers as Record<string, string>;
	const headers2 = requests[1]?.init.headers as Record<string, string>;
	assert.equal(
		headers1["x-forwarded-for"],
		headers2["x-forwarded-for"],
		"same user, same synthetic ip",
	);

	const body = JSON.parse(String(requests[0]?.init.body));
	assert.equal(body.domain, "bot.example");
	assert.deepEqual(
		body.props,
		{ plan: "pro", userId: 42, chatId: 7 },
		"nested object prop dropped",
	);
});

test("plausibleAdapter: distinct users map to distinct synthetic IPs", async () => {
	const requests: RequestInit[] = [];
	const fakeFetch = (async (_url: string | URL, init?: RequestInit) => {
		requests.push(init ?? {});
		return new Response(null, { status: 202 });
	}) as typeof fetch;
	const adapter = plausibleAdapter({ domain: "bot.example", fetch: fakeFetch });

	await adapter.track(event({ userId: 1 }));
	await adapter.track(event({ userId: 2 }));

	const ip1 = (requests[0]?.headers as Record<string, string>)["x-forwarded-for"];
	const ip2 = (requests[1]?.headers as Record<string, string>)["x-forwarded-for"];
	assert.notEqual(ip1, ip2);
});

test("plausibleAdapter: a non-ok response throws with the response body as detail", async () => {
	const fakeFetch = (async () => new Response("domain not found", { status: 404 })) as typeof fetch;
	const adapter = plausibleAdapter({ domain: "bot.example", fetch: fakeFetch });

	await assert.rejects(() => Promise.resolve(adapter.track(event())), /404.*domain not found/);
});

// ── clickhouseAdapter ───────────────────────────────────────────────────────────────────────

test("clickhouseAdapter: a failing insert is retried and the batch is NOT lost", {
	timeout: 5000,
}, async () => {
	let attempts = 0;
	const inserted: unknown[][] = [];
	const client: ClickHouseLike = {
		insert: async ({ values }) => {
			attempts++;
			if (attempts < 2) throw new Error("clickhouse unavailable");
			inserted.push(values);
		},
	};
	const adapter = clickhouseAdapter(client, {
		batchSize: 3,
		intervalMs: 0,
		maxRetries: 3,
		retryDelayMs: 5,
	});

	adapter.track(event({ name: "e1" }));
	adapter.track(event({ name: "e2" }));
	adapter.track(event({ name: "e3" })); // triggers the (failing) first send

	await waitUntil(() => inserted.length > 0);
	await adapter.flush?.();

	assert.equal(attempts, 2, "retried after the first failure");
	assert.equal(inserted.length, 1);
	assert.equal(inserted[0]?.length, 3, "all 3 events made it — none lost to the failed attempt");
});

test("clickhouseSchema() names the configured table and columns", () => {
	assert.match(clickhouseSchema("custom_table"), /CREATE TABLE IF NOT EXISTS custom_table/);
	assert.match(clickhouseSchema(), /yaebal_analytics_events/);
});

// ── httpAdapter ─────────────────────────────────────────────────────────────────────────────

test("httpAdapter: batches events and posts JSON", async () => {
	const bodies: unknown[] = [];
	const fakeFetch = (async (_url: string | URL, init?: RequestInit) => {
		bodies.push(JSON.parse(String(init?.body)));
		return new Response(null, { status: 200 });
	}) as typeof fetch;

	const adapter = httpAdapter("https://collector.example/events", {
		fetch: fakeFetch,
		batchSize: 2,
		intervalMs: 0,
	});

	adapter.track(event({ name: "a" }));
	adapter.track(event({ name: "b" }));
	await Promise.resolve();
	await Promise.resolve();

	assert.equal(bodies.length, 1);
	assert.equal((bodies[0] as { events: AnalyticsEvent[] }).events.length, 2);
});

test("httpAdapter: a non-ok response is retried, not silently dropped", {
	timeout: 5000,
}, async () => {
	let attempts = 0;
	const fakeFetch = (async () => {
		attempts++;
		return attempts < 2 ? new Response("", { status: 500 }) : new Response(null, { status: 200 });
	}) as typeof fetch;

	const adapter = httpAdapter("https://collector.example/events", {
		fetch: fakeFetch,
		batchSize: 1,
		intervalMs: 0,
		maxRetries: 2,
		retryDelayMs: 5,
	});

	adapter.track(event());
	await waitUntil(() => attempts >= 2);
	await adapter.flush?.();

	assert.equal(attempts, 2);
});

// ── sqliteAdapter — node:sqlite is only available on node 22.5+ (mirrors packages/panel's guard) ──

let sqliteAdapterModule: typeof import("./adapters/sqlite.js") | undefined;
try {
	sqliteAdapterModule = await import("./adapters/sqlite.js");
	// touch node:sqlite itself — the adapter module imports no builtin directly, so importing it
	// always succeeds; probe the builtin so the skip condition is accurate.
	await import("node:sqlite");
} catch {
	sqliteAdapterModule = undefined;
}
const sqliteSkip = sqliteAdapterModule ? false : "node:sqlite unavailable (requires node 22.5+)";

test("sqliteAdapter: writes rows and query()s a report", { skip: sqliteSkip }, async () => {
	const { DatabaseSync } = await import("node:sqlite");
	const { sqliteAdapter } = sqliteAdapterModule as NonNullable<typeof sqliteAdapterModule>;

	const db = new DatabaseSync(":memory:");
	const adapter = sqliteAdapter(db);

	adapter.track(event({ name: "a", userId: 1, timestamp: 1000, properties: { x: 1 } }));
	adapter.track(event({ name: "a", timestamp: 2000 }));
	adapter.track(event({ name: "b", timestamp: 2000 }));

	const report = await adapter.query?.({ since: 1500 });
	assert.equal(report?.total, 2);
	assert.deepEqual(report?.topEvents, [
		{ name: "a", count: 1 },
		{ name: "b", count: 1 },
	]);

	const row = db
		.prepare('SELECT * FROM "yaebal_analytics_events" WHERE "name" = \'a\' AND "user_id" = \'1\'')
		.get();
	assert.ok(row);
});

test("sqliteAdapter: rejects an invalid table name", { skip: sqliteSkip }, async () => {
	const { DatabaseSync } = await import("node:sqlite");
	const { sqliteAdapter } = sqliteAdapterModule as NonNullable<typeof sqliteAdapterModule>;

	assert.throws(() => sqliteAdapter(new DatabaseSync(":memory:"), { table: "bad; DROP TABLE x" }));
});
