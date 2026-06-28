import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { MemoryPanelStore, panelHandler, recorder } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

test("MemoryPanelStore records, preserves names, sorts and reads history", () => {
	const s = new MemoryPanelStore();

	s.record({ id: 1, name: "@a" }, { direction: "in", text: "hi", date: 10 });
	s.record({ id: 1 }, { direction: "out", text: "yo", date: 20 }); // no name → keep "@a"
	s.record({ id: 2, name: "@b" }, { direction: "in", text: "hey", date: 30 });

	assert.equal(s.chats()[0]?.id, 2); // most recent first
	assert.equal(s.chats().find((c) => c.id === 1)?.name, "@a");
	assert.equal(s.history(1).length, 2);
	assert.deepEqual(s.history(2), [{ direction: "in", text: "hey", date: 30 }]);
});

test("recorder logs incoming private text into the store", async () => {
	const store = new MemoryPanelStore();

	const api = {} as never;
	const mw = entry(new Composer<Context>().install(recorder(store)));

	const ctx = new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: 5, type: "private" },
				from: { id: 5, is_bot: false, first_name: "Sam", username: "sam" },
				text: "hello",
			},
		} as never,
		updateType: "message",
	});

	await mw(ctx, noop);

	const hist = store.history(5);

	assert.equal(hist.length, 1);
	assert.equal(hist[0]?.text, "hello");
	assert.equal(hist[0]?.direction, "in");
	assert.equal(store.chats()[0]?.name, "@sam");
});

function fakePanel() {
	const sent: Array<Record<string, unknown>> = [];
	const api = {
		sendMessage: (p: Record<string, unknown>) => {
			sent.push(p);
			return Promise.resolve({ message_id: 1 });
		},
	};

	const store = new MemoryPanelStore();
	store.record({ id: 1, name: "@sam" }, { direction: "in", text: "hi", date: 1 });

	return { handler: panelHandler(api, store, { token: "secret" }), sent, store };
}

test("panelHandler refuses to construct with an empty token", () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };

	assert.throws(() => panelHandler(api, store, { token: "" }), /non-empty token/);
});

test("panel API rejects requests without the token", async () => {
	const { handler } = fakePanel();
	const res = await handler(new Request("http://x/api/chats"));

	assert.equal(res.status, 401);
});

test("panel API lists chats and serves the UI with a token", async () => {
	const { handler } = fakePanel();

	const chatsRes = await handler(
		new Request("http://x/api/chats", { headers: { authorization: "Bearer secret" } }),
	);
	assert.equal(chatsRes.status, 200);

	const chats = (await chatsRes.json()) as Array<{ name: string }>;
	assert.equal(chats[0]?.name, "@sam");

	const ui = await handler(new Request("http://x/?token=secret"));
	assert.equal(ui.headers.get("content-type"), "text/html; charset=utf-8");
	assert.match(await ui.text(), /yaebal panel/);
});

test("panel send posts via the api and logs an outgoing message", async () => {
	const { handler, sent, store } = fakePanel();

	const res = await handler(
		new Request("http://x/api/chats/1/send?token=secret", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: "yo" }),
		}),
	);
	assert.equal(res.status, 200);
	assert.deepEqual(sent, [{ chat_id: 1, text: "yo" }]);
	
	const last = store.history(1).at(-1);
	assert.equal(last?.direction, "out");
	assert.equal(last?.text, "yo");
});
