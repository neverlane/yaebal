import assert from "node:assert/strict";
import test from "node:test";
import { bold, Composer, Context, format, type Middleware } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/sklad";
import {
	back,
	button,
	createDialogs,
	type DialogDef,
	type DialogState,
	dialogs,
	MordaError,
	switchTo,
	url,
} from "./index.js";

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
	const failures = new Map<string, string>();
	let nextId = 100;

	const api = {
		call(method: string, params: Record<string, unknown>) {
			calls.push({ method, params });
			const failure = failures.get(method);
			if (failure) return Promise.reject(new Error(failure));
			if (method.startsWith("send")) return Promise.resolve({ message_id: nextId++ });
			return Promise.resolve(true);
		},
	} as never;

	return {
		api,
		calls,
		fail: (method: string, message: string) => failures.set(method, message),
		heal: (method: string) => failures.delete(method),
		of: (method: string) => calls.filter((c) => c.method === method),
	};
}

const msgCtx = (api: never, text: string, chatId: number, fromId = chatId, chatType = "private") =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: chatType },
				from: { id: fromId, is_bot: false, first_name: "u" },
				text,
			},
		} as never,
		updateType: "message",
	});

const cbCtx = (
	api: never,
	data: string,
	chatId: number,
	messageId: number,
	fromId = chatId,
	chatType = "private",
) =>
	new Context({
		api,
		update: {
			update_id: 1,
			callback_query: {
				id: "cb",
				from: { id: fromId, is_bot: false, first_name: "u" },
				message: { message_id: messageId, date: 0, chat: { id: chatId, type: chatType } },
				data,
			},
		} as never,
		updateType: "callback_query",
	});

const bizMsgCtx = (api: never, text: string, chatId: number, businessConnectionId: string) =>
	new Context({
		api,
		update: {
			update_id: 1,
			business_message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
				from: { id: chatId, is_bot: false, first_name: "u" },
				business_connection_id: businessConnectionId,
				text,
			},
		} as never,
		updateType: "business_message",
	});

const def = {
	main: () => ({
		text: "main",
		keyboard: [
			[switchTo("settings →", "settings")],
			[button("ping", { id: "ping", onClick: (c) => c.answerCallbackQuery({ text: "pong" }) })],
		],
	}),
	settings: () => ({ text: "Settings", keyboard: [[back("← Back")]] }),
} satisfies DialogDef;

// read a button's callback_data straight from a recorded keyboard — no coupling
// to morda's internal encoding.
// biome-ignore lint/suspicious/noExplicitAny: reaching into recorded params
const dataAt = (params: any, row: number, col: number): string =>
	params.reply_markup.inline_keyboard[row][col].callback_data;

test("start → push(settings) → back navigates and edits in place", async () => {
	const { api, calls, of } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	assert.equal(sent?.params.text, "main");

	const state = await storage.get("dlg:1");
	assert.deepEqual(
		state?.stack.map((f) => f.w),
		["main"],
	);

	calls.length = 0;
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 1, state?.messageId ?? 0), noop);
	const edit1 = of("editMessageText")[0];
	assert.equal(edit1?.params.text, "Settings");
	assert.deepEqual(
		(await storage.get("dlg:1"))?.stack.map((f) => f.w),
		["main", "settings"],
	);
	// the spinner is always cleared
	assert.equal(of("answerCallbackQuery").length, 1);

	calls.length = 0;
	await mw(cbCtx(api, dataAt(edit1?.params, 0, 0), 1, state?.messageId ?? 0), noop);
	assert.equal(of("editMessageText")[0]?.params.text, "main");
	assert.deepEqual(
		(await storage.get("dlg:1"))?.stack.map((f) => f.w),
		["main"],
	);
});

test("onClick runs without navigating; identical re-render is skipped", async () => {
	const { api, calls, of } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	calls.length = 0;

	await mw(cbCtx(api, dataAt(sent?.params, 1, 0), 1, 100), noop);
	assert.ok(calls.some((c) => c.method === "answerCallbackQuery" && c.params.text === "pong"));
	assert.equal(of("editMessageText").length, 0);
	assert.deepEqual(
		(await storage.get("dlg:1"))?.stack.map((f) => f.w),
		["main"],
	);
});

