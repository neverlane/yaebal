import assert from "node:assert/strict";
import test from "node:test";
import { Bot, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { createCron, cron, cronAdmin } from "./index.js";

test("createCron() returns a standalone scheduler with no bot wiring", {
	timeout: 5000,
}, async () => {
	let ran = false;
	const scheduler = createCron().job("solo", 60_000, () => {
		ran = true;
	});

	assert.equal(await scheduler.trigger("solo"), "ran");
	assert.equal(ran, true);
});

/** a minimal structural stand-in for `Bot` — exercises exactly the surface `cron()`'s `install`
 * touches (`onStart`, `onStop`, `decorate`), without spinning up a real bot or network client. */
function fakeBot() {
	const startHandlers: Array<() => unknown> = [];
	const stopHandlers: Array<() => unknown> = [];
	const bot = {
		onStart: (handler: () => unknown) => {
			startHandlers.push(handler);
			return bot;
		},
		onStop: (handler: () => unknown) => {
			stopHandlers.push(handler);
			return bot;
		},
		decorate: (value: object) => Object.assign(bot, value),
	};
	return { bot, startHandlers, stopHandlers };
}

test("cron() plugin wires bot.onStart/onStop, exposes .handle, and decorates ctx.cron", {
	timeout: 5000,
}, async () => {
	const { bot, startHandlers, stopHandlers } = fakeBot();

	let runs = 0;
	const plugin = cron({ jobs: { ping: { schedule: 15, task: () => void runs++ } } });

	// biome-ignore lint/suspicious/noExplicitAny: exercising the plugin against a minimal bot stub
	const out = (plugin as any)(bot);
	assert.equal(out, bot);
	assert.equal(plugin.handle.running, false);
	// biome-ignore lint/suspicious/noExplicitAny: reading the decoration off the same stub
	assert.equal((bot as any).cron, plugin.handle);

	for (const start of startHandlers) start();
	assert.equal(plugin.handle.running, true);

	await new Promise<void>((resolve) => setTimeout(resolve, 40));
	assert.ok(runs >= 1);

	for (const stop of stopHandlers) await stop();
	assert.equal(plugin.handle.running, false);
});

test("cron() plugin's ctx.cron reaches real command handlers", { timeout: 5000 }, async () => {
	let runs = 0;
	const bot = new Bot<Context>("dummy-token")
		.install(cron({ jobs: { digest: { schedule: 60_000, task: () => void runs++ } } }))
		.command("run-digest", async (ctx) => {
			const outcome = await ctx.cron.trigger("digest");
			await ctx.reply(outcome);
		});

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("run-digest");

	assert.equal(runs, 1);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "ran");
});

function botWithAdmin(isAdmin: (ctx: Context & { cron: unknown }) => boolean) {
	return new Bot<Context>("dummy-token")
		.install(
			cron({
				jobs: {
					digest: { schedule: "0 9 * * *", task: () => {} },
					cleanup: { schedule: 60_000, task: () => {} },
				},
			}),
		)
		.install(cronAdmin({ isAdmin }));
}

test("cronAdmin: /cron lists every job's state", { timeout: 5000 }, async () => {
	const bot = botWithAdmin(() => true);
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("cron");
	const text = String(env.lastApiCall("sendMessage")?.params?.text);
	assert.match(text, /digest/);
	assert.match(text, /cleanup/);
	assert.match(text, /runs: 0 · failures: 0/);
});

test("cronAdmin: /cron run <name> triggers it and reports the outcome", {
	timeout: 5000,
}, async () => {
	const bot = botWithAdmin(() => true);
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("cron", "run cleanup");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "cleanup: ran");
});

test("cronAdmin: /cron pause and /cron resume toggle a job's automatic schedule", {
	timeout: 5000,
}, async () => {
	const bot = botWithAdmin(() => true);
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("cron", "pause cleanup");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "cleanup: paused");

	await user.sendCommand("cron", "resume cleanup");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "cleanup: resumed");
});

test("cronAdmin: /cron next <name> previews upcoming fire times", { timeout: 5000 }, async () => {
	const bot = botWithAdmin(() => true);
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("cron", "next digest");
	const text = String(env.lastApiCall("sendMessage")?.params?.text);
	assert.equal(text.split("\n").length, 3); // 3 previewed runs, one per line
});

test("cronAdmin: an unknown action or job name replies with a message instead of crashing", {
	timeout: 5000,
}, async () => {
	const bot = botWithAdmin(() => true);
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("cron", "run missing-job");
	assert.match(String(env.lastApiCall("sendMessage")?.params?.text), /was not found/);

	await user.sendCommand("cron", "frobnicate cleanup");
	assert.match(String(env.lastApiCall("sendMessage")?.params?.text), /^usage: \/cron/);
});

test("cronAdmin: a rejected isAdmin check continues the outer chain instead of halting it", {
	timeout: 5000,
}, async () => {
	const bot = botWithAdmin(() => false).command("ping", (ctx) => ctx.reply("pong"));
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("cron");
	assert.equal(env.lastApiCall("sendMessage"), undefined); // admin branch silently declined

	await env.createUser().sendCommand("ping");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "pong"); // outer chain still runs
});

test("cronAdmin: the command name is configurable", { timeout: 5000 }, async () => {
	const bot = new Bot<Context>("dummy-token")
		.install(cron({ jobs: { digest: { schedule: 60_000, task: () => {} } } }))
		.install(cronAdmin({ isAdmin: () => true, command: "jobs" }));
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("jobs");
	assert.match(String(env.lastApiCall("sendMessage")?.params?.text), /digest/);
});
