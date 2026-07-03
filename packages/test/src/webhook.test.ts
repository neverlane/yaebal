import assert from "node:assert/strict";
import test from "node:test";
import { withFetch } from "./fetch.js";
import { messageUpdate } from "./updates.js";
import { collectUpdates, webhookRequest } from "./webhook.js";

test("collectUpdates records every update handed to the sink", async () => {
	const { sink, updates } = collectUpdates();

	await sink.handleUpdate(messageUpdate({ text: "one" }));
	await sink.handleUpdate(messageUpdate({ text: "two" }));

	assert.equal(updates.length, 2);
	assert.equal(updates[0]?.message?.text, "one");
});

test("webhookRequest builds a POST carrying the update as JSON, with an optional secret header", async () => {
	const update = messageUpdate({ text: "hi" });
	const req = webhookRequest(update, { secretToken: "s3cret" });

	assert.equal(req.method, "POST");
	assert.equal(req.headers.get("x-telegram-bot-api-secret-token"), "s3cret");
	assert.deepEqual(await req.json(), update);
});

test("withFetch stubs globalThis.fetch for the duration of fn, then restores it", async () => {
	const realFetch = globalThis.fetch;

	const result = await withFetch(
		async () => new Response("stubbed"),
		async () => {
			const res = await fetch("https://example.invalid/");
			return res.text();
		},
	);

	assert.equal(result, "stubbed");
	assert.equal(globalThis.fetch, realFetch);
});

test("withFetch restores the original fetch even if fn throws", async () => {
	const realFetch = globalThis.fetch;

	await assert.rejects(
		withFetch(
			async () => new Response("x"),
			() => {
				throw new Error("boom");
			},
		),
	);

	assert.equal(globalThis.fetch, realFetch);
});
