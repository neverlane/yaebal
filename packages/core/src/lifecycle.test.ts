import assert from "node:assert/strict";
import test from "node:test";
import { Bot } from "./bot.js";
import { Composer } from "./composer.js";
import type { Context } from "./context.js";

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
	assert.deepEqual(
		(await settled).map((result) => result.status),
		["fulfilled", "fulfilled"],
	);
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

test("a stop mid-batch confirms the handled updates so a restart doesn't redeliver them", {
	timeout: 5_000,
}, async (t) => {
	const polls: Record<string, unknown>[] = [];
	t.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
		const params = JSON.parse(String(options?.body ?? "{}")) as Record<string, unknown>;
		if (String(url).endsWith("/getUpdates")) polls.push(params);
		const result =
			polls.length === 1
				? [
						{
							update_id: 10,
							message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
						},
						{
							update_id: 11,
							message: { message_id: 2, date: 0, chat: { id: 1, type: "private" } },
						},
					]
				: [];
		return new Response(JSON.stringify({ ok: true, result }));
	});

	const seen: number[] = [];
	const bot: Bot = new Bot("123:test", { botInfo: info });
	bot.use(async (ctx) => {
		seen.push(ctx.update.update_id);
		await bot.stop();
	});
	await bot.start();

	assert.deepEqual(seen, [10], "the rest of the batch is left for the next start");
	assert.equal(polls.length, 2);
	assert.deepEqual(polls[1], { offset: 11, limit: 1, timeout: 0 });
});

test("a stop while idle in the long poll sends no extra confirmation", {
	timeout: 5_000,
}, async (t) => {
	let polls = 0;
	const requested = deferred();
	t.mock.method(globalThis, "fetch", (url: unknown, options?: RequestInit) => {
		if (String(url).endsWith("/getUpdates")) polls++;
		requested.resolve();
		return new Promise<Response>((_resolve, reject) => {
			options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
				once: true,
			});
		});
	});

	const bot = new Bot("123:test", { botInfo: info });
	const polling = bot.start();
	await requested.promise;
	await bot.stop();
	await polling;
	assert.equal(polls, 1);
});

test("allowedUpdates opts into withheld update types the bot actually handles", () => {
	const plain = new Bot("123:test").on("message", () => {});
	assert.equal(plain.allowedUpdates(), undefined, "nothing withheld is handled → telegram default");

	const feature = new Composer<Context>().on("message_reaction", () => {});
	const bot = new Bot("123:test").on(["message", "chat_member"], () => {}).extend(feature);
	const allowed = bot.allowedUpdates() ?? [];
	assert.ok(allowed.includes("chat_member"));
	assert.ok(allowed.includes("message_reaction"), "extended composers count too");
	assert.ok(!allowed.includes("message_reaction_count"), "unhandled opt-in types stay off");
	assert.ok(allowed.includes("callback_query"), "the default set is kept, never narrowed");

	const explicit = new Bot("123:test", { allowedUpdates: ["message"] }).on("chat_member", () => {});
	assert.deepEqual(explicit.allowedUpdates(), ["message"], "an explicit option always wins");
});

test("start() sends the derived allowed_updates", { timeout: 5_000 }, async (t) => {
	let sent: unknown;
	t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
		sent = (JSON.parse(String(options?.body)) as Record<string, unknown>).allowed_updates;
		await bot.stop();
		return new Response(JSON.stringify({ ok: true, result: [] }));
	});
	const bot: Bot = new Bot("123:test", { botInfo: info }).derive("chat_member", () => ({}));
	await bot.start();
	assert.ok(Array.isArray(sent) && sent.includes("chat_member"));
});
