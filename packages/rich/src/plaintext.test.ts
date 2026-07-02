import assert from "node:assert/strict";
import test from "node:test";
import type { RichBlock, RichMessage } from "@yaebal/types";
import { richBlockToPlainText, richMessageToPlainText, richTextToPlainText } from "./plaintext.js";

test("richTextToPlainText flattens a plain string, nested marks, and arrays", () => {
	assert.equal(richTextToPlainText("hi"), "hi");
	assert.equal(richTextToPlainText({ type: "bold", text: "hi" } as never), "hi");
	assert.equal(
		richTextToPlainText([{ type: "bold", text: "a" }, " ", { type: "italic", text: "b" }] as never),
		"a b",
	);
});

test("richTextToPlainText special-cases custom_emoji/mathematical_expression/anchor", () => {
	assert.equal(
		richTextToPlainText({ type: "custom_emoji", alternative_text: "😀" } as never),
		"😀",
	);
	assert.equal(
		richTextToPlainText({ type: "mathematical_expression", expression: "a^2" } as never),
		"a^2",
	);
	assert.equal(richTextToPlainText({ type: "anchor", name: "top" } as never), "");
});

test("richTextToPlainText returns empty string for undefined", () => {
	assert.equal(richTextToPlainText(undefined), "");
});

test("richBlockToPlainText flattens simple text-bearing blocks with a trailing newline", () => {
	assert.equal(richBlockToPlainText({ type: "paragraph", text: "hi" } as never), "hi\n");
	assert.equal(
		richBlockToPlainText({ type: "heading", text: "title", size: 1 } as never),
		"title\n",
	);
	assert.equal(richBlockToPlainText({ type: "pre", text: "code" } as never), "code\n");
	assert.equal(richBlockToPlainText({ type: "footer", text: "f" } as never), "f\n");
	assert.equal(richBlockToPlainText({ type: "thinking", text: "…" } as never), "…\n");
	assert.equal(richBlockToPlainText({ type: "divider" } as never), "---\n");
	assert.equal(richBlockToPlainText({ type: "anchor", name: "top" } as never), "");
	assert.equal(
		richBlockToPlainText({ type: "mathematical_expression", expression: "a^2" } as never),
		"a^2\n",
	);
});

test("richBlockToPlainText flattens a list, one `- ` item per line", () => {
	const block = {
		type: "list",
		items: [
			{ blocks: [{ type: "paragraph", text: "one" }] },
			{ blocks: [{ type: "paragraph", text: "two" }] },
		],
	} as never;

	assert.equal(richBlockToPlainText(block), "- one\n- two\n");
});

test("richBlockToPlainText flattens blockquote/pullquote with an optional ' — credit' suffix", () => {
	assert.equal(
		richBlockToPlainText({
			type: "blockquote",
			blocks: [{ type: "paragraph", text: "x" }],
		} as never),
		"x\n\n",
	);
	assert.equal(
		richBlockToPlainText({
			type: "blockquote",
			blocks: [{ type: "paragraph", text: "x" }],
			credit: "author",
		} as never),
		"x\n — author\n",
	);
	assert.equal(richBlockToPlainText({ type: "pullquote", text: "x" } as never), "x\n");
	assert.equal(
		richBlockToPlainText({ type: "pullquote", text: "x", credit: "author" } as never),
		"x — author\n",
	);
});

test("richBlockToPlainText flattens collage/slideshow blocks with a captioned trailer", () => {
	const block = {
		type: "collage",
		blocks: [{ type: "photo", photo: [], caption: undefined }],
		caption: { text: "a cat", credit: "photographer" },
	} as never;

	assert.equal(richBlockToPlainText(block), "a cat (photographer)\n");
});

test("richBlockToPlainText flattens a table, ` | `-joined cells, one row per line", () => {
	const block = {
		type: "table",
		cells: [
			[{ text: "a" }, { text: "b" }],
			[{ text: "c" }, { text: "d" }],
		],
	} as never;

	assert.equal(richBlockToPlainText(block), "a | b\nc | d\n");
});

test("richBlockToPlainText flattens details as its summary followed by its blocks", () => {
	const block = {
		type: "details",
		summary: "more",
		blocks: [{ type: "paragraph", text: "hidden" }],
	} as never;

	assert.equal(richBlockToPlainText(block), "more\nhidden\n");
});

test("richBlockToPlainText flattens map/media blocks down to just their caption", () => {
	assert.equal(richBlockToPlainText({ type: "map", caption: { text: "here" } } as never), "here\n");
	assert.equal(richBlockToPlainText({ type: "photo", photo: [], caption: undefined } as never), "");
	for (const type of ["animation", "audio", "photo", "video", "voice_note"] as const) {
		assert.equal(richBlockToPlainText({ type, caption: { text: "cap" } } as never), "cap\n");
	}
});

test("richBlockToPlainText falls back to empty string for an unrecognized block type", () => {
	assert.equal(richBlockToPlainText({ type: "not-a-real-type" } as unknown as RichBlock), "");
});

test("richMessageToPlainText flattens a full block tree, joined and trimmed", () => {
	const message = {
		blocks: [
			{ type: "heading", text: "title", size: 1 },
			{ type: "paragraph", text: [{ type: "bold", text: "hi" }, " there"] },
			{ type: "divider" },
			{
				type: "list",
				items: [{ label: "1", blocks: [{ type: "paragraph", text: "one" }] }],
			},
		],
	} as unknown as RichMessage;

	assert.equal(richMessageToPlainText(message), "title\nhi there\n---\n- one");
});
