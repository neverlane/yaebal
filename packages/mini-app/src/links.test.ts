import assert from "node:assert/strict";
import test from "node:test";
import { attachMenuLink, miniAppLink, webAppInfo, webAppUrl } from "./links.js";

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

test("miniAppLink: rejects a malformed botUsername", () => {
	assert.throws(() => miniAppLink({ botUsername: "@yaebal_bot" }), /botUsername/); // leading "@"
	assert.throws(() => miniAppLink({ botUsername: "abc" }), /botUsername/); // too short (<5)
	assert.throws(() => miniAppLink({ botUsername: "1bot" }), /botUsername/); // starts with a digit
	assert.throws(() => miniAppLink({ botUsername: "has spaces" }), /botUsername/);
});

test("miniAppLink: rejects a malformed appName", () => {
	assert.throws(() => miniAppLink({ botUsername: "yaebal_bot", appName: "has spaces" }), /appName/);
});

test("attachMenuLink: builds a bare startattach flag, and one with a payload", () => {
	assert.equal(
		attachMenuLink({ botUsername: "yaebal_bot" }),
		"https://t.me/yaebal_bot?startattach",
	);
	assert.equal(
		attachMenuLink({ botUsername: "yaebal_bot", startParam: "ref_42" }),
		"https://t.me/yaebal_bot?startattach=ref_42",
	);
});

test("attachMenuLink: validates botUsername and startParam the same way miniAppLink does", () => {
	assert.throws(() => attachMenuLink({ botUsername: "abc" }), /botUsername/);
	assert.throws(
		() => attachMenuLink({ botUsername: "yaebal_bot", startParam: "has spaces" }),
		/startParam/,
	);
});
