import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { MemoryPanelStore, type PanelEvent, type PanelStore, panelHandler } from "./index.js";
import { serve } from "./serve.js";

/** wraps a store's `subscribe` to count currently-active listeners, for leak assertions. */
function countingStore(base: PanelStore): { store: PanelStore; activeListeners: () => number } {
	let active = 0;
	const store: PanelStore = {
		record: (chat, message) => base.record(chat, message),
		chats: (options) => base.chats(options),
		history: (chatId, options) => base.history(chatId, options),
		status: (chatId) => base.status(chatId),
		setStatus: (chatId, status) => base.setStatus(chatId, status),
		assign: (chatId, operator) => base.assign(chatId, operator),
		pin: (chatId, pinned) => base.pin(chatId, pinned),
		markRead: (chatId) => base.markRead(chatId),
		updateMessage: (chatId, messageId, patch) => base.updateMessage(chatId, messageId, patch),
		deleteChat: (chatId) => base.deleteChat(chatId),
		subscribe: (listener: (event: PanelEvent) => void) => {
			active++;
			const off = base.subscribe?.(listener) ?? (() => {});
			return () => {
				active--;
				off();
			};
		},
	};
	return { store, activeListeners: () => active };
}

async function closeServer(server: import("node:http").Server): Promise<void> {
	await new Promise<void>((resolve, reject) =>
		server.close((err) => (err ? reject(err) : resolve())),
	);
}

async function waitUntil(check: () => boolean, timeoutMs = 3000): Promise<void> {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error("waitUntil: condition never became true");
		await new Promise((r) => setTimeout(r, 25));
	}
}

test("serve(): /api/stream actually streams over a real socket instead of buffering forever", {
	timeout: 10_000,
}, async () => {
	const base = new MemoryPanelStore();
	const { store, activeListeners } = countingStore(base);
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret" });

	const server = serve(handler, { port: 0 });
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("expected a bound port");
	const port = address.port;

	const res = await fetch(`http://127.0.0.1:${port}/api/stream`, {
		headers: { authorization: "Bearer secret" },
	});
	assert.equal(res.headers.get("content-type")?.split(";")[0], "text/event-stream");

	const reader = res.body?.getReader();
	assert.ok(reader);

	const first = await reader.read();
	assert.ok(first.value);
	assert.match(new TextDecoder().decode(first.value), /connected/);

	await waitUntil(() => activeListeners() === 1);

	base.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });

	const { value } = await reader.read();
	assert.ok(value);
	assert.match(new TextDecoder().decode(value), /event: record/);

	// the client disconnecting must unsubscribe server-side — this used to leak forever
	await reader.cancel();
	await waitUntil(() => activeListeners() === 0);

	await closeServer(server);
});
