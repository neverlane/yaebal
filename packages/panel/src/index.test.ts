import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import {
	handoff,
	MemoryPanelStore,
	type PanelStore,
	panelHandler,
	recorder,
	recordOutgoing,
	recordTelegramUpdate,
} from "./index.js";
import { PANEL_HTML } from "./panel-html.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

function cookieFrom(res: Response): string {
	const raw = res.headers.get("set-cookie") ?? "";
	return raw.split(";")[0] ?? "";
}

test("PANEL_HTML inline script parses", () => {
	const script = PANEL_HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];
	assert.ok(script);
	assert.doesNotThrow(() => new Function(script));
});

test("MemoryPanelStore records, preserves names, sorts, reads history and tracks unread", () => {
	const s = new MemoryPanelStore();

	s.record({ id: 1, name: "@a" }, { direction: "in", text: "hi", date: 10 });
	s.record({ id: 1 }, { direction: "out", text: "yo", date: 20 }); // no name → keep "@a"
	s.record({ id: 2, name: "@b" }, { direction: "in", text: "hey", date: 30 });

	assert.equal(s.chats()[0]?.id, 2); // most recent first
	assert.equal(s.chats().find((c) => c.id === 1)?.name, "@a");
	assert.equal(s.chats().find((c) => c.id === 1)?.unread, 1); // only "in" bumps unread
	assert.equal(s.history(1).length, 2);

	const chat2 = s.history(2)[0];
	assert.equal(chat2?.text, "hey");
	assert.equal(chat2?.direction, "in");
	assert.equal(typeof chat2?.seq, "number");
});

test("MemoryPanelStore.history returns copies — callers can't corrupt the store", () => {
	const s = new MemoryPanelStore();
	s.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });

	const first = s.history(1);
	first.push({ direction: "in", text: "injected", date: 999 });
	first[0]!.text = "mutated";

	assert.equal(s.history(1).length, 1);
	assert.equal(s.history(1)[0]?.text, "hi");
});

test("MemoryPanelStore pagination: composite (date, seq) cursor doesn't drop same-second messages", () => {
	const s = new MemoryPanelStore();
	for (let i = 1; i <= 5; i++) {
		s.record({ id: 1, name: "@u" }, { direction: "in", text: `m${i}`, date: 100 }); // same date!
	}

	const page1 = s.history(1, { limit: 2 });
	assert.deepEqual(
		page1.map((m) => m.text),
		["m4", "m5"],
	);

	const oldestSeq = page1[0]?.seq;
	assert.ok(oldestSeq !== undefined);

	// naive `date < before` would drop everything here since all 5 share the same date
	const page2 = s.history(1, { before: 100, beforeSeq: oldestSeq, limit: 2 });
	assert.deepEqual(
		page2.map((m) => m.text),
		["m2", "m3"],
	);
});

test("MemoryPanelStore: setStatus/assign/pin/markRead/updateMessage/deleteChat/search", () => {
	const s = new MemoryPanelStore();
	s.record({ id: 1, name: "@a" }, { direction: "in", text: "hello world", date: 1, id: 501 });

	assert.equal(s.status(1), "open");
	s.setStatus(1, "handled");
	assert.equal(s.status(1), "handled");

	s.assign(1, "alice");
	assert.equal(s.chats()[0]?.assignedTo, "alice");
	s.assign(1, null);
	assert.equal(s.chats()[0]?.assignedTo, undefined);

	s.pin(1, true);
	assert.equal(s.chats()[0]?.pinned, true);

	assert.equal(s.chats()[0]?.unread, 1);
	s.markRead(1);
	assert.equal(s.chats()[0]?.unread, 0);

	s.updateMessage(1, 501, { text: "edited text", edited: true });
	assert.equal(s.history(1)[0]?.text, "edited text");
	assert.equal(s.history(1)[0]?.edited, true);

	assert.deepEqual(
		s.search("edited")?.map((r) => r.message.text),
		["edited text"],
	);
	assert.deepEqual(s.search("nope"), []);

	s.deleteChat(1);
	assert.equal(s.chats().length, 0);
	assert.equal(s.history(1).length, 0);
});

