import assert from "node:assert/strict";
import test from "node:test";
import { type Api, TelegramError } from "@yaebal/core";
import { Broadcast, type BroadcastEvent, broadcast, MemoryBroadcastStorage } from "./index.js";

function fakeApi(failOn: Array<number | string> = []) {
	const sentTo: Array<number | string> = [];
	const seen: Array<Record<string, unknown>> = [];
	const api = {
		sendMessage: (params: Record<string, unknown>) => {
			seen.push(params);
			if (failOn.includes(params.chat_id as number | string))
				return Promise.reject(new Error("blocked"));
			sentTo.push(params.chat_id as number | string);
			return Promise.resolve({ message_id: 1 });
		},
		call: (method: string, params?: Record<string, unknown>) => {
			seen.push({ method, ...params });
			return Promise.resolve({ message_id: 1 });
		},
	} as unknown as Api;

	return { api, sentTo, seen };
}

test("broadcast sends to every chat and reports a completed job", async () => {
	const { api, sentTo } = fakeApi();
	const result = await broadcast(api, [1, 2, 3], "hi", { rateLimit: false });

	assert.equal(result.status, "completed");
	assert.equal(result.total, 3);
	assert.equal(result.sent, 3);
	assert.equal(result.failed, 0);
	assert.equal(result.skipped, 0);
	assert.deepEqual(sentTo, [1, 2, 3]);
});

test("broadcast survives failures and reports them", async () => {
	const { api, sentTo } = fakeApi([2]);
	const failures: Array<number | string> = [];
	const seenStatuses: string[] = [];

	const result = await broadcast(api, [1, 2, 3], "hi", {
		rateLimit: false,
		retry: false,
		onError: (id, _error, delivery) => {
			failures.push(id);
			seenStatuses.push(delivery.status);
		},
	});

	assert.equal(result.sent, 2);
	assert.equal(result.failed, 1);
	assert.deepEqual(sentTo, [1, 3]);
	assert.deepEqual(failures, [2]);
	// onError must see the terminal status, not the stale "running" it held mid-process
	assert.deepEqual(seenStatuses, ["failed"]);
});

test("broadcast merges extra params into every send", async () => {
	const { api, seen } = fakeApi();

	await broadcast(api, [10], "yo", { rateLimit: false, extra: { parse_mode: "HTML" } });
	assert.deepEqual(seen, [{ chat_id: 10, text: "yo", parse_mode: "HTML" }]);
});

test("broadcast skips telegram 403 by default", async () => {
	const sentTo: number[] = [];
	const api = {
		sendMessage: (params: Record<string, unknown>) => {
			if (params.chat_id === 2) throw new TelegramError("sendMessage", 403, "bot was blocked");
			sentTo.push(params.chat_id as number);
			return Promise.resolve({ message_id: 1 });
		},
	} as unknown as Api;

	const result = await broadcast(api, [1, 2, 3], "hi", { rateLimit: false });

	assert.equal(result.sent, 2);
	assert.equal(result.failed, 0);
	assert.equal(result.skipped, 1);
	assert.deepEqual(sentTo, [1, 3]);
});

test("broadcast retries transient failures", async () => {
	let attempts = 0;
	const api = {
		sendMessage: () => {
			attempts++;
			if (attempts === 1) throw new TelegramError("sendMessage", 500, "internal");
			return Promise.resolve({ message_id: 1 });
		},
	} as unknown as Api;

	const result = await broadcast(api, [1], "hi", {
		rateLimit: false,
		retry: { attempts: 2, fixedDelayMs: 1 },
	});

	assert.equal(attempts, 2);
	assert.equal(result.sent, 1);
	assert.equal(result.retried, 1);
});

test("broadcast class supports typed definitions and shared storage", async () => {
	const storage = new MemoryBroadcastStorage();
	const calls: string[] = [];
	const api = fakeApi().api;
	const client = new Broadcast(api, { storage, rateLimit: false }).type(
		"digest",
		(chatId: number, title: string) => {
			calls.push(`${chatId}:${title}`);
		},
	);

	const job = await client.start("digest", [
		[1, "one"],
		[2, "two"],
	] as const);
	const result = await job.wait();

	assert.equal(result.sent, 2);
	assert.deepEqual(calls, ["1:one", "2:two"]);
	assert.equal((await storage.listDeliveries(job.id)).length, 2);
});

test("broadcast can pause and resume queued jobs", async () => {
	const events: string[] = [];
	const api = fakeApi().api;
	const client = new Broadcast(api, {
		autoRun: false,
		rateLimit: false,
		onEvent: (event: BroadcastEvent) => events.push(event.type),
	}).type("noop", () => {});

	const job = await client.start("noop", [[]] as const);
	await job.pause();
	client.run();
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal((await job.snapshot()).status, "paused");

	await job.resume();
	const result = await job.wait();

	assert.equal(result.status, "completed");
	assert(events.includes("job_paused"));
	assert(events.includes("job_resumed"));
});
