import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { createTempRoutes } from "./__fixtures__/dynamic.js";
import { loadRoutes } from "./load.js";

const TIMEOUT = 10_000;

test("loadRoutes: full tree — commands with alias/menu, nested guard, on, hears, use ordering", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);

	await routes.write(
		"commands/start.mjs",
		`export default router.defineCommand("start", { description: "start the bot" }, (ctx) => ctx.reply("started"));`,
	);
	await routes.write(
		"commands/help.mjs",
		`export default router.defineCommand(["help", "h"], (ctx) => ctx.reply("help text"));`,
	);
	await routes.write(
		"commands/admin/_guard.mjs",
		`export default router.defineGuard((ctx) => ctx.update.message?.from?.username === "admin");`,
	);
	await routes.write(
		"commands/admin/ban.mjs",
		`export default router.defineCommand("ban", (ctx) => ctx.reply("banned"));`,
	);
	await routes.write(
		"on/message.text.mjs",
		`export default router.defineOn("message:text", (ctx) => ctx.reply("trace:" + JSON.stringify(ctx.trace ?? [])));`,
	);
	await routes.write(
		"hears/ping.mjs",
		`export default router.defineHears("ping", (ctx) => ctx.reply("pong"));`,
	);
	await routes.write(
		"use/10-first.mjs",
		`export default router.defineUse((ctx, next) => { ctx.trace = [...(ctx.trace ?? []), "first"]; return next(); });`,
	);
	await routes.write(
		"use/20-second.mjs",
		`export default router.defineUse((ctx, next) => { ctx.trace = [...(ctx.trace ?? []), "second"]; return next(); });`,
	);

	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const result = await loadRoutes(bot, routes.dir);

	assert.deepEqual(result.warnings, []);
	assert.deepEqual(result.commands, [{ command: "start", description: "start the bot" }]);
	assert.deepEqual(result.routes.map((r) => `${r.kind}:${r.trigger}`).sort(), [
		"command:ban",
		"command:help",
		"command:start",
		"hears:ping",
		"on:message:text",
		"use:first",
		"use:second",
	]);

	await env.createUser().sendCommand("start");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "started");

	await env.createUser().sendCommand("h");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "help text");

	env.clearApiCalls();
	await env.createUser().sendCommand("ban");
	assert.equal(
		env.lastApiCall("sendMessage"),
		undefined,
		"a non-admin must be blocked by the nested guard",
	);

	await env.createUser({ username: "admin" }).sendCommand("ban");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "banned");

	await env.createUser().sendMessage("ping");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "pong");

	await env.createUser().sendMessage("hello");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, 'trace:["first","second"]');
});

test("loadRoutes: fixed kind order (use, command, hears, on) and numeric-prefix ordering within a kind", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);

	await routes.write("use/20-b.mjs", `export default router.defineUse((ctx, next) => next());`);
	await routes.write("use/10-a.mjs", `export default router.defineUse((ctx, next) => next());`);
	await routes.write("commands/z.mjs", `export default router.defineCommand("z", (ctx) => {});`);
	await routes.write("hears/h.mjs", `export default router.defineHears("h", (ctx) => {});`);
	await routes.write("on/message.mjs", `export default router.defineOn("message", (ctx) => {});`);

	const bot = new Composer<Context>();
	const result = await loadRoutes(bot, routes.dir);

	assert.deepEqual(
		result.routes.map((r) => `${r.kind}:${r.trigger}`),
		["use:a", "use:b", "command:z", "hears:h", "on:message"],
	);
});

test("loadRoutes: a missing routes directory is a silent no-op", { timeout: TIMEOUT }, async () => {
	const bot = new Composer<Context>();
	const result = await loadRoutes(bot, "/no/such/yaebal-router-fixture/dir");
	assert.deepEqual(result, { routes: [], commands: [], warnings: [] });
});

