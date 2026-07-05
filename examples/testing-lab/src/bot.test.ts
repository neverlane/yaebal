import assert from "node:assert/strict";
import test from "node:test";
import { createTestEnv, findButton } from "@yaebal/test";
import { createTestingLabBot, voteData } from "./bot.js";

test("start sends a typed vote keyboard", async () => {
	const env = createTestEnv(createTestingLabBot());
	const user = env.createUser({ firstName: "casey" });

	await user.sendCommand("start");

	const message = env.lastBotMessage({ withReplyMarkup: true });
	assert.equal(message?.text, "testing lab ready. press a button or send /stats.");
	assert.equal(findButton(message?.reply_markup, "ship it")?.callback_data, voteData.pack({ choice: "ship" }));
});

test("button click updates session and records answerCallbackQuery", async () => {
	const env = createTestEnv(createTestingLabBot());
	const user = env.createUser();

	await user.click(voteData.pack({ choice: "ship" }));
	await user.click(voteData.pack({ choice: "ship" }));
	await user.sendCommand("stats");

	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "ship: 2");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "votes\nship: 2");
});

test("plain text path is still covered", async () => {
	const env = createTestEnv(createTestingLabBot());
	const user = env.createUser();

	await user.sendMessage("hello tests");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "echo: hello tests");
});
