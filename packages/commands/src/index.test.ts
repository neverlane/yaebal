import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { type BotCommandScope, commands } from "./index.js";

const ADMINS: BotCommandScope = { type: "all_chat_administrators" };

test("plugin() wires handlers; ctx.args carries the arguments", async () => {
	const cmd = commands().add("echo", "echo the args", (ctx) => ctx.reply(ctx.args.join(" ")));

	const env = createTestEnv(new Composer<Context>().install(cmd.plugin()));
	await env.createUser().sendCommand("echo", "one two");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "one two");
});

test("handlers see the registry's accumulated context type", async () => {
	type Ctx = Context & { greeting: string };
	const cmd = commands<Ctx>().add("hi", "greet", (ctx) => ctx.reply(`${ctx.greeting}!`));

	const bot = new Composer<Context>().decorate({ greeting: "hello" }).install(cmd.plugin());
	const env = createTestEnv(bot);
	await env.createUser().sendCommand("hi");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "hello!");
});

test("aliases share the handlers; only the first name shows in the menu", async () => {
	let hits = 0;
	const cmd = commands().add(["start", "s"], "start the bot", () => {
		hits++;
	});

	const env = createTestEnv(new Composer<Context>().install(cmd.plugin()));
	const user = env.createUser();
	await user.sendCommand("start");
	await user.sendCommand("s");

	assert.equal(hits, 2);
	assert.deepEqual(cmd.list(), [{ command: "start", description: "start the bot" }]);
});

test("hidden() commands handle updates but stay out of every menu", async () => {
	const cmd = commands()
		.add("start", "go", () => {})
		.hidden("debug", (ctx) => ctx.reply("dbg"));

	const env = createTestEnv(new Composer<Context>().install(cmd.plugin()));
	await env.createUser().sendCommand("debug");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "dbg");
	assert.deepEqual(
		cmd.list().map((c) => c.command),
		["start"],
	);
	assert.equal(cmd.menus().length, 1);
});

test("menu-only entries (no handlers) register no middleware", async () => {
	const cmd = commands().add("info", "menu-only entry");

	const env = createTestEnv(new Composer<Context>().install(cmd.plugin()), {
		strictDispatch: true,
	});

	await assert.rejects(async () => env.createUser().sendCommand("info"));
	assert.deepEqual(cmd.list(), [{ command: "info", description: "menu-only entry" }]);
});

test("list() localizes with fallback to the default description", () => {
	const cmd = commands()
		.add("start", { default: "start the bot", ru: "запустить бота" }, () => {})
		.add("help", "show help", () => {});

	assert.deepEqual(cmd.list({ languageCode: "ru" }), [
		{ command: "start", description: "запустить бота" },
		{ command: "help", description: "show help" },
	]);
});

test("scoped() menus repeat the unscoped commands; unknown scopes fall back", () => {
	const cmd = commands().add("start", "go", () => {});
	cmd
		.scoped(ADMINS)
		.add("ban", "ban a user", () => {})
		.add("unban", "unban a user", () => {});

	assert.deepEqual(
		cmd.list({ scope: ADMINS }).map((c) => c.command),
		["start", "ban", "unban"],
	);
	assert.deepEqual(
		cmd.list().map((c) => c.command),
		["start"],
	);
	assert.deepEqual(
		cmd.list({ scope: { type: "all_private_chats" } }).map((c) => c.command),
		["start"],
	);
});

test("menus() yields one entry per (scope, language) pair", () => {
	const cmd = commands().add("start", { default: "go", ru: "старт" }, () => {});
	cmd.scoped(ADMINS).add("ban", { default: "ban", de: "bannen" }, () => {});

	assert.deepEqual(cmd.menus(), [
		{ commands: [{ command: "start", description: "go" }] },
		{ languageCode: "ru", commands: [{ command: "start", description: "старт" }] },
		{
			scope: ADMINS,
			commands: [
				{ command: "start", description: "go" },
				{ command: "ban", description: "ban" },
			],
		},
		{
			scope: ADMINS,
			languageCode: "de",
			commands: [
				{ command: "start", description: "go" },
				{ command: "ban", description: "bannen" },
			],
		},
		{
			scope: ADMINS,
			languageCode: "ru",
			commands: [
				{ command: "start", description: "старт" },
				{ command: "ban", description: "ban" },
			],
		},
	]);
});

