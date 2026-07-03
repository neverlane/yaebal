import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Composer } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { installToml, parseTomlConfig, validateTomlConfig } from "./index.js";

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
