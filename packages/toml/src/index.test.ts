import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bot, Composer } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { createTomlPlugin, installToml, parseTomlConfig, validateTomlConfig } from "./index.js";

test("parse raw toml string", () => {
	const config = parseTomlConfig(`
[[commands]]
name = "start"
reply = "hi"
`);

	assert.deepEqual(config.commands, [{ name: "start", reply: "hi" }]);
});

test("parse toml file path", async () => {
	const dir = await mkdtemp(join(tmpdir(), "yaebal-toml-"));
	const file = join(dir, "bot.toml");

	try {
		await writeFile(file, `[[hears]]\ntext = "ping"\nreply = "pong"\n`);

		const config = parseTomlConfig(file);

		assert.deepEqual(config.hears, [{ text: "ping", reply: "pong" }]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("validate minimal empty config", () => {
	assert.deepEqual(validateTomlConfig({}), {});
});

test("validate command with reply", () => {
	assert.deepEqual(validateTomlConfig({ commands: [{ name: "start", reply: "hi" }] }), {
		commands: [{ name: "start", reply: "hi" }],
	});
});

test("validate command with missing reply or handler should fail", () => {
	assert.throws(
		() => validateTomlConfig({ commands: [{ name: "start" }] }),
		/commands\[0\] must define either reply or handler/,
	);
});

test("validate message with missing on should fail", () => {
	assert.throws(
		() => validateTomlConfig({ messages: [{ reply: "hi" }] }),
		/messages\[0\]\.on is required/,
	);
});

test("install registers command reply", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(composer, { commands: [{ name: "start", reply: "hi" }] });
	const sent = await user.sendCommand("start");

	assert.equal(env.apiCalls.length, 1);
	assert.deepEqual(env.lastApiCall()?.params, {
		chat_id: user.pmChat.id,
		text: "hi",
		reply_parameters: { message_id: sent.message_id },
	});
});

test("install throws on missing named handler", () => {
	assert.throws(
		() => installToml(new Composer(), { commands: [{ name: "ping", handler: "ping" }] }),
		/Missing handler "ping" referenced in commands\[0\]/,
	);
});

test("messages contains filter works", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(composer, {
		messages: [{ on: "message:text", contains: "yaebal", reply: "match" }],
	});

	await user.sendMessage("hello");
	await user.sendMessage("hello yaebal");

	assert.equal(env.callsTo("sendMessage").length, 1);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "match");
});

test("messages equals filter works", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(composer, {
		messages: [{ on: "message:text", equals: "secret", reply: "match" }],
	});

	await user.sendMessage("secret!");
	await user.sendMessage("secret");

	assert.equal(env.callsTo("sendMessage").length, 1);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "match");
});

test("parse error hints at a missing file for path-looking input", () => {
	assert.throws(
		() => parseTomlConfig("./nonexistent/bot"),
		/failed to parse toml config: [\s\S]*\(if "\.\/nonexistent\/bot" is a file path, the file does not exist\)/,
	);
});

test("missing .toml file fails with a read error", () => {
	assert.throws(
		() => parseTomlConfig("./nonexistent/bot.toml"),
		/failed to read toml config file "\.\/nonexistent\/bot\.toml"/,
	);
});

test("validate hears with both text and regex should fail", () => {
	assert.throws(
		() => validateTomlConfig({ hears: [{ text: "a", regex: "b", reply: "x" }] }),
		/hears\[0\] must not define both text and regex/,
	);
});

test("validate hears with neither text nor regex should fail", () => {
	assert.throws(
		() => validateTomlConfig({ hears: [{ reply: "x" }] }),
		/hears\[0\] must define either text or regex/,
	);
});

test("validate invalid regex should fail", () => {
	assert.throws(
		() => validateTomlConfig({ hears: [{ regex: "(", reply: "x" }] }),
		/hears\[0\]\.regex is not a valid regular expression/,
	);
});

