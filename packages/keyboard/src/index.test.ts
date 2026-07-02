import assert from "node:assert/strict";
import test from "node:test";
import { InlineKeyboard, Keyboard } from "./index.js";

test("inline keyboard builds rows", () => {
	const kb = new InlineKeyboard()
		.text("A", "a")
		.text("B", "b")
		.row()
		.url("site", "https://yaeb.al")
		.build();

	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "A", callback_data: "a" },
				{ text: "B", callback_data: "b" },
			],
			[{ text: "site", url: "https://yaeb.al" }],
		],
	});
});

test("trailing row() does not emit an empty row", () => {
	const kb = new InlineKeyboard().text("A", "a").row().build();

	assert.deepEqual(kb, { inline_keyboard: [[{ text: "A", callback_data: "a" }]] });
});

test("webApp and switchInline buttons", () => {
	const kb = new InlineKeyboard()
		.webApp("open", "https://yaeb.al")
		.switchInline("share", "q")
		.build();

	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "open", web_app: { url: "https://yaeb.al" } },
				{ text: "share", switch_inline_query: "q" },
			],
		],
	});
});

test("switchInlineCurrentChat and switchInlineChosenChat", () => {
	const kb = new InlineKeyboard()
		.switchInlineCurrentChat("here", "q")
		.switchInlineChosenChat("pick", { allow_user_chats: true })
		.build();

	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "here", switch_inline_query_current_chat: "q" },
				{ text: "pick", switch_inline_query_chosen_chat: { allow_user_chats: true } },
			],
		],
	});
});

test("login, copyText, pay and game buttons", () => {
	const kb = new InlineKeyboard()
		.login("log in", "https://example.com/auth", { request_write_access: true })
		.copyText("copy", "hello")
		.pay("pay ⭐")
		.game("play")
		.build();

	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{
					text: "log in",
					login_url: { url: "https://example.com/auth", request_write_access: true },
				},
				{ text: "copy", copy_text: { text: "hello" } },
				{ text: "pay ⭐", pay: true },
				{ text: "play", callback_game: {} },
			],
		],
	});
});

test("style and icon modify the most recently added inline button", () => {
	const kb = new InlineKeyboard().text("A", "a").text("B", "b").style("danger").icon("123").build();

	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "A", callback_data: "a" },
				{ text: "B", callback_data: "b", style: "danger", icon_custom_emoji_id: "123" },
			],
		],
	});
});

test("style() throws when no button was added yet", () => {
	assert.throws(() => new InlineKeyboard().style("primary"));
	assert.throws(() => new Keyboard().icon("123"));
});

test("style() still finds the last button after an auto/manual row flush", () => {
	const kb = new InlineKeyboard().text("A", "a").row().style("danger").build();

	assert.deepEqual(kb, { inline_keyboard: [[{ text: "A", callback_data: "a", style: "danger" }]] });
});

test("add() appends raw button objects, including static-built ones", () => {
	const ids = ["x", "y"];
	const kb = new InlineKeyboard()
		.add({ text: "raw", callback_data: "raw:1" })
		.add(...ids.map((id) => InlineKeyboard.text(id, `pick:${id}`)))
		.build();

	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "raw", callback_data: "raw:1" },
				{ text: "x", callback_data: "pick:x" },
				{ text: "y", callback_data: "pick:y" },
			],
		],
	});
});

test("InlineKeyboard static text/url/webApp build raw buttons", () => {
	assert.deepEqual(InlineKeyboard.text("a", "b"), { text: "a", callback_data: "b" });
	assert.deepEqual(InlineKeyboard.url("a", "https://yaeb.al"), {
		text: "a",
		url: "https://yaeb.al",
	});
	assert.deepEqual(InlineKeyboard.webApp("a", "https://yaeb.al"), {
		text: "a",
		web_app: { url: "https://yaeb.al" },
	});
});

test("columns() auto-wraps buttons without manual row() calls", () => {
	const kb = new InlineKeyboard()
		.columns(2)
		.add(...["a", "b", "c", "d", "e"].map((x) => InlineKeyboard.text(x, x)))
		.build();

	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "a", callback_data: "a" },
				{ text: "b", callback_data: "b" },
			],
			[
				{ text: "c", callback_data: "c" },
				{ text: "d", callback_data: "d" },
			],
			[{ text: "e", callback_data: "e" }],
		],
	});
});

test("columns() disables when called with no argument", () => {
	const kb = new InlineKeyboard().columns(1).columns().text("a", "a").text("b", "b").build();

	assert.deepEqual(kb, {
		inline_keyboard: [
			[
				{ text: "a", callback_data: "a" },
				{ text: "b", callback_data: "b" },
			],
		],
	});
});

test("toJSON() matches build() and is picked up by JSON.stringify", () => {
	const kb = new InlineKeyboard().text("A", "a");

	assert.deepEqual(kb.toJSON(), kb.build());
	assert.equal(JSON.stringify({ reply_markup: kb }), JSON.stringify({ reply_markup: kb.build() }));
});

