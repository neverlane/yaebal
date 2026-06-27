import assert from "node:assert/strict";
import test from "node:test";
import { InlineKeyboard, Keyboard } from "./index.js";

test("inline keyboard builds rows", () => {
	const kb = new InlineKeyboard()
		.text("A", "a")
		.text("B", "b")
		.row()
		.url("site", "https://x.com")
		.build();
	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "A", callback_data: "a" },
				{ text: "B", callback_data: "b" },
			],
			[{ text: "site", url: "https://x.com" }],
		],
	});
});

test("trailing row() does not emit an empty row", () => {
	const kb = new InlineKeyboard().text("A", "a").row().build();
	assert.deepEqual(kb, { inline_keyboard: [[{ text: "A", callback_data: "a" }]] });
});

test("webApp and switchInline buttons", () => {
	const kb = new InlineKeyboard()
		.webApp("open", "https://app.example")
		.switchInline("share", "q")
		.build();
	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "open", web_app: { url: "https://app.example" } },
				{ text: "share", switch_inline_query: "q" },
			],
		],
	});
});

test("reply keyboard with flags", () => {
	const kb = new Keyboard().text("yes").text("no").resized().oneTime().build();
	assert.deepEqual(kb, {
		keyboard: [[{ text: "yes" }, { text: "no" }]],
		resize_keyboard: true,
		one_time_keyboard: true,
	});
});

test("reply keyboard omits flags when unset", () => {
	const kb = new Keyboard().requestContact("phone").build();
	assert.deepEqual(kb, { keyboard: [[{ text: "phone", request_contact: true }]] });
});

test("built markup does not alias the live builder", () => {
	const b = new InlineKeyboard().text("A", "a");
	const first = b.build();
	b.text("B", "b"); // mutating the builder after build()
	assert.deepEqual(first, { inline_keyboard: [[{ text: "A", callback_data: "a" }]] });
});