test("validate unknown update type in on should fail", () => {
	assert.throws(
		() => validateTomlConfig({ messages: [{ on: "mesage:text", reply: "x" }] }),
		/messages\[0\]\.on unknown update type "mesage"/,
	);
});

test("install registers hears reply", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(composer, { hears: [{ text: "ping", reply: "pong" }] });
	await user.sendMessage("ping");
	await user.sendMessage("ping!");

	assert.equal(env.callsTo("sendMessage").length, 1);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "pong");
});

test("hears regex route matches by pattern", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(composer, { hears: [{ regex: "^p[io]ng$", reply: "match" }] });
	await user.sendMessage("ping");
	await user.sendMessage("pong");
	await user.sendMessage("pang");

	assert.equal(env.callsTo("sendMessage").length, 2);
});

test("callbacks regex route matches by pattern", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(composer, { callbacks: [{ regex: "^item:\\d+$", reply: "opened" }] });
	await user.click("item:42");
	await user.click("item:none");

	assert.equal(env.callsTo("sendMessage").length, 1);
});

test("callback reply answers the callback query", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(composer, { callbacks: [{ data: "buy", reply: "bought" }] });
	await user.click("buy");

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "bought");
});

test("handler wins over reply when both are set", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(
		composer,
		{ commands: [{ name: "start", reply: "from toml", handler: "start" }] },
		{
			handlers: {
				start: async (ctx) => {
					await ctx.reply("from handler");
				},
			},
		},
	);

	await user.sendCommand("start");

	assert.equal(env.callsTo("sendMessage").length, 1);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "from handler");
});

test("createTomlPlugin installs routes through bot.install", async () => {
	const composer = new Composer().install(
		createTomlPlugin({ commands: [{ name: "start", reply: "hi" }] }),
	);
	const env = createTestEnv(composer);
	const user = env.createUser();

	await user.sendCommand("start");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "hi");
});

class FakeBot extends Composer {
	startHandlers: Array<() => unknown> = [];
	apiCalls: Array<{ method: string; params?: Record<string, unknown> }> = [];
	api = {
		call: async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
			this.apiCalls.push({ method, params });
			return true;
		},
	};

	onStart(handler: () => unknown): this {
		this.startHandlers.push(handler);
		return this;
	}
}

test("syncCommands registers an onStart hook that syncs described commands", async () => {
	const bot = new FakeBot();

	installToml(
		bot,
		{
			commands: [
				{ name: "start", description: "start the bot", reply: "hi" },
				{ name: "ping", reply: "pong" },
			],
		},
		{ syncCommands: true },
	);

	assert.equal(bot.startHandlers.length, 1);
	await bot.startHandlers[0]?.();

	assert.deepEqual(bot.apiCalls, [
		{
			method: "setMyCommands",
			params: { commands: [{ command: "start", description: "start the bot" }] },
		},
	]);
});

test("syncCommands accepts a real Bot target", () => {
	const bot = new Bot("42:TEST");

	installToml(
		bot,
		{ commands: [{ name: "start", description: "start the bot", reply: "hi" }] },
		{ syncCommands: true },
	);
});

test("syncCommands on a plain composer throws", () => {
	assert.throws(
		() =>
			installToml(
				new Composer(),
				{ commands: [{ name: "start", description: "d", reply: "hi" }] },
				{ syncCommands: true },
			),
		/syncCommands requires a Bot target/,
	);
});

test("callbacks with handler works", async () => {
	const composer = new Composer();
	const env = createTestEnv(composer);
	const user = env.createUser();

	installToml(
		composer,
		{
			callbacks: [{ data: "profile", handler: "profileCallback" }],
		},
		{
			handlers: {
				profileCallback: async (ctx) => {
					await ctx.reply("profile");
				},
			},
		},
	);

	await user.click("profile");

	assert.equal(env.apiCalls.length, 1);
	assert.equal(env.lastApiCall()?.method, "sendMessage");
	assert.deepEqual(env.lastApiCall()?.params, { chat_id: user.pmChat.id, text: "profile" });
});
