import assert from "node:assert/strict";
import test from "node:test";
import type { Message, SendMessageParams, Update, User } from "./index.js";
import { BOT_API_VERSION } from "./index.js";

test("exposes the generated Bot API version", () => {
	assert.match(BOT_API_VERSION, /^\d+\.\d+$/);
});

test("generated object types have the expected shape", () => {
	// if the generator emitted these wrong, this file wouldn't compile
	const user: User = { id: 42, is_bot: false, first_name: "Sam" };
	assert.equal(user.id, 42);

	const update: Update = { update_id: 1 };
	assert.equal(update.update_id, 1);
});

test("generated method params accept a real call", () => {
	const params: SendMessageParams = { chat_id: 1, text: "hi" };
	assert.equal(params.text, "hi");

	// chat_id is a union of number | string per the schema
	const byUsername: SendMessageParams = { chat_id: "@channel", text: "yo" };
	assert.equal(byUsername.chat_id, "@channel");
});

test("Message is a usable type reference", () => {
	const msg: Pick<Message, "message_id" | "date"> = { message_id: 10, date: 0 };

	assert.equal(msg.message_id, 10);
});
