import assert from "node:assert/strict";
import test from "node:test";
import type { Api } from "@yaebal/core";
import { RichMessageDraft } from "./draft.js";

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

test("rewrite() pushes a full sendRichMessageDraft snapshot and re-arms the keep-alive timer", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 7, { keepAliveMs: 60_000 });

	await draft.rewrite("<tg-thinking>…</tg-thinking>");

	assert.deepEqual(api.calls, [
		[
			"sendRichMessageDraft",
			{ chat_id: 1, draft_id: 7, rich_message: { html: "<tg-thinking>…</tg-thinking>" } },
		],
	]);
});

test("rewrite() replaces the whole draft — a second call drops the first's content", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite("<p>one</p>");
	await draft.rewrite("<p>two</p>");

	assert.equal(api.calls.length, 2);
	assert.deepEqual(api.calls[1]?.[1]?.rich_message, { html: "<p>two</p>" });
});

test("write() appends via string concatenation onto the current draft", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>hello</p>" });
	await draft.write({ html: "<hr/>" });

	assert.deepEqual(api.calls[1]?.[1]?.rich_message, { html: "<p>hello</p><hr/>" });
});

test("write() before the first rewrite() throws", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1);

	await assert.rejects(() => draft.write("x"), /write\(\) before the first rewrite\(\)/);
});

test("write() with a dialect that doesn't match the draft's throws", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>hi</p>" });

	await assert.rejects(
		() => draft.write({ markdown: "hi" }),
		/dialect "markdown" doesn't match the draft's "html"/,
	);
});

test("send() with no override auto-assembles from the accumulated rewrite()/write() calls", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>hello</p>" });
	await draft.write({ html: "<hr/>" });
	await draft.send();

	assert.deepEqual(api.calls[2], [
		"sendRichMessage",
		{ chat_id: 1, rich_message: { html: "<p>hello</p><hr/>" } },
	]);
	assert.equal(draft.closed, true);
});

test("send(override) persists the override instead of the accumulated draft", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>draft text</p>" });
	await draft.send({ html: "<p>final text</p>" }, { reply_markup: { x: 1 } });

	assert.deepEqual(api.calls[1], [
		"sendRichMessage",
		{ chat_id: 1, rich_message: { html: "<p>final text</p>" }, reply_markup: { x: 1 } },
	]);
});

test("send() with nothing written and no override throws", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1);

	await assert.rejects(() => draft.send(), /send\(\) with nothing written/);
});

test("cancel() closes without persisting anything", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 2, { keepAliveMs: 60_000 });

	await draft.rewrite("draft text");
	draft.cancel();

	assert.equal(draft.closed, true);
	assert.equal(
		api.calls.some(([method]) => method === "sendRichMessage"),
		false,
	);
});

test("rewrite()/write() after send()/cancel() throws", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite("x");
	await draft.send();

	await assert.rejects(() => draft.rewrite("late"), /after send\(\)\/cancel\(\)/);
	await assert.rejects(() => draft.write("late"), /after send\(\)\/cancel\(\)/);
});

test("messageThreadId routes both the keep-alive pushes and the final send", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000, messageThreadId: 42 });

	await draft.rewrite("<p>hi</p>");
	await draft.send();

	assert.deepEqual(api.calls[0], [
		"sendRichMessageDraft",
		{ chat_id: 1, draft_id: 1, rich_message: { html: "<p>hi</p>" }, message_thread_id: 42 },
	]);
	assert.deepEqual(api.calls[1], [
		"sendRichMessage",
		{ chat_id: 1, rich_message: { html: "<p>hi</p>" }, message_thread_id: 42 },
	]);
});

test("businessConnectionId routes only the final send (sendRichMessageDraft has no such param)", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, {
		keepAliveMs: 60_000,
		businessConnectionId: "bc1",
	});

	await draft.rewrite("<p>hi</p>");
	await draft.send();

	assert.equal(api.calls[0]?.[1]?.business_connection_id, undefined);
	assert.equal(api.calls[1]?.[1]?.business_connection_id, "bc1");
});

test("preserves is_rtl/skip_entity_detection across write() unless the new push overrides them", async () => {
	const api = mockApi();
	const draft = new RichMessageDraft(api, 1, 1, { keepAliveMs: 60_000 });

	await draft.rewrite({ html: "<p>a</p>", is_rtl: true });
	await draft.write({ html: "<p>b</p>" });

	assert.deepEqual(api.calls[1]?.[1]?.rich_message, { html: "<p>a</p><p>b</p>", is_rtl: true });
});
