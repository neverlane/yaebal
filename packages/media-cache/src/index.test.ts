import assert from "node:assert/strict";
import test from "node:test";
import { type Context, type MediaSource, media } from "@yaebal/core";
import { mediaCache } from "./index.js";

test("first send uploads the source, later sends reuse the cached file_id", async () => {
	const sent: MediaSource[] = [];
	const ctx = {
		sendPhoto: (src: MediaSource) => {
			sent.push(src);
			return Promise.resolve({ message_id: 1, photo: [{ file_id: "SMALL" }, { file_id: "BIG" }] });
		},
	} as unknown as Context;

	const cache = mediaCache();
	await cache.photo(ctx, "logo", media.path("./logo.png"));
	await cache.photo(ctx, "logo", media.path("./logo.png"));

	assert.equal(sent[0]?.kind, "path"); // first time → uploaded
	assert.equal(sent[1]?.kind, "fileId"); // second time → cached
	assert.equal((sent[1] as { fileId: string }).fileId, "BIG"); // last/biggest size
});

test("document caches file_id from the document field", async () => {
	const sent: MediaSource[] = [];
	const ctx = {
		sendDocument: (src: MediaSource) => {
			sent.push(src);
			return Promise.resolve({ message_id: 1, document: { file_id: "DOC" } });
		},
	} as unknown as Context;

	const cache = mediaCache();
	await cache.document(ctx, "report", media.path("./r.pdf"));
	await cache.document(ctx, "report", media.path("./r.pdf"));

	assert.equal(sent[1]?.kind, "fileId");
	assert.equal((sent[1] as { fileId: string }).fileId, "DOC");
});

test("distinct keys cache independently", async () => {
	const sent: MediaSource[] = [];
	const ctx = {
		sendPhoto: (src: MediaSource) => {
			sent.push(src);
			return Promise.resolve({ message_id: 1, photo: [{ file_id: "X" }] });
		},
	} as unknown as Context;

	const cache = mediaCache();
	await cache.photo(ctx, "a", media.path("./a.png"));
	await cache.photo(ctx, "b", media.path("./b.png")); // different key → uploads
	
	assert.equal(sent[0]?.kind, "path");
	assert.equal(sent[1]?.kind, "path");
});
