import assert from "node:assert/strict";
import test from "node:test";
import { mockApi } from "@yaebal/test";
import { RichMessageDraft } from "./draft.js";

test("rewrite() pushes a full sendRichMessageDraft snapshot and re-arms the keep-alive timer", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 7, { keepAliveMs: 60_000 });

	await draft.rewrite("<tg-thinking>…</tg-thinking>");

	assert.deepEqual(
		calls.map((c) => ({ method: c.method, params: c.params })),
		[
			{
				method: "sendRichMessageDraft",
				params: { chat_id: 1, draft_id: 7, rich_message: { html: "<tg-thinking>…</tg-thinking>" } },
			},
		],
	);
});

test("rewrite() replaces the whole draft — a second call drops the first's content", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite("<p>one</p>");
	await draft.rewrite("<p>two</p>");

	assert.equal(calls.length, 2);
	assert.deepEqual(calls[1]?.params?.rich_message, { html: "<p>two</p>" });
});

test("write() appends via string concatenation onto the current draft", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>hello</p>" });
	await draft.write({ html: "<hr/>" });

	assert.deepEqual(calls[1]?.params?.rich_message, { html: "<p>hello</p><hr/>" });
});

test("write() before the first rewrite() throws", async () => {
	const { api } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1);

	await assert.rejects(() => draft.write("x"), /write\(\) before the first rewrite\(\)/);
});

test("write() with a dialect that doesn't match the draft's throws", async () => {
	const { api } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>hi</p>" });

	await assert.rejects(
		() => draft.write({ markdown: "hi" }),
		/dialect "markdown" doesn't match the draft's "html"/,
	);
});

test("send() with no override auto-assembles from the accumulated rewrite()/write() calls", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>hello</p>" });
	await draft.write({ html: "<hr/>" });
	await draft.send();

	assert.equal(calls[2]?.method, "sendRichMessage");
	assert.deepEqual(calls[2]?.params, { chat_id: 1, rich_message: { html: "<p>hello</p><hr/>" } });
	assert.equal(draft.closed, true);
});

test("send(override) persists the override instead of the accumulated draft", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>draft text</p>" });
	await draft.send({ html: "<p>final text</p>" }, { reply_markup: { x: 1 } });

	assert.equal(calls[1]?.method, "sendRichMessage");
	assert.deepEqual(calls[1]?.params, {
		chat_id: 1,
		rich_message: { html: "<p>final text</p>" },
		reply_markup: { x: 1 },
	});
});

test("send() with nothing written and no override throws", async () => {
	const { api } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1);

	await assert.rejects(() => draft.send(), /send\(\) with nothing written/);
});

test("cancel() closes without persisting anything", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 2, { keepAliveMs: 60_000 });

	await draft.rewrite("draft text");
	draft.cancel();

	assert.equal(draft.closed, true);
	assert.equal(
		calls.some((c) => c.method === "sendRichMessage"),
		false,
	);
});

test("rewrite()/write() after send()/cancel() throws", async () => {
	const { api } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite("x");
	await draft.send();

	await assert.rejects(() => draft.rewrite("late"), /after send\(\)\/cancel\(\)/);
	await assert.rejects(() => draft.write("late"), /after send\(\)\/cancel\(\)/);
});

test("messageThreadId routes both the keep-alive pushes and the final send", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000, messageThreadId: 42 });

	await draft.rewrite("<p>hi</p>");
	await draft.send();

	assert.equal(calls[0]?.method, "sendRichMessageDraft");
	assert.deepEqual(calls[0]?.params, {
		chat_id: 1,
		draft_id: 1,
		rich_message: { html: "<p>hi</p>" },
		message_thread_id: 42,
	});
	assert.equal(calls[1]?.method, "sendRichMessage");
	assert.deepEqual(calls[1]?.params, {
		chat_id: 1,
		rich_message: { html: "<p>hi</p>" },
		message_thread_id: 42,
	});
});

test("businessConnectionId routes only the final send (sendRichMessageDraft has no such param)", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, {
		keepAliveMs: 60_000,
		businessConnectionId: "bc1",
	});

	await draft.rewrite("<p>hi</p>");
	await draft.send();

	assert.equal(calls[0]?.params?.business_connection_id, undefined);
	assert.equal(calls[1]?.params?.business_connection_id, "bc1");
});

test("preserves is_rtl/skip_entity_detection across write() unless the new push overrides them", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>a</p>", is_rtl: true });
	await draft.write({ html: "<p>b</p>" });

	assert.deepEqual(calls[1]?.params?.rich_message, { html: "<p>a</p><p>b</p>", is_rtl: true });
});

test("canStop/keepOnStop (bot api 10.3) ride along on every draft push", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 3, {
		keepAliveMs: 60_000,
		canStop: true,
		keepOnStop: false,
	});

	await draft.rewrite("<p>a</p>");
	await draft.write("<p>b</p>");

	for (const call of calls) {
		assert.equal(call.params?.can_stop, true);
		assert.equal(call.params?.keep_on_stop, false);
	}
	draft.cancel();
});

test("structured blocks append and survive finalization without mutating the input", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 9);
	const input = { blocks: [{ type: "divider" }], is_rtl: false };
	await draft.rewrite(input);
	await draft.write({ blocks: [{ type: "anchor", name: "end" }] });
	await draft.send();
	assert.deepEqual(input.blocks, [{ type: "divider" }]);
	assert.deepEqual(calls.at(-1)?.params?.rich_message, {
		blocks: [{ type: "divider" }, { type: "anchor", name: "end" }],
		is_rtl: false,
	});
});

test("drafts preserve and merge referenced file ids through pushes and finalization", async (t) => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 9, { keepAliveMs: 1000 });
	t.mock.timers.enable({ apis: ["setInterval"] });
	t.after(() => draft.cancel());
	const photo = { id: "photo1", media: { type: "photo", media: "photo-file-id" } };
	const file = { id: "file1", media: { type: "document", media: "document-file-id" } };
	await draft.rewrite({ html: '<img src="tg://photo?id=photo1">', media: [photo] });
	await draft.write({ html: '<tg-document src="tg://document?id=file1">', media: [file] });
	t.mock.timers.tick(1000);
	await draft.send();
	for (const call of calls.slice(1)) {
		assert.deepEqual((call.params?.rich_message as { media: unknown }).media, [photo, file]);
	}
});

test("draft uploads reject early while a final override can upload new media", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 9);
	for (const source of [
		"https://example.com/file",
		"attach://file",
		{ kind: "text" as const, text: "new", filename: "file.txt" },
	]) {
		await assert.rejects(
			() =>
				draft.rewrite({
					blocks: [{ type: "document", document: { type: "document", media: source } }],
				}),
			/previously uploaded files/,
		);
	}
	assert.equal(calls.length, 0);
	await draft.send({
		blocks: [
			{ type: "document", document: { type: "document", media: "https://example.com/file" } },
		],
	});
	assert.equal(calls[0]?.method, "sendRichMessage");
});

test("ambiguous input and mixed block/text writes reject without replacing the last draft", async () => {
	const { api, calls } = mockApi();
	const draft = new RichMessageDraft(api, 1, 9);
	await draft.rewrite({ blocks: [{ type: "divider" }] });
	await assert.rejects(() => draft.write("text"), /cannot append text to blocks/);
	await assert.rejects(() => draft.rewrite({ html: "a", markdown: "b" }), /exactly one/);
	await draft.send();
	assert.deepEqual(calls.at(-1)?.params?.rich_message, { blocks: [{ type: "divider" }] });
});
