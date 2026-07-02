import assert from "node:assert/strict";
import test from "node:test";
import { type Api, Composer, Context } from "@yaebal/core";
import type { RichBlock, RichMessage } from "@yaebal/types";
import {
	bold,
	cell,
	details,
	document,
	heading,
	html,
	image,
	isPhoto,
	isTable,
	item,
	link,
	list,
	paragraph,
	RichMessageDraft,
	rich,
	richMessageToPlainText,
	sendRichMessage,
	sendRichMessageDraft,
	table,
	thinking,
} from "./index.js";

function mockApi(): Api & { calls: [string, Record<string, unknown> | undefined][] } {
	const calls: [string, Record<string, unknown> | undefined][] = [];

	return {
		calls,
		call: async (method: string, params?: Record<string, unknown>) => {
			calls.push([method, params]);
			return {} as never;
		},
	} as unknown as Api & { calls: [string, Record<string, unknown> | undefined][] };
}

test("html template escapes interpolations and splices RichNode subs", () => {
	const node = html`<p>hi ${"<b>hax</b>"} — ${bold("safe")}</p>`;

	assert.equal(node.html, "<p>hi &lt;b&gt;hax&lt;/b&gt; — <b>safe</b></p>");
});

test("inline builders emit the documented tags", () => {
	assert.equal(bold("x").html, "<b>x</b>");
	assert.equal(link("https://yaeb.al", "docs").html, '<a href="https://yaeb.al">docs</a>');
});

test("block builders compose into a document", () => {
	const input = document([
		heading(1, "title"),
		paragraph("hello ", bold("world")),
		list([item(["a"]), item(["b"], { checkbox: true, checked: true })]),
		details("more", [paragraph("hidden")], { open: false }),
	]);

	assert.equal(
		input.html,
		"<h1>title</h1>" +
			"<p>hello <b>world</b></p>" +
			'<ul><li>a</li><li><input type="checkbox" checked/> b</li></ul>' +
			"<details><summary>more</summary><p>hidden</p></details>",
	);
});

test("table() and cell() render alignment attributes telegram's schema documents", () => {
	const node = table([
		[cell("a", { header: true, align: "center" }), cell("b", { valign: "middle" })],
	]);

	assert.equal(
		node.html,
		'<table><tr><th align="center">a</th><td valign="middle">b</td></tr></table>',
	);
});

test("image() wraps caption/credit in figure/figcaption/cite", () => {
	const node = image("https://example.com/x.jpg", { caption: "a cat", credit: "photographer" });

	assert.equal(
		node.html,
		'<figure><img src="https://example.com/x.jpg"></img><figcaption>a cat<cite>photographer</cite></figcaption></figure>',
	);
});

test("thinking() is exposed for draft-only use", () => {
	assert.equal(thinking("…").html, "<tg-thinking>…</tg-thinking>");
});

test("sendRichMessage posts chat_id + rich_message to the raw api", async () => {
	const api = mockApi();

	await sendRichMessage(api, 42, document([paragraph("hi")]), { reply_markup: { x: 1 } });

	assert.deepEqual(api.calls, [
		[
			"sendRichMessage",
			{ chat_id: 42, rich_message: { html: "<p>hi</p>" }, reply_markup: { x: 1 } },
		],
	]);
});

test("sendRichMessageDraft posts draft_id alongside chat_id + rich_message", async () => {
	const api = mockApi();

	await sendRichMessageDraft(api, 42, 7, "<tg-thinking>…</tg-thinking>");

	assert.deepEqual(api.calls, [
		[
			"sendRichMessageDraft",
			{ chat_id: 42, draft_id: 7, rich_message: { html: "<tg-thinking>…</tg-thinking>" } },
		],
	]);
});

test("rich() plugin decorates ctx.sendRichMessage bound to the current chat", async () => {
	const api = mockApi();
	const composer = new Composer().install(rich());

	const ctx = new Context({
		api,
		update: {
			update_id: 1,
			message: { message_id: 1, date: 0, chat: { id: 5, type: "private" } },
		} as never,
		updateType: "message",
	});

	await composer.toMiddleware()(ctx as never, async () => {});

	const decorated = ctx as unknown as {
		sendRichMessage: (input: unknown) => Promise<unknown>;
		richMessageDraft: (draftId: number) => RichMessageDraft;
	};

	await decorated.sendRichMessage(document([paragraph("hi")]));
	assert.deepEqual(api.calls[0], [
		"sendRichMessage",
		{ chat_id: 5, rich_message: { html: "<p>hi</p>" } },
	]);

	const draft = decorated.richMessageDraft(1);
	assert.ok(draft instanceof RichMessageDraft);
});

test("RichMessageDraft.push() re-arms a keep-alive timer and commit() stops it", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.push(thinking("…"));
	assert.equal(api.calls[0]?.[0], "sendRichMessageDraft");

	await draft.commit(document([paragraph("done")]));
	assert.equal(api.calls[1]?.[0], "sendRichMessage");
	assert.equal(draft.closed, true);

	await assert.rejects(() => draft.push("late"), /after commit\(\)\/cancel\(\)/);
});

test("RichMessageDraft.cancel() closes without persisting", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 2);

	await draft.push("draft text");
	draft.cancel();

	assert.equal(draft.closed, true);
	assert.equal(
		api.calls.some(([method]) => method === "sendRichMessage"),
		false,
	);
});

test("guards narrow RichBlock by .type despite the generated field being `string`", () => {
	const blocks = [
		{ type: "table", cells: [[{ text: "x", align: "left", valign: "top" }]] },
		{ type: "photo", photo: [] },
	] as unknown as RichBlock[];

	assert.equal(isTable(blocks[0] as RichBlock), true);
	assert.equal(isPhoto(blocks[1] as RichBlock), true);
	assert.equal(isTable(blocks[1] as RichBlock), false);
});

test("richMessageToPlainText flattens a full block tree", () => {
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
