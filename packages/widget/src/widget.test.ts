import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { html } from "./html.js";
import { WidgetError } from "./limits.js";
import { widgetState } from "./state.js";
import { defineWidget, sharedWidgetId } from "./widget.js";

interface Votes {
	yes: number;
	no: number;
}

const MARKUP = `
	<!-- poll -->
	<div id="app">
		<button>yes</button>
	</div>
`;

test("message() builds sendWidget params: minified html, encoded state, query + shared flags", async () => {
	const poll = defineWidget({
		html: MARKUP,
		publicData: widgetState<Votes>(),
		chatData: widgetState<{ mine?: "yes" | "no" }>({ field: "chat_data" }),
		width: 320,
		height: 200,
		shared: true,
	});
	assert.equal(poll.html, '<div id="app">\n<button>yes</button>\n</div>');
	const params = await poll.message(
		{ publicData: { yes: 1, no: 0 }, chatData: {} },
		{ caption: "vote!", protect_content: true },
	);
	assert.deepEqual(params, {
		caption: "vote!",
		protect_content: true,
		html: poll.html,
		width: 320,
		height: 200,
		public_data: '{"yes":1,"no":0}',
		chat_data: "{}",
		allow_queries: true,
		is_shared: true,
	});
	assert.deepEqual(await poll.to(42), {
		chat_id: 42,
		html: poll.html,
		width: 320,
		height: 200,
		allow_queries: true,
		is_shared: true,
	});
});

test("a static widget without codecs sends strings verbatim and can opt out of queries and minify", async () => {
	const card = defineWidget({ html: html`<b>${"<card>"}</b>`, allowQueries: false, minify: false });
	assert.equal(card.html, "<b>&lt;card&gt;</b>");
	assert.deepEqual(await card.message({ publicData: "raw", chatData: "c" }), {
		html: "<b>&lt;card&gt;</b>",
		public_data: "raw",
		chat_data: "c",
	});
	assert.throws(
		() => card.encodePublic({ not: "a string" } as unknown as string),
		(e: unknown) => e instanceof WidgetError && e.code === "INPUT_MEDIA_WIDGET_DATA_INVALID",
	);
	assert.equal(card.decodePublic("raw"), "raw");
	assert.equal(card.decodePublic(""), undefined);
	assert.equal(card.decodeChat(null), undefined);
	assert.equal(card.decodeChat(undefined), undefined);
});

test("inline() / resend() / resendInline() cover inline results and shared resends", async () => {
	const poll = defineWidget({
		html: "<p>p</p>",
		publicData: widgetState<Votes>(),
		chatData: widgetState<number>(),
	});
	assert.deepEqual(await poll.inline({ publicData: { yes: 0, no: 0 } }, { caption: "c" }), {
		caption: "c",
		html: "<p>p</p>",
		public_data: '{"yes":0,"no":0}',
		allow_queries: true,
	});
	assert.deepEqual(poll.resend("w1", { chatData: 3 }, { disable_notification: true }), {
		disable_notification: true,
		widget_id: "w1",
		chat_data: "3",
	});
	assert.deepEqual(poll.resend("w1"), { widget_id: "w1" });
	assert.deepEqual(poll.resendInline("w2", { chatData: 1 }, { caption: "x" }), {
		caption: "x",
		widget_id: "w2",
		chat_data: "1",
	});
	assert.deepEqual(poll.resendInline("w2"), { widget_id: "w2" });
});

test("edit() addresses a chat message or an inline message, null clears a slot", () => {
	const poll = defineWidget({
		html: "<p>p</p>",
		publicData: widgetState<Votes>(),
		chatData: widgetState<number>(),
	});
	assert.deepEqual(
		poll.edit({ chatId: 1, messageId: 2 }, { publicData: { yes: 2, no: 1 }, chatData: null }),
		{
			chat_id: 1,
			message_id: 2,
			public_data: '{"yes":2,"no":1}',
			chat_data: "",
		},
	);
	assert.deepEqual(poll.edit({ inlineMessageId: "im" }, { publicData: null, chatData: 5 }), {
		inline_message_id: "im",
		public_data: "",
		chat_data: "5",
	});
	assert.deepEqual(poll.edit({ inlineMessageId: "im" }, {}), { inline_message_id: "im" });
	assert.deepEqual(poll.decodePublic('{"yes":1,"no":1}'), { yes: 1, no: 1 });
	assert.equal(poll.decodeChat("7"), 7);
	assert.equal(poll.encodeChat(9), "9");
});

test("check() measures and lints without throwing; assert() throws and retries after a fix", async () => {
	const ok = defineWidget({ html: "<button>ok</button>" });
	const report = await ok.check();
	assert.equal(report.ok, true);
	assert.deepEqual(report.issues, []);
	assert.equal((await ok.assert()).fits, true);
	assert.equal(await ok.assert(), await ok.assert()); // cached

	const linted = await defineWidget({ html: "<input>" }).check();
	assert.equal(linted.ok, false);
	assert.equal(linted.issues[0]?.rule, "no-unsupported-element");

	const huge = defineWidget({ html: `<p>${randomBytes(6000).toString("base64")}</p>` });
	assert.equal((await huge.check()).ok, false);
	await assert.rejects(
		huge.message(),
		(e: unknown) => e instanceof WidgetError && e.code === "INPUT_MEDIA_WIDGET_TOO_LARGE",
	);
	await assert.rejects(huge.inline(), /zlib-compressed/);
	// a failure isn't cached as a stale rejection — it's re-checked (and fails again)
	await assert.rejects(huge.assert(), /zlib-compressed/);
});

test("bad dimensions fail at definition time", () => {
	assert.throws(
		() => defineWidget({ html: "<p></p>", width: 0 }),
		/width must be a positive integer/,
	);
	assert.throws(() => defineWidget({ html: "<p></p>", height: -5 }), /height/);
});

test("preview() embeds encoded state into a browser page", () => {
	const poll = defineWidget({ html: "<p id=x></p>", publicData: widgetState<Votes>() });
	const page = poll.preview(
		{ publicData: { yes: 3, no: 4 }, chatData: "c" as never },
		{ colorScheme: "dark" },
	);
	assert.match(page, /<p id=x><\/p>/);
	assert.match(page, /"publicData":"\{\\"yes\\":3,\\"no\\":4\}"/);
	assert.match(page, /--tg-color-scheme:dark/);
	assert.match(poll.preview(), /"publicData":null/);
});

test("sharedWidgetId reads the id of a sent shared widget", () => {
	assert.equal(sharedWidgetId({ widget: { id: "sw", html: "<p></p>" } }), "sw");
	assert.equal(sharedWidgetId({}), undefined);
});