test("MemoryPanelStore.markRead only emits on a real transition (regression: SSE feedback loop)", () => {
	// a client that reacts to a "read" event by refetching the chat — which itself calls
	// markRead — would loop forever with the server if markRead re-emitted every time,
	// even when the chat was already read. this is exactly what caused a request storm.
	const s = new MemoryPanelStore();
	s.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });

	const seen: string[] = [];
	s.subscribe((e) => seen.push(e.type));

	s.markRead(1); // unread 1 -> 0: a real transition, must emit once
	s.markRead(1); // already 0: must stay silent
	s.markRead(1);

	assert.deepEqual(seen, ["read"]);
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
	assert.equal(hist[0]?.id, 1);
	assert.equal(store.chats()[0]?.name, "@sam");
	assert.equal(store.chats()[0]?.firstName, "Sam");
	assert.equal(store.chats()[0]?.username, "sam");
});

test("recorder({ chats: 'all' }) records group chats too; default scope stays private-only", async () => {
	const groupUpdate = {
		update_id: 1,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: -100, type: "group" },
			from: { id: 5, is_bot: false, first_name: "Sam" },
			text: "hi group",
		},
	};

	const privateOnly = new MemoryPanelStore();
	await recordTelegramUpdate(privateOnly, groupUpdate);
	assert.equal(privateOnly.history(-100).length, 0);

	const all = new MemoryPanelStore();
	await recordTelegramUpdate(all, groupUpdate, { chats: "all" });
	assert.equal(all.history(-100).length, 1);

	const predicate = new MemoryPanelStore();
	await recordTelegramUpdate(predicate, groupUpdate, { chats: (chat) => chat.type === "group" });
	assert.equal(predicate.history(-100).length, 1);
});

test("recordTelegramUpdate patches an edited_message instead of duplicating it", async () => {
	const store = new MemoryPanelStore();
	await recordTelegramUpdate(store, {
		update_id: 1,
		message: {
			message_id: 42,
			date: 0,
			chat: { id: 5, type: "private" },
			from: { id: 5, is_bot: false, first_name: "Sam" },
			text: "origin",
		},
	});
	await recordTelegramUpdate(store, {
		update_id: 2,
		edited_message: {
			message_id: 42,
			date: 1,
			chat: { id: 5, type: "private" },
			from: { id: 5, is_bot: false, first_name: "Sam" },
			text: "fixed typo",
		},
	});

	const hist = store.history(5);
	assert.equal(hist.length, 1); // patched, not appended
	assert.equal(hist[0]?.text, "fixed typo");
	assert.equal(hist[0]?.edited, true);
});

function fakePanel(overrides: Partial<Parameters<typeof panelHandler>[2]> = {}) {
	const sent: Array<Record<string, unknown>> = [];
	const calls: Array<{ method: string; params: Record<string, unknown> | undefined }> = [];
	const api = {
		sendMessage: (p: Record<string, unknown>) => {
			sent.push(p);
			return Promise.resolve({ message_id: 1 });
		},
		call: <T>(method: string, params?: Record<string, unknown>) => {
			calls.push({ method, params });
			return Promise.resolve({} as T);
		},
	};

	const store = new MemoryPanelStore();
	store.record({ id: 1, name: "@sam" }, { direction: "in", text: "hi", date: 1, id: 100 });

	return {
		handler: panelHandler(api, store, { token: "secret", ...overrides }),
		sent,
		calls,
		store,
		api,
	};
}

test("panelHandler refuses to construct without token/operators", () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };

	assert.throws(() => panelHandler(api, store, {}), /provide a non-empty/);
});

test("panel API rejects requests without any credential", async () => {
	const { handler } = fakePanel();
	const res = await handler(new Request("http://x/api/chats"));

	assert.equal(res.status, 401);
});

