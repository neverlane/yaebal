import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { pagination } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

interface Call {
	method: string;
	// biome-ignore lint/suspicious/noExplicitAny: test recorder captures arbitrary params
	params: any;
}

function fakeApi() {
	const calls: Call[] = [];
	const api = {
		sendMessage: (params: Record<string, unknown>) => {
			calls.push({ method: "sendMessage", params });
			return Promise.resolve({ message_id: 100 });
		},
		answerCallbackQuery: (params: Record<string, unknown>) => {
			calls.push({ method: "answerCallbackQuery", params });
			return Promise.resolve(true);
		},
		call: (method: string, params: Record<string, unknown>) => {
			calls.push({ method, params });
			return Promise.resolve(true);
		},
	} as never;

	return { api, calls };
}

const msgCtx = (api: never) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "/list" },
		} as never,
		updateType: "message",
	});

const cbCtx = (api: never, data: string) =>
	new Context({
		api,
		update: {
			update_id: 1,
			callback_query: {
				id: "cb",
				from: { id: 1, is_bot: false, first_name: "u" },
				message: { message_id: 100, date: 0, chat: { id: 1, type: "private" } },
				data,
			},
		} as never,
		updateType: "callback_query",
	});

// biome-ignore lint/suspicious/noExplicitAny: reaching into recorded params
const nextData = (params: any): string => {
	const rows = params.reply_markup.inline_keyboard as Array<
		Array<{ text: string; callback_data: string }>
	>;

	for (const row of rows) for (const b of row) if (b.text === "▶") return b.callback_data;

	throw new Error("no next button");
};

const list = pagination<number>({
	id: "nums",
	pageSize: 5,
	source: () => Array.from({ length: 12 }, (_, i) => i),
	line: (n, i) => `${i}: ${n}`,
});

test("send renders the first page with a next button only", async () => {
	const { api, calls } = fakeApi();
	await list.send(msgCtx(api));

	const sent = calls.find((c) => c.method === "sendMessage");
	assert.match(sent?.params.text, /page 1\/3/);
	assert.match(sent?.params.text, /0: 0/);
	assert.match(sent?.params.text, /4: 4/);
	assert.doesNotMatch(sent?.params.text, /5: 5/); // page size 5

	// page 0 → next only, no prev
	const flat = sent?.params.reply_markup.inline_keyboard.flat() as Array<{ text: string }>;

	assert.deepEqual(
		flat.map((b) => b.text),
		["▶"],
	);
});

test("pressing next edits the message to the following page", async () => {
	const { api, calls } = fakeApi();
	await list.send(msgCtx(api));

	const sent = calls.find((c) => c.method === "sendMessage");
	const data = nextData(sent?.params);

	calls.length = 0;
	const mw = entry(new Composer<Context>().install(list.plugin()));
	await mw(cbCtx(api, data), noop);

	const edit = calls.find((c) => c.method === "editMessageText");
	assert.match(edit?.params.text, /page 2\/3/);
	assert.match(edit?.params.text, /5: 5/);

	// page 1 → both prev and next
	const flat = edit?.params.reply_markup.inline_keyboard.flat() as Array<{ text: string }>;
	
	assert.deepEqual(
		flat.map((b) => b.text),
		["◀", "▶"],
	);
});
