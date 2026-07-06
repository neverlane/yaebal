import assert from "node:assert/strict";
import test from "node:test";
import { deleteWebhook, setWebhook, webhook } from "./index.js";

const sink = () => {
	const updates: unknown[] = [];
	const bot = { handleUpdate: async (u: never) => void updates.push(u) };

	return { bot, updates };
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
	new Request("https://yaebal.mom/", { method: "POST", body: JSON.stringify(body), headers });

test("webhook handler dispatches POSTed updates", async () => {
	const { bot, updates } = sink();

	const res = await webhook(bot)(post({ update_id: 1, message: { text: "hi" } }));

	assert.equal(res.status, 200);
	assert.equal(updates.length, 1);
});

test("webhook handler rejects non-POST and bad secret", async () => {
	const { bot, updates } = sink();
	const handler = webhook(bot, { secretToken: "s3cret" });

	const get = await handler(new Request("https://yaebal.mom/", { method: "GET" }));
	assert.equal(get.status, 405);

	const bad = await handler(post({ update_id: 1 }, { "x-telegram-bot-api-secret-token": "nope" }));
	assert.equal(bad.status, 401);

	const ok = await handler(post({ update_id: 1 }, { "x-telegram-bot-api-secret-token": "s3cret" }));
	assert.equal(ok.status, 200);
	assert.equal(updates.length, 1);
});

test("setWebhook / deleteWebhook call the Bot API", async () => {
	const calls: { method: string; params?: Record<string, unknown> }[] = [];
	const bot = {
		api: {
			call: async (method: string, params?: Record<string, unknown>) => {
				calls.push({ method, params });
				return true;
			},
		},
	};

	await setWebhook(bot, "https://yaebal.mom/hook", {
		secretToken: "s3cret",
		allowedUpdates: ["message"],
		dropPendingUpdates: true,
	});

	assert.equal(calls[0]?.method, "setWebhook");
	assert.equal(calls[0]?.params?.url, "https://yaebal.mom/hook");
	assert.equal(calls[0]?.params?.secret_token, "s3cret");
	assert.deepEqual(calls[0]?.params?.allowed_updates, ["message"]);
	assert.equal(calls[0]?.params?.drop_pending_updates, true);

	await deleteWebhook(bot, true);
	assert.equal(calls[1]?.method, "deleteWebhook");
	assert.equal(calls[1]?.params?.drop_pending_updates, true);
});