test("login sets a session cookie; subsequent requests authenticate via cookie alone", async () => {
	const { handler } = fakePanel();

	const login = await handler(
		new Request("http://x/api/login", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token: "secret" }),
		}),
	);
	assert.equal(login.status, 200);
	assert.equal(((await login.json()) as { operator: string }).operator, "operator");
	const cookie = cookieFrom(login);
	assert.match(cookie, /^panel_session=/);

	const chats = await handler(new Request("http://x/api/chats", { headers: { cookie } }));
	assert.equal(chats.status, 200);

	const session = await handler(new Request("http://x/api/session", { headers: { cookie } }));
	assert.equal(session.status, 200);
	assert.equal(((await session.json()) as { operator: string }).operator, "operator");
});

test("logout clears the session", async () => {
	const { handler } = fakePanel();

	const login = await handler(
		new Request("http://x/api/login", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token: "secret" }),
		}),
	);
	const cookie = cookieFrom(login);

	await handler(new Request("http://x/api/logout", { method: "POST", headers: { cookie } }));
	const after = await handler(new Request("http://x/api/session", { headers: { cookie } }));
	assert.equal(after.status, 401);
});

test("a missing credential never trips the rate limiter, but a wrong bearer token does", async () => {
	const { handler } = fakePanel({ rateLimit: { max: 2, windowMs: 60_000 } });

	// no Authorization header at all, repeated — must never lock out a legit login attempt
	for (let i = 0; i < 5; i++) {
		const res = await handler(new Request("http://x/api/chats"));
		assert.equal(res.status, 401);
	}
	const stillOpen = await handler(
		new Request("http://x/api/chats", { headers: { authorization: "Bearer secret" } }),
	);
	assert.equal(stillOpen.status, 200);
});

test("rate limit: repeated wrong bearer tokens get 429 with Retry-After", async () => {
	const { handler } = fakePanel({ rateLimit: { max: 3, windowMs: 60_000 } });
	const bad = () =>
		handler(new Request("http://x/api/chats", { headers: { authorization: "Bearer nope" } }));

	for (let i = 0; i < 3; i++) assert.equal((await bad()).status, 401);

	const blocked = await bad();
	assert.equal(blocked.status, 429);
	assert.ok(Number(blocked.headers.get("retry-after")) > 0);
});

test("multi-operator: sends are stamped with the sending operator's name (audit trail)", async () => {
	const { handler, sent, store } = fakePanel({
		token: undefined,
		operators: [
			{ name: "alice", token: "a-token" },
			{ name: "bob", token: "b-token" },
		],
	});

	await handler(
		new Request("http://x/api/chats/1/send", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer a-token" },
			body: JSON.stringify({ text: "hi from alice" }),
		}),
	);
	assert.deepEqual(sent, [{ chat_id: 1, text: "hi from alice" }]);
	assert.equal(store.history(1).at(-1)?.operator, "alice");
});

test("panel send posts via the api and logs an outgoing message", async () => {
	const { handler, sent, store } = fakePanel();

	const res = await handler(
		new Request("http://x/api/chats/1/send", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
			body: JSON.stringify({ text: "yo" }),
		}),
	);
	assert.equal(res.status, 200);
	assert.deepEqual(sent, [{ chat_id: 1, text: "yo" }]);

	const last = store.history(1).at(-1);
	assert.equal(last?.direction, "out");
	assert.equal(last?.text, "yo");
	assert.equal(last?.operator, "operator");
});

test("panel send rejects an empty/missing text with 400", async () => {
	const { handler, sent } = fakePanel();

	const res = await handler(
		new Request("http://x/api/chats/1/send", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
			body: JSON.stringify({}),
		}),
	);

	assert.equal(res.status, 400);
	assert.deepEqual(sent, []);
});

test("panel send passes replyToId through as reply_parameters", async () => {
	const { handler, sent } = fakePanel();

	await handler(
		new Request("http://x/api/chats/1/send", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
			body: JSON.stringify({ text: "sure", replyToId: 100 }),
		}),
	);

	assert.deepEqual(sent.at(-1), {
		chat_id: 1,
		text: "sure",
		reply_parameters: { message_id: 100 },
	});
});

