import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { MemoryPanelStore, panelHandler, recordOutgoing, recordTelegramUpdate, recorder } from "./index.js";
import { PANEL_HTML } from "./panel-html.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

test("PANEL_HTML inline script parses", () => {
	const script = PANEL_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
	assert.ok(script);
	assert.doesNotThrow(() => new Function(script));
});

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
	assert.equal(store.chats()[0]?.firstName, "Sam");
	assert.equal(store.chats()[0]?.username, "sam");
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

test("recorder records a media placeholder when a private message carries no text", async () => {
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
				chat: { id: 7, type: "private" },
				from: { id: 7, is_bot: false, first_name: "Pat" },
				photo: [{ file_id: "x", file_unique_id: "x", width: 1, height: 1 }],
			},
		} as never,
		updateType: "message",
	});

	await mw(ctx, noop);

	assert.equal(store.history(7)[0]?.text, "[photo]");
});

test("recorder captures a caption as the message text", async () => {
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
				chat: { id: 8, type: "private" },
				from: { id: 8, is_bot: false, first_name: "Lee" },
				document: { file_id: "d", file_unique_id: "d" },
				caption: "the report",
			},
		} as never,
		updateType: "message",
	});

	await mw(ctx, noop);

	assert.equal(store.history(8)[0]?.text, "the report");
});

test("recordTelegramUpdate records framework-agnostic callback events", async () => {
	const store = new MemoryPanelStore();

	await recordTelegramUpdate(store, {
		update_id: 1,
		callback_query: {
			id: "cb1",
			from: { id: 7, is_bot: false, first_name: "Pat", last_name: "Lee", username: "pat" },
			message: { message_id: 2, chat: { id: 7, type: "private" } },
			data: "demo:open",
		},
	});

	const chat = store.chats()[0];
	const msg = store.history(7)[0];

	assert.equal(chat?.firstName, "Pat");
	assert.equal(chat?.lastName, "Lee");
	assert.equal(chat?.lastEventType, "callback");
	assert.equal(msg?.event?.type, "callback");
	assert.equal(msg?.event?.data, "demo:open");
});

test("recorder captures inline keyboards for timeline previews", async () => {
	const store = new MemoryPanelStore();

	await recordTelegramUpdate(store, {
		update_id: 1,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 9, type: "private" },
			from: { id: 9, is_bot: false, first_name: "Key" },
			text: "choose",
			reply_markup: {
				inline_keyboard: [[{ text: "Open", callback_data: "open" }, { text: "Docs", url: "https://yaeb.al" }]],
			},
		},
	});

	assert.deepEqual(store.history(9)[0]?.keyboard, {
		type: "inline",
		rows: [[
			{ text: "Open", kind: "callback", callbackData: "open" },
			{ text: "Docs", kind: "url", url: "https://yaeb.al" },
		]],
	});
});

test("panel send rejects an empty/missing text with 400", async () => {
	const { handler, sent } = fakePanel();

	const res = await handler(
		new Request("http://x/api/chats/1/send?token=secret", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		}),
	);

	assert.equal(res.status, 400);
	assert.deepEqual(sent, []);
});

test("panel send forwards whitelisted extras (parse_mode) to sendMessage", async () => {
	const { handler, sent } = fakePanel();

	await handler(
		new Request("http://x/api/chats/1/send?token=secret", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: "*hi*", parse_mode: "MarkdownV2", bogus: 1 }),
		}),
	);

	assert.deepEqual(sent, [{ chat_id: 1, text: "*hi*", parse_mode: "MarkdownV2" }]);
});

test("panel send forwards and self-records reply_markup previews", async () => {
	const { handler, sent, store } = fakePanel();
	const replyMarkup = { inline_keyboard: [[{ text: "Open", callback_data: "open" }]] };

	await handler(
		new Request("http://x/api/chats/1/send?token=secret", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: "choose", reply_markup: replyMarkup }),
		}),
	);

	assert.deepEqual(sent.at(-1), { chat_id: 1, text: "choose", reply_markup: replyMarkup });
	assert.deepEqual(store.history(1).at(-1)?.keyboard, {
		type: "inline",
		rows: [[{ text: "Open", kind: "callback", callbackData: "open" }]],
	});
});

test("panel API returns 404 for an unknown path", async () => {
	const { handler } = fakePanel();

	const res = await handler(
		new Request("http://x/api/nope", { headers: { authorization: "Bearer secret" } }),
	);

	assert.equal(res.status, 404);
});

test("CORS: preflight is answered unauthenticated and echoes an allowed origin", async () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret", cors: "https://ops.example" });

	const res = await handler(
		new Request("http://x/api/chats", {
			method: "OPTIONS",
			headers: { origin: "https://ops.example" },
		}),
	);

	assert.equal(res.status, 204);
	assert.equal(res.headers.get("access-control-allow-origin"), "https://ops.example");
});

