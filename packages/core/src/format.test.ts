import assert from "node:assert/strict";
import test from "node:test";
import { createApi } from "./api.js";
import {
	blockquote,
	bold,
	code,
	customEmoji,
	dateTime,
	expandableBlockquote,
	format,
	italic,
	join,
	link,
	mention,
	pre,
	spoiler,
	strikethrough,
	underline,
} from "./format.js";
import { applyFormatFields } from "./format-hook.js";

test("format stitches text and shifts entity offsets", () => {
	const r = format`hi ${bold("there")}!`;

	assert.equal(r.text, "hi there!");
	assert.deepEqual(r.entities, [{ type: "bold", offset: 3, length: 5 }]);
});

test("format renders null/undefined/booleans as empty text", () => {
	const r = format`a${null}b${undefined}c${false}d${true}e${0}f`;

	assert.equal(r.text, "abcd" + "e0f");
	assert.deepEqual(r.entities, []);
});

test("helpers nest: outer entity spans the inner one", () => {
	const r = bold(italic("x"));

	assert.equal(r.text, "x");
	assert.deepEqual(r.entities, [
		{ type: "bold", offset: 0, length: 1 },
		{ type: "italic", offset: 0, length: 1 },
	]);
});

test("helpers work as tagged templates with interpolation", () => {
	const r = bold`hi ${italic("there")}`;

	assert.equal(r.text, "hi there");
	assert.deepEqual(r.entities, [
		{ type: "bold", offset: 0, length: 8 },
		{ type: "italic", offset: 3, length: 5 },
	]);
});

test("every simple helper emits its entity type", () => {
	const cases: [{ text: string; entities: { type: string }[] }, string][] = [
		[bold("x"), "bold"],
		[italic("x"), "italic"],
		[underline("x"), "underline"],
		[strikethrough("x"), "strikethrough"],
		[spoiler("x"), "spoiler"],
		[code("x"), "code"],
		[blockquote("x"), "blockquote"],
		[expandableBlockquote("x"), "expandable_blockquote"],
	];

	for (const [r, type] of cases) {
		assert.equal(r.text, "x");
		assert.deepEqual(r.entities, [{ type, offset: 0, length: 1 }]);
	}
});

test("pre carries the language, link the url, mention the user", () => {
	assert.deepEqual(pre("const x = 1", "ts").entities, [
		{ type: "pre", offset: 0, length: 11, language: "ts" },
	]);
	assert.deepEqual(pre("plain").entities, [{ type: "pre", offset: 0, length: 5 }]);
	assert.deepEqual(link("docs", "https://yaebal.mom").entities, [
		{ type: "text_link", offset: 0, length: 4, url: "https://yaebal.mom" },
	]);
	assert.deepEqual(mention("me", { id: 1 }).entities, [
		{ type: "text_mention", offset: 0, length: 2, user: { id: 1 } },
	]);
});

test("customEmoji and dateTime carry their extra fields", () => {
	assert.deepEqual(customEmoji("⚔️", "5222106016283378623").entities, [
		{ type: "custom_emoji", offset: 0, length: "⚔️".length, custom_emoji_id: "5222106016283378623" },
	]);
	assert.deepEqual(dateTime("soon", 1740787200, "r").entities, [
		{ type: "date_time", offset: 0, length: 4, unix_time: 1740787200, date_time_format: "r" },
	]);
	assert.deepEqual(dateTime("soon", 1740787200).entities, [
		{ type: "date_time", offset: 0, length: 4, unix_time: 1740787200 },
	]);
});

test("join keeps entities and defaults to ', '", () => {
	const r = join([bold("a"), "b"]);

	assert.equal(r.text, "a, b");
	assert.deepEqual(r.entities, [{ type: "bold", offset: 0, length: 1 }]);
});

test("join with iterator and formatted separator", () => {
	const r = join(["a", "b"], (x, i) => bold(`${x}${i}`), italic(" | "));

	assert.equal(r.text, "a0 | b1");
	assert.deepEqual(r.entities, [
		{ type: "bold", offset: 0, length: 2 },
		{ type: "italic", offset: 2, length: 3 },
		{ type: "bold", offset: 5, length: 2 },
	]);
});

test("join skips empty pieces — no dangling separators", () => {
	assert.equal(join(["a", null, "b", false, ""], "-").text, "a-b");
	assert.equal(join([false, "a", undefined], "-").text, "a");
	assert.equal(join([], "-").text, "");
});

test("applyFormatFields splits text and nested quote on sendMessage", () => {
	const params = {
		chat_id: 1,
		text: format`hi ${bold("you")}`,
		reply_parameters: { message_id: 5, quote: bold("q") },
	};

	const out = applyFormatFields("sendMessage", params);

	assert.deepEqual(out, {
		chat_id: 1,
		text: "hi you",
		entities: [{ type: "bold", offset: 3, length: 3 }],
		reply_parameters: {
			message_id: 5,
			quote: "q",
			quote_entities: [{ type: "bold", offset: 0, length: 1 }],
		},
	});

	// copy-on-write: the caller's params are untouched
	assert.equal(typeof params.text, "object");
	assert.equal(typeof params.reply_parameters.quote, "object");
});

test("applyFormatFields covers arrays: poll options and media groups", () => {
	const poll = applyFormatFields("sendPoll", {
		chat_id: 1,
		question: bold("q?"),
		options: [{ text: italic("yes") }, { text: "no" }],
	});

	assert.deepEqual(poll, {
		chat_id: 1,
		question: "q?",
		question_entities: [{ type: "bold", offset: 0, length: 2 }],
		options: [
			{ text: "yes", text_entities: [{ type: "italic", offset: 0, length: 3 }] },
			{ text: "no" },
		],
	});

	const group = applyFormatFields("sendMediaGroup", {
		chat_id: 1,
		media: [
			{ type: "photo", media: "id1", caption: bold("one") },
			{ type: "photo", media: "id2" },
		],
	});

	assert.deepEqual((group?.media as Record<string, unknown>[])[0], {
		type: "photo",
		media: "id1",
		caption: "one",
		caption_entities: [{ type: "bold", offset: 0, length: 3 }],
	});
});

test("applyFormatFields never overwrites explicitly passed entities", () => {
	const explicit = [{ type: "italic" as const, offset: 0, length: 2 }];
	const out = applyFormatFields("sendMessage", {
		chat_id: 1,
		text: bold("hi"),
		entities: explicit,
	});

	assert.equal(out?.text, "hi");
	assert.equal(out?.entities, explicit);
});

test("applyFormatFields passes through plain params and unknown methods", () => {
	const plain = { chat_id: 1, text: "hi" };
	assert.equal(applyFormatFields("sendMessage", plain), plain);
	const other = { user_id: 2 };
	assert.equal(applyFormatFields("getChatMember", other), other);
	assert.equal(applyFormatFields("sendMessage", undefined), undefined);
});

test("api.call decomposes format results for any method", async () => {
	const previousFetch = globalThis.fetch;
	let sent: Record<string, unknown> | undefined;

	globalThis.fetch = async (_url, init) => {
		sent = JSON.parse((init as RequestInit).body as string);
		return new Response(JSON.stringify({ ok: true, result: true }), {
			headers: { "content-type": "application/json" },
		});
	};

	try {
		const api = createApi("123:abc", { apiRoot: "https://example.invalid" });
		await api.call("sendMessage", { chat_id: 1, text: format`a ${bold("b")}` });

		assert.deepEqual(sent, {
			chat_id: 1,
			text: "a b",
			entities: [{ type: "bold", offset: 2, length: 1 }],
		});
	} finally {
		globalThis.fetch = previousFetch;
	}
});
