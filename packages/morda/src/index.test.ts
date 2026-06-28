import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/session";
import { type DialogDef, type DialogState, back, button, dialogs, switchTo } from "./index.js";

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
	let nextId = 100;

	const api = {
		sendMessage(params: Record<string, unknown>) {
			calls.push({ method: "sendMessage", params });
			return Promise.resolve({ message_id: nextId++ });
		},
		answerCallbackQuery(params: Record<string, unknown>) {
			calls.push({ method: "answerCallbackQuery", params });
			return Promise.resolve(true);
		},
		call(method: string, params: Record<string, unknown>) {
			calls.push({ method, params });
			return Promise.resolve(true);
		},
	} as never;

	return { api, calls };
}

const msgCtx = (api: never, text: string, chatId: number) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
				from: { id: chatId, is_bot: false, first_name: "u" },
				text,
			},
		} as never,
		updateType: "message",
	});

const cbCtx = (api: never, data: string, chatId: number, messageId: number) =>
	new Context({
		api,
		update: {
			update_id: 1,
			callback_query: {
				id: "cb",
				from: { id: chatId, is_bot: false, first_name: "u" },
				message: { message_id: messageId, date: 0, chat: { id: chatId, type: "private" } },
				data,
			},
		} as never,
		updateType: "callback_query",
	});

const def: DialogDef = {
	main: () => ({
		text: "main",
		keyboard: [
			[switchTo("settings →", "settings")],
			[button("ping", { id: "ping", onClick: (c) => c.answerCallbackQuery({ text: "pong" }) })],
		],
	}),
	settings: () => ({ text: "Settings", keyboard: [[back("← Back")]] }),
};

// read a button's callback_data straight from a recorded keyboard — no coupling
// to morda's internal encoding.
// biome-ignore lint/suspicious/noExplicitAny: reaching into recorded params
const dataAt = (params: any, row: number, col: number): string =>
	params.reply_markup.inline_keyboard[row][col].callback_data;

test("start → push(settings) → back navigates and edits in place", async () => {
	const { api, calls } = fakeApi();

	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);

	const sent = calls.find((c) => c.method === "sendMessage");
	assert.equal(sent?.params.text, "Main");

	const state = await storage.get("1");
	assert.deepEqual(state?.stack, ["main"]);

	// press "settings →"
	calls.length = 0;

	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 1, state?.messageId ?? 0), noop);
	const edit1 = calls.find((c) => c.method === "editMessageText");

	assert.equal(edit1?.params.text, "Settings");
	assert.deepEqual((await storage.get("1"))?.stack, ["main", "settings"]);

	// press "← back"
	calls.length = 0;

	await mw(cbCtx(api, dataAt(edit1?.params, 0, 0), 1, state?.messageId ?? 0), noop);
	const edit2 = calls.find((c) => c.method === "editMessageText");

	assert.equal(edit2?.params.text, "Main");
	assert.deepEqual((await storage.get("1"))?.stack, ["main"]);
});

test("onClick runs without navigating", async () => {
	const { api, calls } = fakeApi();

	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = calls.find((c) => c.method === "sendMessage");
	calls.length = 0;

	// press "ping" (row 1)
	await mw(cbCtx(api, dataAt(sent?.params, 1, 0), 1, 100), noop);

	assert.ok(calls.some((c) => c.method === "answerCallbackQuery" && c.params.text === "pong"));
	assert.equal(
		calls.find((c) => c.method === "editMessageText"),
		undefined,
	);
	assert.deepEqual((await storage.get("1"))?.stack, ["main"]); // unchanged
});

test("a press whose window is not the stack top is ignored", async () => {
	const { api, calls } = fakeApi();

	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = calls.find((c) => c.method === "sendMessage");
	// navigate to settings → stack top is now "settings"
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 1, 100), noop);
	calls.length = 0;

	// press the OLD "ping" button from main (payload.w = "main") while on "settings"
	await mw(cbCtx(api, dataAt(sent?.params, 1, 0), 1, 100), noop);
	assert.equal(
		calls.some((c) => c.method === "answerCallbackQuery" && c.params.text === "pong"),
		false, // stale onClick did NOT run
	);
	assert.deepEqual((await storage.get("1"))?.stack, ["main", "settings"]); // unchanged
});

test("back() at the root closes the dialog", async () => {
	const { api, calls } = fakeApi();
	
	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main"))
			.command("close", (ctx) => ctx.dialog.back()),
	);

	await mw(msgCtx(api, "/go", 2), noop);
	calls.length = 0;
	await mw(msgCtx(api, "/close", 2), noop);

	assert.ok(calls.some((c) => c.method === "deleteMessage"));
	assert.equal(await storage.get("2"), undefined);
});
