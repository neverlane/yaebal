import assert from "node:assert/strict";
import test from "node:test";
import { findButton } from "./keyboard.js";

test("findButton locates a button by text and reports its position", () => {
	const markup = {
		inline_keyboard: [
			[{ text: "a", callback_data: "a" }],
			[
				{ text: "b", callback_data: "b" },
				{ text: "Next", callback_data: "page:2" },
			],
		],
	};

	const found = findButton(markup, "Next");
	assert.equal(found?.callback_data, "page:2");
	assert.equal(found?.row, 1);
	assert.equal(found?.col, 1);

	assert.equal(findButton(markup, /^n/i)?.text, "Next");
	assert.equal(findButton(markup, "missing"), undefined);
	assert.equal(findButton(undefined, "missing"), undefined);
});

test("findButton unwraps a builder instance via toJSON()", () => {
	class FakeInlineKeyboard {
		toJSON() {
			return { inline_keyboard: [[{ text: "Restart", callback_data: "restart" }]] };
		}
	}

	const found = findButton(new FakeInlineKeyboard(), "Restart");
	assert.equal(found?.callback_data, "restart");
});