test("panel send forwards whitelisted extras (parse_mode) to sendMessage", async () => {
	const { handler, sent } = fakePanel();

	await handler(
		new Request("http://x/api/chats/1/send", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
			body: JSON.stringify({ text: "*hi*", parse_mode: "MarkdownV2", bogus: 1 }),
		}),
	);

	assert.deepEqual(sent, [{ chat_id: 1, text: "*hi*", parse_mode: "MarkdownV2" }]);
});

test("edit route calls editMessageText and patches the store", async () => {
	const { handler, calls, store } = fakePanel();

	const res = await handler(
		new Request("http://x/api/chats/1/messages/100/edit", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
			body: JSON.stringify({ text: "corrected" }),
		}),
	);

	assert.equal(res.status, 200);
	assert.deepEqual(calls[0], {
		method: "editMessageText",
		params: { chat_id: 1, message_id: 100, text: "corrected" },
	});
	assert.equal(store.history(1)[0]?.text, "corrected");
	assert.equal(store.history(1)[0]?.edited, true);
});

test("delete route calls deleteMessage and soft-deletes in the store", async () => {
	const { handler, calls, store } = fakePanel();

	const res = await handler(
		new Request("http://x/api/chats/1/messages/100/delete", {
			method: "POST",
			headers: { authorization: "Bearer secret" },
		}),
	);

	assert.equal(res.status, 200);
	assert.deepEqual(calls[0], { method: "deleteMessage", params: { chat_id: 1, message_id: 100 } });
	assert.equal(store.history(1)[0]?.deleted, true);
});

test("edit/delete answer 501 when the api has no call()", async () => {
	const store = new MemoryPanelStore();
	store.record({ id: 1 }, { direction: "out", text: "hi", date: 1, id: 100 });
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret" });

	const edit = await handler(
		new Request("http://x/api/chats/1/messages/100/edit", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
			body: JSON.stringify({ text: "x" }),
		}),
	);
	assert.equal(edit.status, 501);
});

test("status/assign/pin routes mutate the store", async () => {
	const { handler, store } = fakePanel();
	const auth = { authorization: "Bearer secret" };

	await handler(
		new Request("http://x/api/chats/1/status", {
			method: "POST",
			headers: { "content-type": "application/json", ...auth },
			body: JSON.stringify({ status: "handled" }),
		}),
	);
	assert.equal(store.status(1), "handled");

	await handler(
		new Request("http://x/api/chats/1/assign", {
			method: "POST",
			headers: { "content-type": "application/json", ...auth },
			body: JSON.stringify({ operator: "alice" }),
		}),
	);
	assert.equal(store.chats()[0]?.assignedTo, "alice");

	await handler(
		new Request("http://x/api/chats/1/pin", {
			method: "POST",
			headers: { "content-type": "application/json", ...auth },
			body: JSON.stringify({ pinned: true }),
		}),
	);
	assert.equal(store.chats()[0]?.pinned, true);
});

test("an invalid status value is rejected with 400", async () => {
	const { handler } = fakePanel();
	const res = await handler(
		new Request("http://x/api/chats/1/status", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
			body: JSON.stringify({ status: "nonsense" }),
		}),
	);
	assert.equal(res.status, 400);
});

test("GET history marks the chat read", async () => {
	const { handler, store } = fakePanel();
	assert.equal(store.chats()[0]?.unread, 1);

	await handler(
		new Request("http://x/api/chats/1", { headers: { authorization: "Bearer secret" } }),
	);
	assert.equal(store.chats()[0]?.unread, 0);
});