test("register() pushes every menu via setMyCommands", async () => {
	const cmd = commands().add("start", { default: "go", ru: "старт" }, () => {});
	cmd.scoped(ADMINS).add("ban", "ban a user", () => {});

	const env = createTestEnv(new Composer<Context>());
	await cmd.register(env.api);

	// the scoped menu repeats "start", so its group inherits the ru locale too
	const calls = env.callsTo("setMyCommands");
	assert.equal(calls.length, 4);
	assert.deepEqual(calls[0]?.params, {
		commands: [{ command: "start", description: "go" }],
	});
	assert.deepEqual(calls[1]?.params, {
		commands: [{ command: "start", description: "старт" }],
		language_code: "ru",
	});
	assert.deepEqual(calls[2]?.params, {
		commands: [
			{ command: "start", description: "go" },
			{ command: "ban", description: "ban a user" },
		],
		scope: ADMINS,
	});
	assert.deepEqual(calls[3]?.params, {
		commands: [
			{ command: "start", description: "старт" },
			{ command: "ban", description: "ban a user" },
		],
		scope: ADMINS,
		language_code: "ru",
	});
});

test("register() with scope/languageCode pushes that single menu", async () => {
	const cmd = commands().add("start", { default: "go", ru: "старт" }, () => {});
	cmd.scoped(ADMINS).add("ban", "ban a user", () => {});

	const env = createTestEnv(new Composer<Context>());
	await cmd.register(env.api, { scope: ADMINS, languageCode: "ru" });

	const calls = env.callsTo("setMyCommands");
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0]?.params, {
		commands: [
			{ command: "start", description: "старт" },
			{ command: "ban", description: "ban a user" },
		],
		scope: ADMINS,
		language_code: "ru",
	});
});

test("sync() pushes only the menus that changed", async () => {
	const cmd = commands().add("start", { default: "go", ru: "старт" }, () => {});

	const env = createTestEnv(new Composer<Context>());
	env.onApi("getMyCommands", (params: Record<string, unknown> | undefined) =>
		params?.language_code === "ru" ? [{ command: "start", description: "старт" }] : [],
	);

	const result = await cmd.sync(env.api);

	assert.equal(result.pushed.length, 1);
	assert.equal(result.skipped.length, 1);
	assert.equal(result.skipped[0]?.languageCode, "ru");

	const sets = env.callsTo("setMyCommands");
	assert.equal(sets.length, 1);
	assert.deepEqual(sets[0]?.params, { commands: [{ command: "start", description: "go" }] });
});

test("unregister() clears every managed menu", async () => {
	const cmd = commands().add("start", { default: "go", ru: "старт" }, () => {});

	const env = createTestEnv(new Composer<Context>());
	await cmd.unregister(env.api);

	const dels = env.callsTo("deleteMyCommands");
	assert.equal(dels.length, 2);
	assert.deepEqual(dels[0]?.params, {});
	assert.deepEqual(dels[1]?.params, { language_code: "ru" });
});

test("add() validates names, descriptions, locales and duplicates", () => {
	const cmd = commands();

	assert.throws(() => cmd.add("Start", "x"), /invalid command name/);
	assert.throws(() => cmd.add("has space", "x"), /invalid command name/);
	assert.throws(() => cmd.add("a".repeat(33), "x"), /invalid command name/);
	assert.throws(() => cmd.hidden("Bad", () => {}), /invalid command name/);
	assert.throws(() => cmd.add([], "x"), /at least one name/);

	assert.throws(() => cmd.add("ok", ""), /must be 1-256 chars/);
	assert.throws(() => cmd.add("ok", "y".repeat(257)), /must be 1-256 chars/);
	assert.throws(() => cmd.add("ok", { default: "x", russian: "у" }), /invalid language code/);

	cmd.add("start", "go");
	assert.throws(() => cmd.add("start", "again"), /duplicate command name/);
	assert.throws(() => cmd.add(["other", "start"], "alias clash"), /duplicate command name/);
});

test("a menu cannot exceed 100 commands (scoped menus count repeated ones)", () => {
	const cmd = commands();
	for (let i = 1; i <= 100; i++) cmd.add(`c${i}`, "x");

	assert.throws(() => cmd.add("c101", "x"), /at most 100/);
	assert.throws(() => cmd.scoped(ADMINS).add("extra", "x"), /at most 100/);
});
