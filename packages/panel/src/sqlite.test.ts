import assert from "node:assert/strict";
import test from "node:test";
import { SqlitePanelStore } from "./sqlite.js";

test("SqlitePanelStore: records, lists newest-first, paginates and emits events", () => {
	const store = new SqlitePanelStore(); // :memory:
	const events: number[] = [];
	store.subscribe((e) => events.push(e.chatId));

	store.record({ id: 1, name: "@sam" }, { direction: "in", text: "hi", date: 10 });
	store.record({ id: 2, name: "@lee" }, { direction: "in", text: "yo", date: 20 });
	for (let i = 1; i <= 5; i++) {
		store.record({ id: 1 }, { direction: "in", text: `m${i}`, date: 100 + i });
	}

	// chats sorted by last_date desc; name preserved across nameless records
	const chats = store.chats();
	assert.equal(chats[0]?.id, 1);
	assert.equal(chats[0]?.name, "@sam");
	assert.equal(chats[0]?.lastText, "m5");

	// pagination
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

test("SqlitePanelStore persists attachments and media_group_id round-trip", () => {
	const store = new SqlitePanelStore();

	store.record(
		{ id: 1, name: "@u" },
		{
			direction: "in",
			text: "[photo]",
			date: 1,
			attachments: [{ type: "photo", fileId: "f1" }],
			mediaGroupId: "G1",
		},
	);
	store.record({ id: 1, name: "@u" }, { direction: "out", text: "thanks", date: 2 });

	const hist = store.history(1);
	assert.deepEqual(hist[0]?.attachments, [{ type: "photo", fileId: "f1" }]);
	assert.equal(hist[0]?.mediaGroupId, "G1");
	// plain text message has no attachments/group keys
	assert.equal(hist[1]?.attachments, undefined);
	assert.equal(hist[1]?.mediaGroupId, undefined);
	store.close();
});