test("CORS: a disallowed origin gets no allow-origin header", async () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret", cors: "https://ops.example" });

	const res = await handler(
		new Request("http://x/api/chats?token=secret", {
			headers: { origin: "https://evil.example" },
		}),
	);

	assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("history pagination: limit returns the most recent N, before pages older", () => {
	const s = new MemoryPanelStore();
	for (let i = 1; i <= 5; i++) {
		s.record({ id: 1, name: "@u" }, { direction: "in", text: `m${i}`, date: i });
	}

	const recent = s.history(1, { limit: 2 });
	assert.deepEqual(
		recent.map((m) => m.text),
		["m4", "m5"],
	);

	const older = s.history(1, { before: 4, limit: 2 });
	assert.deepEqual(
		older.map((m) => m.text),
		["m2", "m3"],
	);
});

test("MemoryPanelStore.subscribe emits a record event and unsubscribes", () => {
	const s = new MemoryPanelStore();
	const seen: string[] = [];
	const off = s.subscribe((e) => seen.push(`${e.type}:${e.chatId}:${e.direction}`));

	s.record({ id: 9, name: "@u" }, { direction: "in", text: "hi", date: 1 });
	off();
	s.record({ id: 9, name: "@u" }, { direction: "in", text: "bye", date: 2 });

	assert.deepEqual(seen, ["record:9:in"]);
});

test("panel serves the login page at the root WITHOUT a token", async () => {
	const { handler } = fakePanel();

	const res = await handler(new Request("http://x/"));

	assert.equal(res.status, 200);
	assert.match(res.headers.get("content-type") ?? "", /text\/html/);
	const html = await res.text();
	assert.match(html, /authorize/);
	assert.doesNotMatch(html, /__BASE__/); // placeholder was substituted
});

test("basePath: routes are matched under the prefix and the UI base is injected", async () => {
	const store = new MemoryPanelStore();
	store.record({ id: 1, name: "@sam" }, { direction: "in", text: "hi", date: 1 });
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret", basePath: "/panel" });

	const off = await handler(new Request("http://x/api/chats?token=secret"));
	assert.equal(off.status, 404); // not under the prefix

	const page = await handler(new Request("http://x/panel"));
	assert.equal(page.status, 200);
	assert.match(await page.text(), /BASE = "\/panel"/);

	const chats = await handler(new Request("http://x/panel/api/chats?token=secret"));
	assert.equal(chats.status, 200);
	assert.equal(((await chats.json()) as unknown[]).length, 1);
});

test("rate limit: repeated bad tokens get 429 with Retry-After", async () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, {
		token: "secret",
		rateLimit: { max: 3, windowMs: 60_000 },
	});
	const bad = () =>
		handler(new Request("http://x/api/chats", { headers: { authorization: "Bearer nope" } }));

	for (let i = 0; i < 3; i++) assert.equal((await bad()).status, 401);

	const blocked = await bad();
	assert.equal(blocked.status, 429);
	assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("SSE stream advertises text/event-stream and forwards a record event", async () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret" });

	const res = await handler(new Request("http://x/api/stream?token=secret"));
	assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

	const reader = res.body!.getReader();
	await reader.read(); // ": connected"
	store.record({ id: 1, name: "@u" }, { direction: "in", text: "ping", date: 1 });
	const { value } = await reader.read();
	assert.match(new TextDecoder().decode(value), /event: record/);
	await reader.cancel();
});

test("recordOutgoing logs bot replies sent outside the panel (private only)", () => {
	const store = new MemoryPanelStore();
	// minimal api fake exposing the `after` hook contract
	let hook: ((m: string, r: unknown) => unknown) | undefined;
	const api = { after: (h: (m: string, r: unknown) => unknown) => (hook = h) };

	recordOutgoing(api, store);

	// a reply to a private chat → recorded as "out"
	hook?.("sendMessage", { chat: { id: 5, type: "private" }, text: "hey", date: 100 });
	// a group reply → ignored
	hook?.("sendMessage", { chat: { id: -10, type: "group" }, text: "nope", date: 101 });
	// a non-send method → ignored
	hook?.("deleteMessage", { chat: { id: 5, type: "private" } });

	const hist = store.history(5);
	assert.equal(hist.length, 1);
	assert.equal(hist[0]?.direction, "out");
	assert.equal(hist[0]?.text, "hey");
	assert.equal(store.history(-10).length, 0);
});

test("panel send does NOT self-record when recordSends is false", async () => {
	const store = new MemoryPanelStore();
	const sent: Array<Record<string, unknown>> = [];
	const api = {
		sendMessage: (p: Record<string, unknown>) => {
			sent.push(p);
			return Promise.resolve({ message_id: 1 });
		},
	};
	const handler = panelHandler(api, store, { token: "secret", recordSends: false });

	await handler(
		new Request("http://x/api/chats/7/send?token=secret", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ text: "hi" }),
		}),
	);

	assert.deepEqual(sent, [{ chat_id: 7, text: "hi" }]); // still sent
	assert.equal(store.history(7).length, 0); // but not recorded by the panel
});

