import assert from "node:assert/strict";
import test from "node:test";
import { Bot } from "./bot.js";

const info = { id: 1, is_bot: true, first_name: "bot" };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T = void>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("stop cancels startup getMe and skips start handlers", async (t) => {
	const requested = deferred();
	const response = deferred<Response>();
	let signal: AbortSignal | null | undefined;
	t.mock.method(globalThis, "fetch", (_url: unknown, options?: RequestInit) => {
		signal = options?.signal;
		requested.resolve();
		signal?.addEventListener("abort", () =>
			response.resolve(new Response(JSON.stringify({ ok: true, result: info }))),
		);
		return response.promise;
	});
	let starts = 0;
	const bot = new Bot("123:test").onStart(() => {
		starts++;
	});
	const polling = bot.start();
	await requested.promise;
	await bot.stop();
	await tick();
	assert.equal(signal?.aborted, true);
	await polling;
	assert.equal(starts, 0);
});

test("a stopped startup does not invoke subsequent onStart handlers", async () => {
	let second = false;
	const bot: Bot = new Bot("123:test", { botInfo: info })
		.onStart(() => bot.stop())
		.onStart(() => {
			second = true;
		});
	await bot.start();
	assert.equal(second, false);
});

test("restart replaces an aborted getMe even when the old transport settles late", async (t) => {
	const old = deferred<Response>();
	const requested = deferred();
	const initialized = deferred();
	let probes = 0;
	t.mock.method(globalThis, "fetch", (url: unknown, options?: RequestInit) => {
		if (String(url).endsWith("/getMe")) {
			if (++probes === 1) {
				requested.resolve();
				return old.promise;
			}
			return Promise.resolve(new Response(JSON.stringify({ ok: true, result: info })));
		}
		return new Promise<Response>((_resolve, reject) => {
			if (options?.signal?.aborted) reject(options.signal.reason);
			else
				options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
					once: true,
				});
		});
	});
	const bot = new Bot("123:test").onStart(() => initialized.resolve());
	const first = bot.start();
	await requested.promise;
	await bot.stop();
	await first;
	const second = bot.start();
	await tick();
	assert.equal(probes, 2);
	old.resolve(new Response(JSON.stringify({ ok: true, result: { ...info, id: 999 } })));
	await initialized.promise;
	await bot.stop();
	await second;
	assert.equal(bot.info?.id, 1, "the cancelled probe must not overwrite newer bot info");
});

test("restart waits for the previous polling cycle to finish", async (t) => {
	const handled = deferred();
	const release = deferred();
	const restarted = deferred();
	let starts = 0;
	let polls = 0;
	const bot = new Bot("123:test", { botInfo: info }).onStart(() => {
		if (++starts === 2) restarted.resolve();
	});
	t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
		if (++polls === 1)
			return new Response(
				JSON.stringify({
					ok: true,
					result: [
						{ update_id: 1, message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } } },
					],
				}),
			);
		return new Promise<Response>((_resolve, reject) => {
			if (options?.signal?.aborted) reject(options.signal.reason);
			else
				options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
					once: true,
				});
		});
	});
	bot.on("message", async () => {
		handled.resolve();
		await release.promise;
	});
	const first = bot.start();
	await handled.promise;
	await bot.stop();
	const second = bot.start();
	const settled = Promise.allSettled([first, second]);
	await tick();
	const startsBeforeRelease = starts;
	release.resolve();
	await restarted.promise;
	await bot.stop();
	assert.deepEqual((await settled).map((result) => result.status), ["fulfilled", "fulfilled"]);
	assert.equal(startsBeforeRelease, 1, "restart must not overlap an old handler");
});

test("stop finishes the current update but leaves the rest of the batch for restart", async (t) => {
	const seen: number[] = [];
	t.mock.method(
		globalThis,
		"fetch",
		async () =>
			new Response(
				JSON.stringify({
					ok: true,
					result: [1, 2].map((id) => ({
						update_id: id,
						message: { message_id: id, date: 0, chat: { id: 1, type: "private" } },
					})),
				}),
			),
	);
	const bot = new Bot("123:test", { botInfo: info }).on("message", async (ctx) => {
		seen.push(ctx.update.update_id);
		await bot.stop();
	});
	await bot.start();
	assert.deepEqual(seen, [1]);
});

test("stop callbacks are reentrant and remaining callbacks run after a failure", async () => {
	let calls = 0;
	let cleaned = false;
	const failure = new Error("cleanup failed");
	const bot = new Bot("123:test")
		.onStop(() => {
			if (++calls === 1) void bot.stop().catch(() => {});
			throw failure;
		})
		.onStop(() => {
			cleaned = true;
		});
	await assert.rejects(bot.stop(), (error) => error === failure);
	assert.equal(calls, 1);
	assert.equal(cleaned, true);
});
