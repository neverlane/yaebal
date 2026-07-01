import assert from "node:assert/strict";
import test from "node:test";
import { type ChatMessage, renderChat } from "./index.js";

const sample: ChatMessage[] = [
	{ from: "user", text: "/start", time: "23:33", status: "read" },
	{ from: "bot", text: "hello, unknown person", time: "23:33" },
	{ from: "bot", buttons: [["Useless button"]] },
];

test("renders a well-formed svg with the message text", () => {
	const svg = renderChat(sample);

	assert.ok(svg.startsWith("<svg"));
	assert.ok(svg.trimEnd().endsWith("</svg>"));

	assert.match(svg, /width="380"/); // default width

	assert.ok(svg.includes("hello, unknown person"));
	assert.ok(svg.includes("Useless button"));
});

test("escapes xml-significant characters in text", () => {
	const svg = renderChat([{ from: "bot", text: '<b> & "q"' }]);

	assert.ok(svg.includes("&lt;b&gt; &amp; &quot;q&quot;"));
	assert.ok(!svg.includes("<b>")); // raw angle bracket must not leak
});

test("wraps long text into multiple lines (svg has no auto-wrap)", () => {
	const long = "word ".repeat(60).trim();
	const svg = renderChat([{ from: "bot", text: long }], { width: 320 });
	const lines = (svg.match(/<tspan/g) ?? []).length;

	assert.ok(lines >= 3, `expected several wrapped lines, got ${lines}`);
});

test("draws read ticks only for outgoing messages", () => {
	const withTicks = renderChat([{ from: "user", text: "hi", status: "read" }]);
	const incoming = renderChat([{ from: "bot", text: "hi", status: "read" }]);

	// "read" => two check paths; incoming ignores status
	assert.ok((withTicks.match(/stroke-linejoin="round"/g) ?? []).length >= 2);
	assert.ok(!incoming.includes('stroke-linejoin="round"'));
});

test("height grows with more messages", () => {
	const one = renderChat([{ from: "bot", text: "a" }]);
	const many = renderChat([
		{ from: "bot", text: "a" },
		{ from: "user", text: "b" },
		{ from: "bot", text: "c" },
	]);

	const h = (s: string) => Number(s.match(/height="(\d+)"/)?.[1] ?? 0);
	assert.ok(h(many) > h(one));
});

test("applies entity styling (bold / link / strike)", () => {
	const svg = renderChat([
		{
			from: "bot",
			text: "bold link gone",
			entities: [
				{ type: "bold", offset: 0, length: 4 },
				{ type: "text_link", offset: 5, length: 4, url: "https://yaeb.al" },
				{ type: "strikethrough", offset: 10, length: 4 },
			],
		},
	]);

	assert.ok(svg.includes('font-weight="600"'));
	assert.ok(svg.includes('text-decoration="line-through"'));
});

test("masks spoiler text with blocks (content not leaked)", () => {
	const svg = renderChat([
		{ from: "bot", text: "secret", entities: [{ type: "spoiler", offset: 0, length: 6 }] },
	]);

	assert.ok(svg.includes("██████"));
	assert.ok(!svg.includes(">secret<"));
});

test("renders a poll with percentage bars", () => {
	const svg = renderChat([
		{
			from: "bot",
			poll: {
				id: "1",
				question: "tabs or spaces?",
				options: [
					{ text: "tabs", voter_count: 3, persistent_id: "1" },
					{ text: "spaces", voter_count: 1, persistent_id: "2" },
				],
				total_voter_count: 4,
				is_closed: false,
				is_anonymous: true,
				type: "regular",
				allows_multiple_answers: false,
				allows_revoting: false,
				members_only: false,
			},
		},
	]);

	assert.ok(svg.includes("tabs or spaces?"));
	assert.ok(svg.includes("75%"));
	assert.ok(svg.includes("25%"));
});

test("renders picture media (photo) with a caption", () => {
	const svg = renderChat([
		{
			from: "bot",
			photo: [{ file_id: "x", file_unique_id: "u", width: 800, height: 600 }],
			caption: "a cat",
		},
	]);

	assert.ok(svg.includes("clipPath")); // picture is clipped to a rounded rect
	assert.ok(svg.includes("a cat"));
});

test("renders a sticker standalone (no bubble path)", () => {
	const svg = renderChat([
		{
			from: "bot",
			sticker: {
				file_id: "s",
				file_unique_id: "u",
				type: "regular",
				width: 512,
				height: 512,
				is_animated: false,
				is_video: false,
				emoji: "🔥",
			},
		},
	]);

	assert.ok(svg.includes("🔥"));
});