test("a press on a window that is no longer on top is stale (onStale fires)", async () => {
	const { api, calls, of } = fakeApi();
	let stale = 0;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { events: { onStale: () => stale++ } }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 1, 100), noop); // → settings
	calls.length = 0;

	// press the OLD "ping" button from main while settings is on top
	await mw(cbCtx(api, dataAt(sent?.params, 1, 0), 1, 100), noop);
	assert.equal(
		calls.some((c) => c.method === "answerCallbackQuery" && c.params.text === "pong"),
		false,
	);
	assert.equal(stale, 1);
	assert.equal(of("answerCallbackQuery").length, 1); // still answered (spinner cleared)
});

test("a press from a previous dialog instance (old intent) is stale", async () => {
	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>().install(dialogs(def)).command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const first = of("sendMessage")[0];
	await mw(msgCtx(api, "/go", 1), noop); // restart → new intent
	calls.length = 0;

	await mw(cbCtx(api, dataAt(first?.params, 1, 0), 1, 100), noop);
	assert.equal(of("editMessageText").length, 0); // nothing routed
	assert.equal(of("answerCallbackQuery").length, 1);
});

test("two dialogs() installs do not swallow each other's presses", async () => {
	const { api, calls, of } = fakeApi();
	let hits = 0;
	const defA = { a: () => ({ text: "A" }) } satisfies DialogDef;
	const defB = {
		b: () => ({
			text: "B",
			keyboard: [[button("hit", { id: "hit", onClick: () => hits++ })]],
		}),
	} satisfies DialogDef;

	const mw = entry(
		new Composer<Context>()
			.install(dialogs(defA))
			.install(dialogs(defB, { prefix: "dlgb" }))
			.command("go", (ctx) => ctx.dialog.start("b")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	calls.length = 0;

	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 1, 100), noop);
	assert.equal(hits, 1);
});

test("even with a shared default prefix, an inactive install passes presses through", async () => {
	const { api, of } = fakeApi();
	let hits = 0;
	const defA = { a: () => ({ text: "A" }) } satisfies DialogDef;
	const defB = {
		b: () => ({
			text: "B",
			keyboard: [[button("hit", { id: "hit", onClick: () => hits++ })]],
		}),
	} satisfies DialogDef;

	// both use the default "dlg" prefix — install A never opened a dialog, so it
	// must not eat B's presses (it can't prove they're its own).
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(defA))
			.install(dialogs(defB))
			.command("go", (ctx) => ctx.dialog.start("b")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	await mw(cbCtx(api, dataAt(of("sendMessage")[0]?.params, 0, 0), 1, 100), noop);
	assert.equal(hits, 1);
});

test("back() at the root deletes the message, drops state, fires onClose", async () => {
	const { api, calls, of } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	let closed: unknown = "unset";
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage, events: { onClose: (_ctx, result) => (closed = result) } }))
			.command("go", (ctx) => ctx.dialog.start("main"))
			.command("close", (ctx) => ctx.dialog.back("bye")),
	);

	await mw(msgCtx(api, "/go", 2), noop);
	calls.length = 0;
	await mw(msgCtx(api, "/close", 2), noop);

	assert.equal(of("deleteMessage").length, 1);
	assert.equal(await storage.get("dlg:2"), undefined);
	assert.equal(closed, "bye");
});

test("deleteMessage failure (48h rule) falls back to disarming the keyboard; state still dropped", async () => {
	const { api, calls, of, fail } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main"))
			.command("close", (ctx) => ctx.dialog.close()),
	);

	await mw(msgCtx(api, "/go", 3), noop);
	fail("deleteMessage", "Bad Request: message can't be deleted");
	calls.length = 0;
	await mw(msgCtx(api, "/close", 3), noop);

	assert.equal(of("editMessageReplyMarkup").length, 1); // dead buttons disarmed
	assert.equal(await storage.get("dlg:3"), undefined); // dialog is closed regardless
});