test("search route: 200 with results, 501 when the store doesn't implement search", async () => {
	const { handler } = fakePanel();
	const res = await handler(
		new Request("http://x/api/search?q=hi", { headers: { authorization: "Bearer secret" } }),
	);
	assert.equal(res.status, 200);
	const results = (await res.json()) as Array<{ chatId: number }>;
	assert.equal(results[0]?.chatId, 1);

	const bareStore: PanelStore = {
		record: () => {},
		chats: () => [],
		history: () => [],
		status: () => undefined,
		setStatus: () => {},
		assign: () => {},
		pin: () => {},
		markRead: () => {},
		updateMessage: () => {},
		deleteChat: () => {},
	};
	const handler2 = panelHandler({ sendMessage: () => Promise.resolve({}) }, bareStore, {
		token: "secret",
	});
	const res2 = await handler2(
		new Request("http://x/api/search?q=hi", { headers: { authorization: "Bearer secret" } }),
	);
	assert.equal(res2.status, 501);
});

test("export route returns json and text dumps", async () => {
	const { handler } = fakePanel();

	const asJson = await handler(
		new Request("http://x/api/chats/1/export", { headers: { authorization: "Bearer secret" } }),
	);
	assert.match(asJson.headers.get("content-type") ?? "", /application\/json/);
	const dumped = (await asJson.json()) as Array<{ text: string }>;
	assert.equal(dumped[0]?.text, "hi");

	const asText = await handler(
		new Request("http://x/api/chats/1/export?format=text", {
			headers: { authorization: "Bearer secret" },
		}),
	);
	assert.match(asText.headers.get("content-type") ?? "", /text\/plain/);
	assert.match(await asText.text(), /in: hi/);
});

test("canned responses route returns the configured list", async () => {
	const { handler } = fakePanel({ cannedResponses: [{ label: "Hi", text: "Hello there!" }] });
	const res = await handler(
		new Request("http://x/api/canned", { headers: { authorization: "Bearer secret" } }),
	);
	assert.deepEqual(await res.json(), [{ label: "Hi", text: "Hello there!" }]);
});

test("typing route is best-effort — 200 with or without api.call", async () => {
	const store = new MemoryPanelStore();
	store.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret" });

	const res = await handler(
		new Request("http://x/api/chats/1/typing", {
			method: "POST",
			headers: { authorization: "Bearer secret" },
		}),
	);
	assert.equal(res.status, 200);
});

test("typing route never waits on telegram — it's fire-and-forget, not awaited (regression)", async () => {
	// a slow (or rate-limited, or network-hung) telegram call must never make this cosmetic,
	// best-effort route feel stuck — it used to `await` the call before responding.
	const store = new MemoryPanelStore();
	store.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });
	let released: (() => void) | undefined;
	const hang = new Promise<void>((resolve) => {
		released = resolve;
	});
	const api = {
		sendMessage: () => Promise.resolve({}),
		call: <T>() => hang.then(() => ({}) as T), // never resolves until the test releases it
	};
	const handler = panelHandler(api, store, { token: "secret" });

	const start = Date.now();
	const res = await handler(
		new Request("http://x/api/chats/1/typing", {
			method: "POST",
			headers: { authorization: "Bearer secret" },
		}),
	);
	assert.equal(res.status, 200);
	assert.ok(Date.now() - start < 100); // resolved immediately, not once the hung call finishes

	released?.(); // let the still-pending call settle so it doesn't leak into the next test
});

test("notifyChatId pings the admin chat when a message arrives with no panel connected", async () => {
	const store = new MemoryPanelStore();
	const sent: Array<Record<string, unknown>> = [];
	const api = {
		sendMessage: (p: Record<string, unknown>) => {
			sent.push(p);
			return Promise.resolve({});
		},
	};
	panelHandler(api, store, { token: "secret", notifyChatId: 999 });

	store.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });
	await new Promise((r) => setImmediate(r)); // notifyIfIdle is fire-and-forget internally

	assert.equal(sent.length, 1);
	assert.equal(sent[0]?.chat_id, 999);

	// an outgoing record (the bot's or an operator's own reply) must never trigger it
	store.record({ id: 1 }, { direction: "out", text: "reply", date: 2 });
	await new Promise((r) => setImmediate(r));
	assert.equal(sent.length, 1);
});

