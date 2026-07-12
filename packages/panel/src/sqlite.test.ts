import assert from "node:assert/strict";
import test from "node:test";

// `node:sqlite` (and therefore `SqlitePanelStore`) is only available on node 22.5+.
// on older runtimes a static import of "./sqlite.js" throws ERR_UNKNOWN_BUILTIN_MODULE
// at module-evaluation time, which would fail the whole file. import it lazily and
// skip the suite when the builtin is missing instead.
let SqlitePanelStore: typeof import("./sqlite.js").SqlitePanelStore | undefined;
try {
	({ SqlitePanelStore } = await import("./sqlite.js"));
} catch {
	SqlitePanelStore = undefined;
}

const skip = SqlitePanelStore ? false : "node:sqlite unavailable (requires node 22.5+)";
// non-undefined alias for the test bodies (only reached when not skipped)
const Store = SqlitePanelStore as NonNullable<typeof SqlitePanelStore>;

test("SqlitePanelStore: records, lists newest-first, paginates and emits events", { skip }, () => {
	const store = new Store(); // :memory:
	const events: number[] = [];
	store.subscribe((e) => events.push(e.chatId));

	store.record({ id: 1, name: "@sam" }, { direction: "in", text: "hi", date: 10 });
	store.record({ id: 2, name: "@lee" }, { direction: "in", text: "yo", date: 20 });
	for (let i = 1; i <= 5; i++) {
		store.record({ id: 1 }, { direction: "in", text: `m${i}`, date: 100 + i });
	}

	const chats = store.chats();
	assert.equal(chats[0]?.id, 1);
	assert.equal(chats[0]?.name, "@sam");
	assert.equal(chats[0]?.lastText, "m5");
	assert.equal(chats[0]?.unread, 6); // 5 "mN" + the initial "hi"
	assert.equal(chats[0]?.status, "open");

	assert.deepEqual(
		store.history(1, { limit: 2 }).map((m) => m.text),
		["m4", "m5"],
	);
	assert.deepEqual(
		store.history(1, { before: 103, limit: 2 }).map((m) => m.text),
		["m1", "m2"],
	);

	assert.ok(events.length >= 2);
	store.close();
});

test("SqlitePanelStore: composite (date, seq) cursor doesn't drop same-second messages", {
	skip,
}, () => {
	const store = new Store();
	for (let i = 1; i <= 5; i++) {
		store.record({ id: 1 }, { direction: "in", text: `m${i}`, date: 100 }); // all share `date`
	}

	const page1 = store.history(1, { limit: 2 });
	assert.deepEqual(
		page1.map((m) => m.text),
		["m4", "m5"],
	);
	const oldestSeq = page1[0]?.seq;
	assert.ok(oldestSeq !== undefined);

	const page2 = store.history(1, { before: 100, beforeSeq: oldestSeq, limit: 2 });
	assert.deepEqual(
		page2.map((m) => m.text),
		["m2", "m3"],
	);

	store.close();
});

test("SqlitePanelStore persists attachments and media_group_id round-trip", { skip }, () => {
	const store = new Store();

	store.record(
		{ id: 1, name: "@u", firstName: "Uma", lastName: "Ray", username: "u" },
		{
			direction: "in",
			text: "[photo]",
			date: 1,
			attachments: [{ type: "photo", fileId: "f1" }],
			mediaGroupId: "G1",
			keyboard: {
				type: "inline",
				rows: [[{ text: "Open", kind: "callback", callbackData: "open" }]],
			},
		},
	);
	store.record(
		{ id: 1, name: "@u" },
		{
			direction: "in",
			text: "button clicked: open",
			date: 2,
			event: { type: "callback", title: "button clicked", detail: "open", data: "open" },
		},
	);

	const chat = store.chats()[0];
	assert.equal(chat?.firstName, "Uma");
	assert.equal(chat?.lastName, "Ray");
	assert.equal(chat?.username, "u");
	assert.equal(chat?.lastAttachmentType, undefined);
	assert.equal(chat?.lastEventType, "callback");

	const hist = store.history(1);
	assert.deepEqual(hist[0]?.attachments, [{ type: "photo", fileId: "f1" }]);
	assert.equal(hist[0]?.mediaGroupId, "G1");
	assert.deepEqual(hist[0]?.keyboard, {
		type: "inline",
		rows: [[{ text: "Open", kind: "callback", callbackData: "open" }]],
	});
	assert.equal(hist[1]?.attachments, undefined);
	assert.equal(hist[1]?.mediaGroupId, undefined);
	assert.equal(hist[1]?.event?.type, "callback");
	store.close();
});

test("SqlitePanelStore: status/assign/pin/markRead/updateMessage/deleteChat", { skip }, () => {
	const store = new Store();
	store.record({ id: 1, name: "@a" }, { direction: "in", text: "hello", date: 1, id: 500 });

	assert.equal(store.status(1), "open");
	store.setStatus(1, "handled");
	assert.equal(store.status(1), "handled");

	store.assign(1, "alice");
	assert.equal(store.chats()[0]?.assignedTo, "alice");
	store.assign(1, null);
	assert.equal(store.chats()[0]?.assignedTo, undefined);

	store.pin(1, true);
	assert.equal(store.chats()[0]?.pinned, true);

	assert.equal(store.chats()[0]?.unread, 1);
	store.markRead(1);
	assert.equal(store.chats()[0]?.unread, 0);

	store.updateMessage(1, 500, { text: "edited", edited: true });
	assert.equal(store.history(1)[0]?.text, "edited");
	assert.equal(store.history(1)[0]?.edited, true);

	store.deleteChat(1);
	assert.equal(store.chats().length, 0);
	assert.equal(store.history(1).length, 0);

	store.close();
});

test("SqlitePanelStore.markRead only emits on a real transition (regression: SSE feedback loop)", {
	skip,
}, () => {
	const store = new Store();
	store.record({ id: 1 }, { direction: "in", text: "hi", date: 1 });

	const seen: string[] = [];
	store.subscribe((e) => seen.push(e.type));

	store.markRead(1);
	store.markRead(1);
	store.markRead(1);

	assert.deepEqual(seen, ["read"]);
	store.close();
});

test("SqlitePanelStore: search finds messages by text (FTS5 or LIKE fallback)", { skip }, () => {
	const store = new Store();
	store.record({ id: 1, name: "@a" }, { direction: "in", text: "hello world", date: 1 });
	store.record({ id: 2, name: "@b" }, { direction: "in", text: "goodbye", date: 2 });

	const results = store.search("hello");
	assert.equal(results.length, 1);
	assert.equal(results[0]?.chatId, 1);
	assert.equal(results[0]?.message.text, "hello world");

	assert.deepEqual(store.search("nonexistent"), []);
	assert.deepEqual(store.search(""), []);

	store.close();
});

test("SqlitePanelStore: retention keeps at most maxHistory messages per chat", { skip }, () => {
	const store = new Store({ maxHistory: 3 });
	for (let i = 1; i <= 5; i++) {
		store.record({ id: 1 }, { direction: "in", text: `m${i}`, date: i });
	}

	assert.deepEqual(
		store.history(1).map((m) => m.text),
		["m3", "m4", "m5"],
	);
	store.close();
});
