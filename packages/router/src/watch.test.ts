import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { createTempRoutes } from "./__fixtures__/dynamic.js";
import { watchRoutes } from "./watch.js";

const TIMEOUT = 20_000;

/** polls an observable effect until it holds — a hot-reload landing is inherently async (fs
 * events + a debounce), so this drives real updates through the bot rather than guessing a
 * fixed delay. fails loudly (via the surrounding test's own `{ timeout }`) if it never lands. */
async function waitUntil(check: () => Promise<boolean>, intervalMs = 40): Promise<void> {
	for (;;) {
		if (await check()) return;
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
}

test("watchRoutes: reloads on edit and keeps serving after the disposer runs", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);

	await routes.write(
		"commands/start.mjs",
		`export default router.defineCommand("start", (ctx) => ctx.reply("v1"));`,
	);

	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	let reloads = 0;

	const stop = await watchRoutes(bot, routes.dir, {
		debounceMs: 20,
		onReload: () => {
			reloads += 1;
		},
	});
	t.after(() => stop());

	assert.equal(reloads, 1, "the initial build itself counts as a reload");

	await env.createUser().sendCommand("start");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "v1");

	await routes.write(
		"commands/start.mjs",
		`export default router.defineCommand("start", (ctx) => ctx.reply("v2"));`,
	);

	await waitUntil(async () => {
		env.clearApiCalls();
		await env.createUser().sendCommand("start");
		return env.lastApiCall("sendMessage")?.params?.text === "v2";
	});
	assert.ok(reloads >= 2, "onReload must have fired again for the live edit");

	await stop();
	await stop(); // idempotent — must not throw

	// the route set from before disposal keeps serving; watchRoutes never tears down the mount.
	env.clearApiCalls();
	await env.createUser().sendCommand("start");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "v2");
});

test("watchRoutes: a failing first build throws, same as loadRoutes would", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write(
		"commands/Bad-Name.mjs",
		`export default router.defineCommand("Bad-Name", (ctx) => {});`,
	);

	const bot = new Composer<Context>();
	await assert.rejects(() => watchRoutes(bot, routes.dir), /not a valid telegram command name/);
});

test("watchRoutes: a broken live edit reports onError and keeps the last-good route set", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write(
		"commands/start.mjs",
		`export default router.defineCommand("start", (ctx) => ctx.reply("good"));`,
	);

	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	let lastError: unknown;

	const stop = await watchRoutes(bot, routes.dir, {
		debounceMs: 20,
		onError: (error) => {
			lastError = error;
		},
	});
	t.after(() => stop());

	// strict defaults to false under watchRoutes, so a genuinely non-route export becomes a
	// live warning; force a hard failure instead (a broken _guard.ts always throws) to prove
	// the bot keeps the previous, good route set live and reports the failure via onError.
	await routes.write("commands/_guard.mjs", `export default 42;`);

	await waitUntil(async () => lastError !== undefined);
	assert.match(
		String((lastError as Error)?.message ?? lastError),
		/must default-export defineGuard/,
	);

	env.clearApiCalls();
	await env.createUser().sendCommand("start");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "good");

	// stop watching (and closing the fs watchers) before the temp dir gets removed by cleanup.
	await stop();
});