test("notifyChatId stays silent while a panel stream is connected", async () => {
	const store = new MemoryPanelStore();
	const sent: Array<Record<string, unknown>> = [];
	const api = {
		sendMessage: (p: Record<string, unknown>) => {
			sent.push(p);
			return Promise.resolve({});
		},
	};
	const handler = panelHandler(api, store, { token: "secret", notifyChatId: 999 });

	const res = await handler(
		new Request("http://x/api/stream", { headers: { authorization: "Bearer secret" } }),
	);
	const reader = res.body?.getReader();
	await reader?.read(); // ": connected" — the stream's start() has now bumped activeStreams

	store.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });
	await new Promise((r) => setImmediate(r));

	assert.equal(sent.length, 0);
	await reader?.cancel();
});

test("delete-chat route removes the conversation", async () => {
	const { handler, store } = fakePanel();
	const res = await handler(
		new Request("http://x/api/chats/1", {
			method: "DELETE",
			headers: { authorization: "Bearer secret" },
		}),
	);
	assert.equal(res.status, 200);
	assert.equal(store.chats().length, 0);
});

test("invalid before/beforeSeq/limit query params answer 400, not a crash", async () => {
	const { handler } = fakePanel();
	const auth = { authorization: "Bearer secret" };

	const badBefore = await handler(
		new Request("http://x/api/chats/1?before=abc", { headers: auth }),
	);
	assert.equal(badBefore.status, 400);

	const badSeq = await handler(
		new Request("http://x/api/chats/1?before=1&beforeSeq=xyz", { headers: auth }),
	);
	assert.equal(badSeq.status, 400);

	const badLimit = await handler(new Request("http://x/api/chats/1?limit=nan", { headers: auth }));
	assert.equal(badLimit.status, 400);
});

test("multipart upload over maxUploadBytes is rejected with 413", async () => {
	const { handler } = fakePanel({ maxUploadBytes: 4 });

	const fd = new FormData();
	fd.append("file", new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "image/png" }), "pic.png");

	const res = await handler(
		new Request("http://x/api/chats/1/send", {
			method: "POST",
			headers: { authorization: "Bearer secret" },
			body: fd,
		}),
	);
	assert.equal(res.status, 413);
});

test("a rejecting store never crashes the handler — errors are reported, not thrown", async () => {
	const errors: Array<[unknown, string]> = [];
	const store: PanelStore = {
		record: () => Promise.reject(new Error("db down")),
		chats: () => [],
		history: () => [],
		status: () => undefined,
		setStatus: () => {},
		assign: () => {},
		pin: () => {},
		markRead: () => {},
		updateMessage: () => {},
		deleteChat: () => {},
	};
	const api = {
		sendMessage: () => Promise.resolve({ chat: { id: 1, type: "private" }, date: 1, text: "hi" }),
	};
	const handler = panelHandler(api, store, {
		token: "secret",
		onError: (error, context) => errors.push([error, context]),
	});

	const res = await handler(
		new Request("http://x/api/chats/1/send", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
			body: JSON.stringify({ text: "hi" }),
		}),
	);

	assert.equal(res.status, 200); // the send itself still succeeds
	// give the fire-and-forget record().catch() a tick to run
	await new Promise((r) => setImmediate(r));
	assert.equal(errors.length, 1);
	assert.equal(errors[0]?.[1], "record");
});