test("loadRoutes: a non-ENOENT fs error propagates instead of being swallowed", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);

	// a plain file where `commands/` should be a directory — readdir() throws ENOTDIR, not ENOENT.
	await writeFile(join(routes.dir, "commands"), "not a directory");

	const bot = new Composer<Context>();
	await assert.rejects(() => loadRoutes(bot, routes.dir), /failed to read/);
});

test("loadRoutes: strict (default) throws on a non-route default export", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write("commands/oops.mjs", `export default 42;`);

	const bot = new Composer<Context>();
	await assert.rejects(
		() => loadRoutes(bot, routes.dir),
		/must default-export a define\*\(\) route/,
	);
});

test("loadRoutes: strict: false turns the same failure into a warning and skips it", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write("commands/oops.mjs", `export default 42;`);

	const bot = new Composer<Context>();
	const result = await loadRoutes(bot, routes.dir, { strict: false });

	assert.deepEqual(result.routes, []);
	assert.equal(result.warnings.length, 1);
	assert.match(result.warnings[0]?.message ?? "", /must default-export a define\*\(\) route/);
});

test("loadRoutes: a route defined in the wrong kind directory throws", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write(
		"commands/oops.mjs",
		`export default router.defineOn("message", (ctx) => {});`,
	);

	const bot = new Composer<Context>();
	await assert.rejects(() => loadRoutes(bot, routes.dir), /expects a defineCommand\(\) route/);
});

test("loadRoutes: an invalid command name throws", { timeout: TIMEOUT }, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write(
		"commands/Bad-Name.mjs",
		`export default router.defineCommand("Bad-Name", (ctx) => {});`,
	);

	const bot = new Composer<Context>();
	await assert.rejects(() => loadRoutes(bot, routes.dir), /not a valid telegram command name/);
});

test("loadRoutes: a typo'd update type throws with a did-you-mean", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	// a plain .mjs fixture has no compile-time FilterQuery check, exactly like a JS route file
	// wouldn't — this is precisely the footgun the load-time check exists to catch.
	await routes.write(
		"on/mesage.text.mjs",
		`export default router.defineOn("mesage:text", (ctx) => {});`,
	);

	const bot = new Composer<Context>();
	await assert.rejects(() => loadRoutes(bot, routes.dir), /did you mean "message"/);
});

test("loadRoutes: a duplicate command name across files throws", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write("commands/a.mjs", `export default router.defineCommand("dup", (ctx) => {});`);
	await routes.write("commands/b.mjs", `export default router.defineCommand("dup", (ctx) => {});`);

	const bot = new Composer<Context>();
	await assert.rejects(() => loadRoutes(bot, routes.dir), /duplicate route "dup"/);
});

test("loadRoutes: a filename/trigger mismatch only warns — it still registers and runs", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write(
		"commands/foo.mjs",
		`export default router.defineCommand("bar", (ctx) => ctx.reply("ok"));`,
	);

	const bot = new Composer<Context>();
	const env = createTestEnv(bot);
	const result = await loadRoutes(bot, routes.dir); // strict: true (default) — must NOT throw

	assert.equal(result.warnings.length, 1);
	assert.match(
		result.warnings[0]?.message ?? "",
		/filename suggests "foo" but the route declares "bar"/,
	);
	assert.deepEqual(result.routes, [{ kind: "command", trigger: "bar", file: "commands/foo" }]);

	await env.createUser().sendCommand("bar");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "ok");
});

test("loadRoutes: a broken _guard.ts always throws, even under strict: false", {
	timeout: TIMEOUT,
}, async (t) => {
	const routes = await createTempRoutes();
	t.after(routes.cleanup);
	await routes.write("commands/_guard.mjs", `export default 42;`);
	await routes.write("commands/x.mjs", `export default router.defineCommand("x", (ctx) => {});`);

	const bot = new Composer<Context>();
	await assert.rejects(
		() => loadRoutes(bot, routes.dir, { strict: false }),
		/must default-export defineGuard/,
	);
});
