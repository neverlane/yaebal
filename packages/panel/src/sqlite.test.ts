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

test("SqlitePanelStore persists attachments and media_group_id round-trip", { skip }, () => {
	const store = new Store();

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