test("recordOutgoing never throws when the store's record() rejects synchronously", () => {
	const store: PanelStore = {
		record: () => {
			throw new Error("boom");
		},
		chats: () => [],
		history: () => [],
		status: () => undefined,
		setStatus: () => {},
		assign: () => {},
		pin: () => {},
		markRead: () => {},
		updateMessage: () => {},
		deleteChat: () => {},
	};
	// the real `Api.after()` always invokes hooks as `(method, params, result)` — this fake
	// mirrors that arity exactly. an earlier version of this test (and of `recordOutgoing`
	// itself) used a 2-arg `(method, result)` hook, which silently bound its `result` to the
	// real `params` argument instead, masking a bug that broke every api call, not just sends.
	let hook:
		| ((m: string, p: Record<string, unknown> | undefined, r: unknown) => unknown)
		| undefined;
	const api = {
		after: (h: (m: string, p: Record<string, unknown> | undefined, r: unknown) => unknown) =>
			(hook = h),
	};
	const errors: unknown[] = [];

	recordOutgoing(api, store, { onError: (e) => errors.push(e) });

	assert.doesNotThrow(() =>
		hook?.("sendMessage", { text: "hey" }, { chat: { id: 5, type: "private" }, text: "hey" }),
	);
	assert.equal(errors.length, 1);
});

test("recordOutgoing logs bot replies sent outside the panel (private only)", () => {
	const store = new MemoryPanelStore();
	let hook:
		| ((m: string, p: Record<string, unknown> | undefined, r: unknown) => unknown)
		| undefined;
	const api = {
		after: (h: (m: string, p: Record<string, unknown> | undefined, r: unknown) => unknown) =>
			(hook = h),
	};

	recordOutgoing(api, store);

	hook?.("sendMessage", {}, { chat: { id: 5, type: "private" }, text: "hey", date: 100 });
	hook?.("sendMessage", {}, { chat: { id: -10, type: "group" }, text: "nope", date: 101 });
	hook?.("deleteMessage", {}, { chat: { id: 5, type: "private" } });
	// regression test for the exact bug this arity fix closes: a non-"send" call (e.g. the
	// bot's own getUpdates poll) must pass its real result through untouched — a hook that
	// mis-declared its params as `(method, result)` would instead return `params` here,
	// replacing every non-send api result across the whole bot with its request params.
	const updates = [{ update_id: 1 }];
	assert.equal(hook?.("getUpdates", { offset: 1, timeout: 30 }, updates), updates);

	const hist = store.history(5);
	assert.equal(hist.length, 1);
	assert.equal(hist[0]?.direction, "out");
	assert.equal(hist[0]?.text, "hey");
	assert.equal(store.history(-10).length, 0);
});

test("recordOutgoing captures a sendMediaGroup array result", () => {
	const store = new MemoryPanelStore();
	let hook:
		| ((m: string, p: Record<string, unknown> | undefined, r: unknown) => unknown)
		| undefined;

	const api = {
		after: (h: (m: string, p: Record<string, unknown> | undefined, r: unknown) => unknown) =>
			(hook = h),
	};
	recordOutgoing(api, store);

	hook?.("sendMediaGroup", {}, [
		{ chat: { id: 3, type: "private" }, date: 1, media_group_id: "G", photo: [{ file_id: "a" }] },
		{ chat: { id: 3, type: "private" }, date: 1, media_group_id: "G", photo: [{ file_id: "b" }] },
	]);

	const hist = store.history(3);
	assert.equal(hist.length, 2);
	assert.equal(hist[0]?.mediaGroupId, "G");
	assert.deepEqual(hist[1]?.attachments, [{ type: "photo", fileId: "b" }]);
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
		new Request("http://x/api/chats", {
			headers: { origin: "https://evil.example", authorization: "Bearer secret" },
		}),
	);

	assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("CORS: a non-wildcard allowed origin also gets allow-credentials", async () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret", cors: "https://ops.example" });

	const res = await handler(
		new Request("http://x/api/chats", {
			headers: { origin: "https://ops.example", authorization: "Bearer secret" },
		}),
	);
	assert.equal(res.headers.get("access-control-allow-credentials"), "true");
});

