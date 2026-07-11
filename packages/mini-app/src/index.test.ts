import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import {
	type InitDataChat,
	type InitDataUser,
	miniApp,
	miniAppLink,
	parseInitData,
	parseWebAppData,
	validateInitData,
	webAppInfo,
	webAppUrl,
} from "./index.js";

const BOT_TOKEN = "123456:AAFake-token-for-tests";

/** independently signs `fields` the way telegram does — proves the implementation matches the spec, not just itself. */
function signInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
	const pairs = Object.entries(fields)
		.map(([key, value]) => `${key}=${value}`)
		.sort();
	const dataCheckString = pairs.join("\n");
	const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
	const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
	return new URLSearchParams({ ...fields, hash }).toString();
}

const sampleUser: InitDataUser = { id: 1, first_name: "Linia", username: "linia" };

test("validateInitData: accepts a correctly signed payload", async () => {
	const initData = signInitData({
		query_id: "AAH_query",
		user: JSON.stringify(sampleUser),
		auth_date: "1700000000",
	});

	const result = await validateInitData(initData, BOT_TOKEN);
	assert.equal(result.ok, true);
	assert.ok(result.ok && result.data.user?.id === 1);
	assert.ok(result.ok && result.data.auth_date.getTime() === 1_700_000_000_000);
});

test("validateInitData: rejects a tampered field (hash no longer matches)", async () => {
	const initData = signInitData({ user: JSON.stringify(sampleUser), auth_date: "1700000000" });
	const tampered = new URLSearchParams(initData);
	tampered.set("user", JSON.stringify({ id: 999, first_name: "Eve" }));

	const result = await validateInitData(tampered.toString(), BOT_TOKEN);
	assert.deepEqual(result, { ok: false, reason: "bad_hash" });
});

test("validateInitData: rejects when signed with a different bot token", async () => {
	const initData = signInitData({ auth_date: "1700000000" }, "999999:other-token");
	const result = await validateInitData(initData, BOT_TOKEN);
	assert.deepEqual(result, { ok: false, reason: "bad_hash" });
});

test("validateInitData: missing hash is rejected without touching the token", async () => {
	const result = await validateInitData("auth_date=1700000000", BOT_TOKEN);
	assert.deepEqual(result, { ok: false, reason: "missing_hash" });
});

test("validateInitData: maxAge rejects stale auth_date, accepts fresh", async () => {
	const initData = signInitData({ auth_date: "1700000000" });
	const now = new Date(1_700_000_000_000 + 3600_000); // one hour later

	const stale = await validateInitData(initData, BOT_TOKEN, { maxAge: 1800, now });
	assert.deepEqual(stale, { ok: false, reason: "expired" });

	const fresh = await validateInitData(initData, BOT_TOKEN, { maxAge: 7200, now });
	assert.equal(fresh.ok, true);
});

test("parseInitData: parses user, receiver, chat and scalar fields", () => {
	const receiver: InitDataUser = { id: 2, first_name: "Bot" };
	const chat: InitDataChat = { id: 3, type: "supergroup", title: "yaebal" };

	const initData = signInitData({
		user: JSON.stringify(sampleUser),
		receiver: JSON.stringify(receiver),
		chat: JSON.stringify(chat),
		chat_type: "supergroup",
		chat_instance: "abc",
		start_param: "ref_42",
		auth_date: "1700000000",
	});

	const data = parseInitData(initData);
	assert.deepEqual(data.user, sampleUser);
	assert.deepEqual(data.receiver, receiver);
	assert.deepEqual(data.chat, chat);
	assert.equal(data.chat_type, "supergroup");
	assert.equal(data.start_param, "ref_42");
	assert.equal(data.auth_date.getTime(), 1_700_000_000_000);
});

test("parseInitData: throws on missing hash or auth_date", () => {
	assert.throws(() => parseInitData("auth_date=1700000000"), /hash/);
	assert.throws(() => parseInitData("hash=deadbeef"), /auth_date/);
});

test("parseInitData: throws when user is not valid JSON", () => {
	const bad = new URLSearchParams({ user: "not-json", auth_date: "1700000000", hash: "x" });
	assert.throws(() => parseInitData(bad.toString()), /not valid JSON/);
});

test("parseWebAppData: parses the JSON payload, throws on malformed data", () => {
	assert.deepEqual(parseWebAppData<{ action: string }>(JSON.stringify({ action: "buy" })), {
		action: "buy",
	});
	assert.throws(() => parseWebAppData("{not json"), /not valid JSON/);
});

test("webAppUrl / webAppInfo: builds an https url with merged params, rejects non-https", () => {
	assert.equal(
		webAppUrl("https://example.com/app", { params: { ref: "42" } }),
		"https://example.com/app?ref=42",
	);
	assert.deepEqual(webAppInfo("https://example.com/app"), { url: "https://example.com/app" });
	assert.throws(() => webAppUrl("http://example.com/app"), /https/);
});

test("miniAppLink: builds direct links for a named app and the bot's main app", () => {
	assert.equal(
		miniAppLink({ botUsername: "yaebal_bot", appName: "shop", startParam: "ref_42" }),
		"https://t.me/yaebal_bot/shop?startapp=ref_42",
	);
	assert.equal(
		miniAppLink({ botUsername: "yaebal_bot", startParam: "ref_42", mode: "compact" }),
		"https://t.me/yaebal_bot?startapp=ref_42&mode=compact",
	);
	assert.equal(miniAppLink({ botUsername: "yaebal_bot" }), "https://t.me/yaebal_bot");
});

test("miniAppLink: rejects a startParam outside telegram's allowed charset/length", () => {
	assert.throws(
		() => miniAppLink({ botUsername: "yaebal_bot", startParam: "has spaces" }),
		/startParam/,
	);
	assert.throws(
		() => miniAppLink({ botUsername: "yaebal_bot", startParam: "a".repeat(65) }),
		/startParam/,
	);
});

test("ctx.miniApp.validate/parse work end to end through a command handler", async () => {
	const bot = new Composer<Context>()
		.install(miniApp({ botToken: BOT_TOKEN }))
		.command("check", async (ctx) => {
			const payload = ctx.message?.text?.split(" ").slice(1).join(" ") ?? "";
			const result = await ctx.miniApp.validate(payload);
			await ctx.reply(
				result.ok ? `hi ${result.data.user?.first_name}` : `rejected: ${result.reason}`,
			);
		});

	const env = createTestEnv(bot);
	const initData = signInitData({ user: JSON.stringify(sampleUser), auth_date: "1700000000" });

	await env.createUser().sendCommand("check", initData);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "hi Linia");

	await env.createUser().sendCommand("check", "hash=deadbeef&auth_date=1700000000");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "rejected: bad_hash");
});
