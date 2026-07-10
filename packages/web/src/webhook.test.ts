import assert from "node:assert/strict";
import test from "node:test";
import { Bot } from "@yaebal/core";
import { dedupe } from "./dedupe.js";
import { webhook } from "./index.js";
import { deleteWebhook, getWebhookInfo, setWebhook } from "./lifecycle.js";
import { sequentialize } from "./sequentialize.js";
import { isTelegramIp, TELEGRAM_IP_RANGES } from "./telegram-ip.js";

const post = (body: unknown, headers: Record<string, string> = {}) =>
	new Request("https://yaebal.mom/", { method: "POST", body: JSON.stringify(body), headers });

const messageUpdate = (id: number, chatId: number, text = "hi") => ({
	update_id: id,
	message: { message_id: id, date: 0, chat: { id: chatId, type: "private" }, text },
});

test("webhook() dispatches POSTed updates and guards method + secret", async () => {
	const seen: number[] = [];
	const bot = { handleUpdate: async (u: { update_id: number }) => void seen.push(u.update_id) };
	const handler = webhook(bot, { secretToken: "s3cret" });

	assert.equal((await handler(new Request("https://yaebal.mom/", { method: "GET" }))).status, 405);
	assert.equal((await handler(post(messageUpdate(1, 1)))).status, 401);
	assert.equal(
		(await handler(post(messageUpdate(1, 1), { "x-telegram-bot-api-secret-token": "s3cret" })))
			.status,
		200,
	);
	assert.deepEqual(seen, [1]);
});

test("setWebhook forwards every parameter and validates the secret", async () => {
	const calls: { method: string; params?: Record<string, unknown> }[] = [];
	const bot = {
		api: {
			call: async (method: string, params?: Record<string, unknown>) =>
				void calls.push({ method, params }),
		},
	};

	await setWebhook(bot, "https://yaebal.mom/hook", {
		secretToken: "s3cret",
		allowedUpdates: ["message", "callback_query"],
		dropPendingUpdates: true,
		maxConnections: 40,
		ipAddress: "149.154.167.51",
	});

	assert.equal(calls[0]?.method, "setWebhook");
	assert.deepEqual(calls[0]?.params, {
		url: "https://yaebal.mom/hook",
		secret_token: "s3cret",
		allowed_updates: ["message", "callback_query"],
		drop_pending_updates: true,
		max_connections: 40,
		ip_address: "149.154.167.51",
		certificate: undefined,
	});

	await assert.rejects(() => setWebhook(bot, "https://yaebal.mom/", { secretToken: "bad token!" }));
});

test("deleteWebhook accepts an options object and a bare boolean; getWebhookInfo reads status", async () => {
	const calls: { method: string; params?: Record<string, unknown> }[] = [];
	const bot = {
		api: {
			call: async (method: string, params?: Record<string, unknown>) => {
				calls.push({ method, params });
				return { url: "https://yaebal.mom/hook", pending_update_count: 3 } as unknown;
			},
		},
	};

	await deleteWebhook(bot, { dropPendingUpdates: true });
	assert.deepEqual(calls[0], { method: "deleteWebhook", params: { drop_pending_updates: true } });

	await deleteWebhook(bot, true); // legacy shape still works
	assert.equal(calls[1]?.params?.drop_pending_updates, true);

	const info = await getWebhookInfo(bot);
	assert.equal(calls[2]?.method, "getWebhookInfo");
	assert.equal(info.pending_update_count, 3);
});

test("isTelegramIp matches both published subnets and rejects everything else", () => {
	assert.ok(isTelegramIp("149.154.167.51")); // 149.154.160.0/20
	assert.ok(isTelegramIp("91.108.4.5")); // 91.108.4.0/22
	assert.ok(isTelegramIp("::ffff:149.154.167.51")); // ipv4-mapped ipv6
	assert.equal(isTelegramIp("149.154.176.1"), false); // just outside /20
	assert.equal(isTelegramIp("1.2.3.4"), false);
	assert.equal(isTelegramIp("not-an-ip"), false);
	assert.equal(isTelegramIp(undefined), false);
	assert.equal(TELEGRAM_IP_RANGES.length, 2);
});

test("sequentialize serialises same-chat updates and interleaves different chats", async () => {
	const log: string[] = [];
	const bot = new Bot("123:abc").use(sequentialize());
	bot.on("message", async (ctx) => {
		const tag = `${ctx.chat?.id}:${ctx.update.update_id}`;
		log.push(`start ${tag}`);
		await new Promise((r) => setTimeout(r, 20));
		log.push(`end ${tag}`);
	});

	// two updates for chat 1 fired together must not overlap; chat 2 runs alongside.
	await Promise.all([
		bot.handleUpdate(messageUpdate(1, 1) as never),
		bot.handleUpdate(messageUpdate(2, 1) as never),
		bot.handleUpdate(messageUpdate(3, 2) as never),
	]);

	// chat 1's two updates never interleave with each other.
	const chat1 = log.filter((l) => l.endsWith(":1") || l.endsWith(":2"));
	assert.deepEqual(chat1, ["start 1:1", "end 1:1", "start 1:2", "end 1:2"]);
	// chat 2 started before chat 1 finished — proof lanes are independent.
	assert.ok(log.indexOf("start 2:3") < log.indexOf("end 1:1"));
});

test("dedupe drops a redelivered update_id", async () => {
	let runs = 0;
	const bot = new Bot("123:abc").use(dedupe());
	bot.on("message", () => {
		runs++;
	});

	await bot.handleUpdate(messageUpdate(7, 1) as never);
	await bot.handleUpdate(messageUpdate(7, 1) as never); // telegram redelivery
	await bot.handleUpdate(messageUpdate(8, 1) as never);

	assert.equal(runs, 2);
});
