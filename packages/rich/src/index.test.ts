import assert from "node:assert/strict";
import test from "node:test";
import { type Api, Composer, Context } from "@yaebal/core";
import {
	bold,
	document,
	md,
	paragraph,
	RichMessageDraft,
	rich,
	sendRichMessage,
	sendRichMessageDraft,
} from "./index.js";

// integration-level coverage for the parts that tie the package together: the raw
// send/draft functions, and the `rich()` plugin's ctx decoration. per-builder output
// (blocks.test.ts/inline.test.ts/markdown.test.ts), guards (guards.test.ts),
// plaintext flattening (plaintext.test.ts), and RichMessageDraft's rewrite/write/send
// state machine (draft.test.ts) all have their own dedicated test files.

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

test("sendRichMessage unwraps a markdown RichDocument with its fluent flags", async () => {
	const api = mockApi();

	await sendRichMessage(api, 42, md`# hi ${bold("there")}`.rtl());

	assert.deepEqual(api.calls, [
		[
			"sendRichMessage",
			{ chat_id: 42, rich_message: { markdown: "# hi **there**", is_rtl: true } },
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

test("rich() plugin decorates ctx.sendRichMessage/ctx.richMessageDraft bound to the current chat", async () => {
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

test("rich() plugin routes ctx.sendRichMessage through the business connection/topic", async () => {
	const api = mockApi();
	const composer = new Composer().install(rich());

	const ctx = new Context({
		api,
		update: {
			update_id: 1,
			business_message: {
				message_id: 1,
				date: 0,
				chat: { id: 5, type: "private" },
				business_connection_id: "bc1",
				message_thread_id: 9,
			},
		} as never,
		updateType: "business_message",
	});

	await composer.toMiddleware()(ctx as never, async () => {});

	const decorated = ctx as unknown as { sendRichMessage: (input: unknown) => Promise<unknown> };
	await decorated.sendRichMessage(document([paragraph("hi")]));

	assert.deepEqual(api.calls[0], [
		"sendRichMessage",
		{
			chat_id: 5,
			rich_message: { html: "<p>hi</p>" },
			business_connection_id: "bc1",
			message_thread_id: 9,
		},
	]);
});

test("sendRichMessage()/richMessageDraft() reject when the update has no chat", async () => {
	const api = mockApi();
	const composer = new Composer().install(rich());

	const ctx = new Context({
		api,
		update: { update_id: 1 } as never,
		updateType: "message",
	});

	await composer.toMiddleware()(ctx as never, async () => {});

	const decorated = ctx as unknown as {
		sendRichMessage: (input: unknown) => Promise<unknown>;
		richMessageDraft: (draftId: number) => RichMessageDraft;
	};

	await assert.rejects(() => decorated.sendRichMessage("x"), /no chat in this update/);
	assert.throws(() => decorated.richMessageDraft(1), /no chat in this update/);
});