test("recorder extracts a photo attachment + caption from an incoming message", async () => {
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
				chat: { id: 7, type: "private" },
				from: { id: 7, is_bot: false, first_name: "Pat" },
				photo: [
					{ file_id: "small", file_unique_id: "s", width: 90, height: 90 },
					{ file_id: "big", file_unique_id: "b", width: 1280, height: 1280 },
				],
				media_group_id: "AG123",
				caption: "look!",
			},
		} as never,
		updateType: "message",
	});

	await mw(ctx, noop);

	const m = store.history(7)[0];
	assert.equal(m?.text, "look!");
	assert.deepEqual(m?.attachments, [{ type: "photo", fileId: "big" }]); // largest size
	assert.equal(m?.mediaGroupId, "AG123");
});

test("recorder extracts a document with name + mime", async () => {
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
				chat: { id: 8, type: "private" },
				from: { id: 8, is_bot: false, first_name: "Lee" },
				document: { file_id: "doc1", file_unique_id: "d", file_name: "report.pdf", mime_type: "application/pdf" },
			},
		} as never,
		updateType: "message",
	});

	await mw(ctx, noop);

	const m = store.history(8)[0];
	assert.equal(m?.text, "[document]"); // placeholder preview, no caption
	assert.deepEqual(m?.attachments, [
		{ type: "document", fileId: "doc1", fileName: "report.pdf", mimeType: "application/pdf" },
	]);
});

test("GET /api/file proxies telegram bytes via getFile + fileUrl", async () => {
	const store = new MemoryPanelStore();
	const calls: string[] = [];
	const api = {
		sendMessage: () => Promise.resolve({}),
		call: <T>(method: string, params?: Record<string, unknown>) => {
			calls.push(`${method}:${params?.file_id}`);
			return Promise.resolve({ file_path: "photos/x.jpg" } as T);
		},
		fileUrl: (p: string) => `https://files.test/${p}`,
	};

	// stub fetch for the upstream download
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (u: string) => {
		assert.equal(u, "https://files.test/photos/x.jpg");
		return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
	}) as typeof fetch;

	try {
		const handler = panelHandler(api, store, { token: "secret" });
		const res = await handler(new Request("http://x/api/file?id=ABC&token=secret"));

		assert.equal(res.status, 200);
		assert.equal(res.headers.get("content-type"), "image/jpeg");
		assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3]);
		assert.deepEqual(calls, ["getFile:ABC"]);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test("GET /api/file returns 501 when the api can't proxy", async () => {
	const { handler } = fakePanel(); // fake api has no call/fileUrl
	const res = await handler(new Request("http://x/api/file?id=ABC&token=secret"));
	assert.equal(res.status, 501);
});

test("multipart send uploads a file via the inferred send method", async () => {
	const store = new MemoryPanelStore();
	const calls: Array<{ method: string; params: Record<string, unknown> }> = [];

	const api = {
		sendMessage: () => Promise.resolve({}),
		call: <T>(method: string, params?: Record<string, unknown>) => {
			calls.push({ method, params: params ?? {} });
			return Promise.resolve({
				chat: { id: 1, type: "private" },
				date: 5,
				photo: [{ file_id: "up1" }],
			} as T);
		},
	};
	const handler = panelHandler(api, store, { token: "secret" });

	const fd = new FormData();
	fd.append("file", new Blob([new Uint8Array([9, 9])], { type: "image/png" }), "pic.png");
	fd.append("caption", "hi");

	const res = await handler(
		new Request("http://x/api/chats/1/send?token=secret", { method: "POST", body: fd }),
	);

	assert.equal(res.status, 200);
	assert.equal(calls[0]?.method, "sendPhoto"); // inferred from image/png
	assert.equal(calls[0]?.params.caption, "hi");

	// recorded as an outgoing photo
	const m = store.history(1).at(-1);
	assert.equal(m?.direction, "out");
	assert.deepEqual(m?.attachments, [{ type: "photo", fileId: "up1" }]);
});

test("recordOutgoing captures a sendMediaGroup array result", () => {
	const store = new MemoryPanelStore();
	let hook: ((m: string, r: unknown) => unknown) | undefined;

	const api = { after: (h: (m: string, r: unknown) => unknown) => (hook = h) };
	recordOutgoing(api, store);

	hook?.("sendMediaGroup", [
		{ chat: { id: 3, type: "private" }, date: 1, media_group_id: "G", photo: [{ file_id: "a" }] },
		{ chat: { id: 3, type: "private" }, date: 1, media_group_id: "G", photo: [{ file_id: "b" }] },
	]);

	const hist = store.history(3);
	assert.equal(hist.length, 2);
	assert.equal(hist[0]?.mediaGroupId, "G");
	assert.deepEqual(hist[1]?.attachments, [{ type: "photo", fileId: "b" }]);
});