test("built inline markup does not alias the live builder", () => {
	const b = new InlineKeyboard().text("A", "a");
	const first = b.build();

	b.text("B", "b"); // mutating the builder after build()
	assert.deepEqual(first, { inline_keyboard: [[{ text: "A", callback_data: "a" }]] });
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

test("persistent, placeholder and selective flags", () => {
	const kb = new Keyboard().text("hi").persistent().placeholder("type here").selective().build();

	assert.deepEqual(kb, {
		keyboard: [[{ text: "hi" }]],
		is_persistent: true,
		input_field_placeholder: "type here",
		selective: true,
	});
});

test("requestLocation and requestPoll buttons", () => {
	const kb = new Keyboard().requestLocation("where").requestPoll("poll", "quiz").build();

	assert.deepEqual(kb, {
		keyboard: [
			[
				{ text: "where", request_location: true },
				{ text: "poll", request_poll: { type: "quiz" } },
			],
		],
	});
});

test("requestUsers button carries request_id and options", () => {
	const kb = new Keyboard()
		.requestUsers("pick users", 1, { max_quantity: 3, user_is_bot: false })
		.build();

	assert.deepEqual(kb, {
		keyboard: [
			[
				{
					text: "pick users",
					request_users: { request_id: 1, max_quantity: 3, user_is_bot: false },
				},
			],
		],
	});
});

test("requestChat button carries request_id, chat_is_channel and options", () => {
	const kb = new Keyboard()
		.requestChat("pick channel", 2, true, { request_title: true })
		.requestChat("pick group", 3, false)
		.build();

	assert.deepEqual(kb, {
		keyboard: [
			[
				{
					text: "pick channel",
					request_chat: { request_id: 2, chat_is_channel: true, request_title: true },
				},
				{ text: "pick group", request_chat: { request_id: 3, chat_is_channel: false } },
			],
		],
	});
});

test("requestManagedBot button carries request_id and options", () => {
	const kb = new Keyboard()
		.requestManagedBot("create bot", 4, { suggested_name: "My Shop Bot" })
		.build();

	assert.deepEqual(kb, {
		keyboard: [
			[
				{
					text: "create bot",
					request_managed_bot: { request_id: 4, suggested_name: "My Shop Bot" },
				},
			],
		],
	});
});

test("style and icon modify the most recently added reply button", () => {
	const kb = new Keyboard().text("A").style("success").icon("42").build();

	assert.deepEqual(kb, {
		keyboard: [[{ text: "A", style: "success", icon_custom_emoji_id: "42" }]],
	});
});

test("built reply markup does not alias the live builder", () => {
	const b = new Keyboard().text("A");
	const first = b.build();

	b.text("B"); // mutating the builder after build()
	assert.deepEqual(first, { keyboard: [[{ text: "A" }]] });
});

test("Keyboard add() and static text() build buttons from dynamic data", () => {
	const labels = ["yes", "no"];
	const kb = new Keyboard().add(...labels.map((label) => Keyboard.text(label))).build();

	assert.deepEqual(kb, { keyboard: [[{ text: "yes" }, { text: "no" }]] });
});

test("Keyboard static requestUsers/requestChat/requestManagedBot match their instance methods", () => {
	assert.deepEqual(Keyboard.requestUsers("u", 1, { max_quantity: 2 }), {
		text: "u",
		request_users: { request_id: 1, max_quantity: 2 },
	});
	assert.deepEqual(Keyboard.requestChat("c", 2, true), {
		text: "c",
		request_chat: { request_id: 2, chat_is_channel: true },
	});
	assert.deepEqual(Keyboard.requestManagedBot("m", 3), {
		text: "m",
		request_managed_bot: { request_id: 3 },
	});
});

test("Keyboard columns() auto-wraps buttons", () => {
	const kb = new Keyboard()
		.columns(3)
		.add(...["a", "b", "c", "d"].map((x) => Keyboard.text(x)))
		.build();

	assert.deepEqual(kb, {
		keyboard: [[{ text: "a" }, { text: "b" }, { text: "c" }], [{ text: "d" }]],
	});
});

test("Keyboard toJSON() matches build()", () => {
	const kb = new Keyboard().text("A");

	assert.deepEqual(kb.toJSON(), kb.build());
});

test("Keyboard.remove()", () => {
	assert.deepEqual(Keyboard.remove(), { remove_keyboard: true });
	assert.deepEqual(Keyboard.remove(true), { remove_keyboard: true, selective: true });
});

test("Keyboard.forceReply()", () => {
	assert.deepEqual(Keyboard.forceReply(), { force_reply: true });
	assert.deepEqual(Keyboard.forceReply({ input_field_placeholder: "reply here" }), {
		force_reply: true,
		input_field_placeholder: "reply here",
	});
});