test("edit failure (user deleted the message) falls back to a fresh send", async () => {
	const { api, calls, of, fail } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 4), noop);
	const sent = of("sendMessage")[0];
	fail("editMessageText", "Bad Request: message to edit not found");
	fail("deleteMessage", "Bad Request: message to delete not found");
	calls.length = 0;

	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 4, 100), noop);
	const resent = of("sendMessage")[0];
	assert.equal(resent?.params.text, "Settings");
	assert.equal((await storage.get("dlg:4"))?.messageId, 101); // repointed to the new message
});

test("`message is not modified` is swallowed, not treated as a failure", async () => {
	const { api, calls, of, fail } = fakeApi();
	const refresh = {
		main: () => ({
			text: "static",
			keyboard: [[button("refresh", { id: "r", onClick: (c) => c.dialog.rerender() })]],
		}),
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(refresh))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 5), noop);
	const sent = of("sendMessage")[0];
	fail("editMessageText", "Bad Request: message is not modified");
	calls.length = 0;

	// identical render → skipped before the API is even called
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 5, 100), noop);
	assert.equal(of("editMessageText").length, 0);
	assert.equal(of("sendMessage").length, 0); // and definitely no resend
	assert.equal(of("answerCallbackQuery").length, 1);
});

test("in groups the dialog is per-user: two members get independent dialogs", async () => {
	const { api, of } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", -100, 7, "supergroup"), noop);
	await mw(msgCtx(api, "/go", -100, 8, "supergroup"), noop);

	assert.ok(await storage.get("dlg:-100:7"));
	assert.ok(await storage.get("dlg:-100:8"));
	assert.equal(of("sendMessage").length, 2);
});

test("another user's press on a per-user group dialog is not routed", async () => {
	const { api, calls, of } = fakeApi();
	let hits = 0;
	const groupDef = {
		main: () => ({
			text: "menu",
			keyboard: [[button("hit", { id: "hit", onClick: () => hits++ })]],
		}),
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(groupDef))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", -100, 7, "supergroup"), noop);
	const sent = of("sendMessage")[0];
	calls.length = 0;

	// user 8 presses user 7's button — different key, no state → falls through
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), -100, 100, 8, "supergroup"), noop);
	assert.equal(hits, 0);

	// the owner's press works
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), -100, 100, 7, "supergroup"), noop);
	assert.equal(hits, 1);
});

test("access predicate gates presses; onAccessDenied fires", async () => {
	const { api, calls, of } = fakeApi();
	let hits = 0;
	let denied = 0;
	const lockedDef = {
		main: () => ({
			text: "menu",
			keyboard: [[button("hit", { id: "hit", onClick: () => hits++ })]],
		}),
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(
				dialogs(lockedDef, {
					getKey: (ctx) => ctx.chat && String(ctx.chat.id), // shared dialog…
					access: (ctx) => ctx.from?.id === 7, // …but only user 7 may touch it
					events: { onAccessDenied: () => denied++ },
				}),
			)
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", -100, 7, "supergroup"), noop);
	const sent = of("sendMessage")[0];
	calls.length = 0;

	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), -100, 100, 8, "supergroup"), noop);
	assert.equal(hits, 0);
	assert.equal(denied, 1);
	assert.equal(of("answerCallbackQuery").length, 1);

	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), -100, 100, 7, "supergroup"), noop);
	assert.equal(hits, 1);
});

test("onText routes free text into the top window; commands and foreign text fall through", async () => {
	const { api, of } = fakeApi();
	const received: string[] = [];
	let fallthrough = 0;
	const askDef = {
		ask: {
			render: () => ({ text: "your name?" }),
			onText: (ctx: Context & { text: string }) => {
				if (ctx.text === "decline") return false;
				received.push(ctx.text);
			},
		},
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(askDef))
			.command("go", (ctx) => ctx.dialog.start("ask"))
			.on("message:text", () => {
				fallthrough++;
			}),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	await mw(msgCtx(api, "Alice", 1), noop);
	assert.deepEqual(received, ["Alice"]);
	assert.equal(fallthrough, 0);

	await mw(msgCtx(api, "decline", 1), noop); // handler declined → falls through
	assert.equal(fallthrough, 1);

	await mw(msgCtx(api, "/help", 1), noop); // commands are never routed to onText
	assert.equal(fallthrough, 2);
	assert.equal(of("sendMessage").length, 1);
});