test("the login page sets clickjacking protections", async () => {
	const { handler } = fakePanel();
	const res = await handler(new Request("http://x/"));
	assert.equal(res.headers.get("x-frame-options"), "DENY");
	assert.match(res.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});

test("basePath: routes are matched under the prefix and the UI base is injected", async () => {
	const store = new MemoryPanelStore();
	store.record({ id: 1, name: "@sam" }, { direction: "in", text: "hi", date: 1 });
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret", basePath: "/panel" });

	const off = await handler(
		new Request("http://x/api/chats", { headers: { authorization: "Bearer secret" } }),
	);
	assert.equal(off.status, 404); // not under the prefix

	const page = await handler(new Request("http://x/panel"));
	assert.equal(page.status, 200);
	assert.match(await page.text(), /BASE = "\/panel"/);

	const chats = await handler(
		new Request("http://x/panel/api/chats", { headers: { authorization: "Bearer secret" } }),
	);
	assert.equal(chats.status, 200);
	assert.equal(((await chats.json()) as unknown[]).length, 1);
});

test("SSE stream advertises text/event-stream and forwards a record event", async () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret" });

	const res = await handler(
		new Request("http://x/api/stream", { headers: { authorization: "Bearer secret" } }),
	);
	assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

	const reader = res.body?.getReader();
	assert.ok(reader);
	await reader.read(); // ": connected"

	store.record({ id: 1, name: "@u" }, { direction: "in", text: "ping", date: 1 });

	const { value } = await reader.read();
	assert.ok(value);
	assert.match(new TextDecoder().decode(value), /event: record/);

	await reader.cancel();
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

	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (u: string) => {
		assert.equal(u, "https://files.test/photos/x.jpg");
		return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
	}) as typeof fetch;

	try {
		const handler = panelHandler(api, store, { token: "secret" });
		const res = await handler(
			new Request("http://x/api/file?id=ABC", { headers: { authorization: "Bearer secret" } }),
		);

		assert.equal(res.status, 200);
		assert.equal(res.headers.get("content-type"), "image/jpeg");
		assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3]);
		assert.deepEqual(calls, ["getFile:ABC"]);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test("GET /api/file returns 501 when the api can't proxy", async () => {
	const store = new MemoryPanelStore();
	const api = { sendMessage: () => Promise.resolve({}) };
	const handler = panelHandler(api, store, { token: "secret" });
	const res = await handler(
		new Request("http://x/api/file?id=ABC", { headers: { authorization: "Bearer secret" } }),
	);
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
		new Request("http://x/api/chats/1/send", {
			method: "POST",
			headers: { authorization: "Bearer secret" },
			body: fd,
		}),
	);

	assert.equal(res.status, 200);
	assert.equal(calls[0]?.method, "sendPhoto");
	assert.equal(calls[0]?.params.caption, "hi");

	const m = store.history(1).at(-1);
	assert.equal(m?.direction, "out");
	assert.deepEqual(m?.attachments, [{ type: "photo", fileId: "up1" }]);
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
		new Request("http://x/api/chats/7/send", {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer secret" },
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
	assert.deepEqual(m?.attachments, [{ type: "photo", fileId: "big" }]);
	assert.equal(m?.mediaGroupId, "AG123");
});

test("handoff() suppresses the bot's own handlers once a chat is handled, and releases it back", async () => {
	const store = new MemoryPanelStore();
	store.record({ id: 9 }, { direction: "in", text: "hi", date: 1 });

	let nextRan = 0;
	const mw = entry(
		new Composer<Context>().install(handoff(store)).use(async (_ctx, next) => {
			nextRan++;
			await next();
		}),
	);

	const ctx = (chatId: number) =>
		new Context({
			api: {} as never,
			update: {
				update_id: 1,
				message: { message_id: 1, date: 0, chat: { id: chatId, type: "private" }, text: "hi" },
			} as never,
			updateType: "message",
		});

	await mw(ctx(9), noop);
	assert.equal(nextRan, 1); // status "open" by default — bot handlers still run

	store.setStatus(9, "handled");
	await mw(ctx(9), noop);
	assert.equal(nextRan, 1); // suppressed — an operator owns this chat now

	store.setStatus(9, "open");
	await mw(ctx(9), noop);
	assert.equal(nextRan, 2); // released — bot handlers resume
});
