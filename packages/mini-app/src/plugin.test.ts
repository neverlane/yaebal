import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import type { InlineQueryResult } from "@yaebal/types";
import { miniApp } from "./plugin.js";

const BOT_TOKEN = "123456:AAFake-token-for-tests";

function signHmac(fields: Record<string, string>, botToken = BOT_TOKEN): string {
	const dataCheckString = Object.entries(fields)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
	const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
	const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
	return new URLSearchParams({ ...fields, hash }).toString();
}

test("ctx.miniApp.validate/parse work end to end through a command handler", async () => {
	const bot = new Composer<Context>()
		.install(miniApp({ botToken: BOT_TOKEN }))
		.command("check", async (ctx) => {
			const payload = ctx.message?.text?.split(" ").slice(1).join(" ") ?? "";
			const result = await ctx.miniApp.validate(payload, { maxAge: false });
			await ctx.reply(
				result.ok ? `hi ${result.data.user?.first_name}` : `rejected: ${result.reason}`,
			);
		});

	const env = createTestEnv(bot);
	const initData = signHmac({
		user: JSON.stringify({ id: 1, first_name: "Linia" }),
		auth_date: "1700000000",
	});

	await env.createUser().sendCommand("check", initData);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "hi Linia");

	await env.createUser().sendCommand("check", "hash=deadbeef&auth_date=1700000000");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "rejected: bad_hash");
});

test("ctx.miniApp.isValid mirrors ctx.miniApp.validate's ok flag", async () => {
	const bot = new Composer<Context>()
		.install(miniApp({ botToken: BOT_TOKEN }))
		.command("check", async (ctx) => {
			const payload = ctx.message?.text?.split(" ").slice(1).join(" ") ?? "";
			await ctx.reply(String(await ctx.miniApp.isValid(payload, { maxAge: false })));
		});

	const env = createTestEnv(bot);
	const initData = signHmac({ auth_date: "1700000000" });
	await env.createUser().sendCommand("check", initData);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "true");
});

test("ctx.miniApp.sign builds initData ctx.miniApp.validate accepts, using the same bot token", async () => {
	const bot = new Composer<Context>()
		.install(miniApp({ botToken: BOT_TOKEN }))
		.command("roundtrip", async (ctx) => {
			const initData = await ctx.miniApp.sign({ user: { id: 7, first_name: "Sign" } });
			const result = await ctx.miniApp.validate(initData);
			await ctx.reply(result.ok ? `hi ${result.data.user?.first_name}` : "rejected");
		});

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("roundtrip");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "hi Sign");
});

test("ctx.miniApp.answerQuery wraps answerWebAppQuery with { web_app_query_id, result }", async () => {
	const inlineResult: InlineQueryResult = {
		type: "article",
		id: "1",
		title: "hi",
		input_message_content: { message_text: "hello from the mini app" },
	};

	const bot = new Composer<Context>()
		.install(miniApp({ botToken: BOT_TOKEN }))
		.command("answer", async (ctx) => {
			await ctx.miniApp.answerQuery("AAH_query_id", inlineResult);
		});

	const env = createTestEnv(bot);
	await env.createUser().sendCommand("answer");

	const call = env.lastApiCall("answerWebAppQuery");
	assert.deepEqual(call?.params, { web_app_query_id: "AAH_query_id", result: inlineResult });
});

test("miniApp(): rejects a botToken with no numeric id prefix", () => {
	assert.throws(() => miniApp({ botToken: "not-a-valid-token" }), /botToken/);
});