test("back(result) hands the result to the parent window's onResult", async () => {
	const { api, of } = fakeApi();
	const results: unknown[] = [];
	const picker = {
		parent: {
			render: () => ({
				text: "parent",
				keyboard: [[switchTo("pick →", "child")]],
			}),
			onResult: (_ctx: Context, result: unknown) => results.push(result),
		},
		child: () => ({
			text: "child",
			keyboard: [[back("today", "2026-07-08")]],
		}),
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(picker))
			.command("go", (ctx) => ctx.dialog.start("parent")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 1, 100), noop); // → child
	const child = of("editMessageText")[0];
	await mw(cbCtx(api, dataAt(child?.params, 0, 0), 1, 100), noop); // back with result

	assert.deepEqual(results, ["2026-07-08"]);
	assert.equal(of("editMessageText")[1]?.params.text, "parent");
});

test("start() while a dialog is open closes the old message first (no zombies)", async () => {
	const { api, calls, of } = fakeApi();
	const mw = entry(
		new Composer<Context>().install(dialogs(def)).command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	calls.length = 0;
	await mw(msgCtx(api, "/go", 1), noop);

	assert.equal(of("deleteMessage").length, 1); // old dialog message removed
	assert.equal(of("sendMessage").length, 1); // fresh one sent
});

test("push beyond maxStack throws a MordaError", async () => {
	const { api } = fakeApi();
	const mw = entry(
		new Composer<Context>().install(dialogs(def, { maxStack: 2 })).command("go", async (ctx) => {
			await ctx.dialog.start("main");
			await ctx.dialog.push("settings");
			await assert.rejects(ctx.dialog.push("settings"), MordaError);
		}),
	);
	await mw(msgCtx(api, "/go", 1), noop);
});

test("params flow to the frame; update()/setData()/getData() manage the data bag", async () => {
	const { api, of } = fakeApi();
	const seen: unknown[] = [];
	const bagDef = {
		main: (_ctx: Context, frame: { params: unknown; data: Record<string, unknown> }) => {
			seen.push(frame.params);
			return { text: `n=${frame.data.n ?? 0}` };
		},
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(bagDef))
			.command("go", (ctx) => ctx.dialog.start("main", { params: { from: "cmd" } }))
			.command("bump", async (ctx) => {
				await ctx.dialog.update({ n: 1 });
				assert.deepEqual(await ctx.dialog.getData(), { n: 1 });
			}),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	assert.deepEqual(seen, [{ from: "cmd" }]);
	await mw(msgCtx(api, "/bump", 1), noop);
	assert.equal(of("editMessageText")[0]?.params.text, "n=1");
});

test("business chat: send/edit are routed through the connection; close uses deleteBusinessMessages", async () => {
	const { api, calls, of } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main"))
			.command("close", (ctx) => ctx.dialog.close()),
	);

	await mw(bizMsgCtx(api, "/go", 6, "bc1"), noop);
	const sent = of("sendMessage")[0];
	assert.equal(sent?.params.business_connection_id, "bc1");

	calls.length = 0;
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 6, 100), noop);
	// the connection id is persisted in state — edits carry it even though the
	// callback update itself lost the marker
	assert.equal(of("editMessageText")[0]?.params.business_connection_id, "bc1");

	calls.length = 0;
	await mw(bizMsgCtx(api, "/close", 6, "bc1"), noop);
	assert.equal(of("deleteMessage").length, 0);
	assert.equal(of("deleteBusinessMessages")[0]?.params.business_connection_id, "bc1");
});

