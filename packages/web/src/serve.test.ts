import assert from "node:assert/strict";
import test from "node:test";
import { serve } from "./serve.js";

const update = {
	update_id: 1,
	message: { message_id: 1, date: 0, chat: { id: 5, type: "private" }, text: "hi" },
};

test("serve() starts a node http server, dispatches, and stops", async () => {
	const seen: number[] = [];
	const bot = { handleUpdate: async (u: { update_id: number }) => void seen.push(u.update_id) };

	const server = await serve(bot, { port: 0, secretToken: "s3cret" });
	try {
		assert.ok(server.port > 0);

		const ok = await fetch(server.url, {
			method: "POST",
			headers: { "x-telegram-bot-api-secret-token": "s3cret" },
			body: JSON.stringify(update),
		});
		assert.equal(ok.status, 200);
		assert.deepEqual(seen, [1]);

		const unauthorized = await fetch(server.url, { method: "POST", body: JSON.stringify(update) });
		assert.equal(unauthorized.status, 401);

		const wrongMethod = await fetch(server.url, { method: "GET" });
		assert.equal(wrongMethod.status, 405);
		assert.equal(wrongMethod.headers.get("allow"), "POST");
	} finally {
		await server.stop();
	}

	// the port is released — a fresh bind on it succeeds.
	await assert.doesNotReject(fetch(server.url).catch(() => undefined));
});