test("media window sends a photo; media↔text transition deletes and resends", async () => {
	const { api, calls, of } = fakeApi();
	const gallery = {
		photo: () => ({
			text: "caption",
			media: { type: "photo" as const, media: "file123" },
			keyboard: [[switchTo("text →", "plain")]],
		}),
		plain: () => ({ text: "just text" }),
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(gallery))
			.command("go", (ctx) => ctx.dialog.start("photo")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendPhoto")[0];
	assert.equal(sent?.params.photo, "file123");
	assert.equal(sent?.params.caption, "caption");

	calls.length = 0;
	await mw(cbCtx(api, dataAt(sent?.params, 0, 0), 1, 100), noop);
	assert.equal(of("editMessageText").length, 0); // can't edit media → text
	assert.equal(of("deleteMessage").length, 1);
	assert.equal(of("sendMessage")[0]?.params.text, "just text");
});

test("format() text flows entities to the wire; url buttons render", async () => {
	const { api, of } = fakeApi();
	const fancy = {
		main: () => ({
			text: format`hello ${bold("world")}`,
			keyboard: [[url("docs", "https://example.com")]],
		}),
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(fancy))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	assert.equal(sent?.params.text, "hello world");
	assert.equal(sent?.params.entities?.[0]?.type, "bold");
	assert.equal(sent?.params.reply_markup.inline_keyboard[0][0].url, "https://example.com");
});

test("render-time validation: duplicate button ids and empty labels fail loud", async () => {
	const { api } = fakeApi();
	const bad = {
		dup: () => ({
			text: "x",
			keyboard: [[button("a", { id: "same" }), button("b", { id: "same" })]],
		}),
		empty: () => ({ text: "x", keyboard: [[button("", { id: "e" })]] }),
	} satisfies DialogDef;
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(bad))
			.command("dup", (ctx) => ctx.dialog.start("dup"))
			.command("empty", (ctx) => ctx.dialog.start("empty")),
	);

	await assert.rejects(Promise.resolve(mw(msgCtx(api, "/dup", 1), noop)), /duplicate button id/);
	await assert.rejects(Promise.resolve(mw(msgCtx(api, "/empty", 1), noop)), /empty label/);
});

test("unknown window names fail with a MordaError listing the known ones", async () => {
	const { api } = fakeApi();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def))
			.command("go", (ctx) => ctx.dialog.start("nope" as never)),
	);
	await assert.rejects(Promise.resolve(mw(msgCtx(api, "/go", 1), noop)), /unknown window "nope"/);
});

test("background() edits the dialog without an incoming update", async () => {
	const { api, calls, of } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	let n = 0;
	const live = {
		main: () => ({ text: `n=${n}` }),
	} satisfies DialogDef;
	const { plugin, background } = createDialogs(live, { storage });
	const mw = entry(
		new Composer<Context>().install(plugin).command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 9), noop);
	assert.equal(of("sendMessage")[0]?.params.text, "n=0");
	calls.length = 0;

	n = 1;
	const control = await background(api, "9");
	assert.ok(control);
	await control.rerender();
	assert.equal(of("editMessageText")[0]?.params.text, "n=1");

	assert.equal(await background(api, "no-such-key"), undefined);
});

test("stale-press protection under concurrent updates (double-tap)", async () => {
	const { api, of } = fakeApi();
	const storage = new MemoryStorage<DialogState>();
	const mw = entry(
		new Composer<Context>()
			.install(dialogs(def, { storage }))
			.command("go", (ctx) => ctx.dialog.start("main")),
	);

	await mw(msgCtx(api, "/go", 1), noop);
	const sent = of("sendMessage")[0];
	const push = dataAt(sent?.params, 0, 0);

	// two concurrent presses of the same "switchTo settings" button: the per-key
	// lock serializes them, so the second one sees settings on top and is stale.
	await Promise.all([mw(cbCtx(api, push, 1, 100), noop), mw(cbCtx(api, push, 1, 100), noop)]);
	assert.deepEqual(
		(await storage.get("dlg:1"))?.stack.map((f) => f.w),
		["main", "settings"],
	);
});
