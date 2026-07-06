import { autoRetry } from "@yaebal/again";
import { ThrottleAbortError, throttle, withThrottle } from "@yaebal/throttle";
import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/throttle/.env first (copy .env.example)");
	process.exit(1);
}

const transport = throttle({
	globalPerSec: 30,
	perChatPerSec: 1,
	perGroupPerMin: 20,
	perMethod: {
		answerCallbackQuery: { privateChat: false, group: false, priority: 50 },
		sendPhoto: { privateChat: { limit: 1, windowMs: 5_000 }, priority: -10 },
	},
	retryAfterPaddingMs: 250,
	onEvent: (event) => {
		if (event.type === "acquired") {
			console.log(`acquired ${event.request.method} after ${event.waitMs}ms`);
		}
		if (event.type === "retry_after") {
			console.log(`learned retry_after=${event.retryAfterMs}ms for ${event.buckets.join(",")}`);
		}
	},
});

const bot = createBot(token)
	.install(transport)
	.install(autoRetry({ retryAfterPaddingMs: 250 }));

bot.command("start", (ctx) =>
	ctx.reply("This bot uses @yaebal/throttle. Try /burst, /priority, /cancel and /metrics."),
);

bot.command("burst", async (ctx) => {
	await ctx.reply("queueing 8 messages behind the per-chat bucket");
	await Promise.all(
		Array.from({ length: 8 }, (_, index) => ctx.send(`throttled message ${index + 1}/8`)),
	);

	return ctx.reply("burst drained");
});

bot.command("priority", async (ctx) => {
	const chatId = ctx.chat.id;

	await ctx.reply("queueing low-priority work and one urgent message");

	const low = ctx.api.sendMessage(
		withThrottle({ chat_id: chatId, text: "low priority message" }, { priority: -10 }),
	);
	const urgent = ctx.api.sendMessage(
		withThrottle({ chat_id: chatId, text: "urgent high-priority message" }, { priority: 100 }),
	);

	await Promise.all([low, urgent]);
});

bot.command("cancel", async (ctx) => {
	const chatId = ctx.chat.id;

	const controller = new AbortController();
	const queued = ctx.api.sendMessage(
		withThrottle(
			{ chat_id: chatId, text: "this queued call should be aborted" },
			{
				signal: controller.signal,
			},
		),
	);

	controller.abort(new ThrottleAbortError("sendMessage", -1));

	try {
		await queued;
		return ctx.reply("unexpected: queued request was not cancelled");
	} catch (error) {
		return ctx.reply(`cancelled queued request: ${(error as Error).message}`);
	}
});

bot.command("metrics", (ctx) => {
	const metrics = transport.handle.metrics;

	return ctx.reply(
		[
			"throttle metrics",
			`pending: ${metrics.pending}`,
			`acquired: ${metrics.acquired}`,
			`delayed: ${metrics.delayed}`,
			`cancelled: ${metrics.cancelled}`,
			`retryAfterLearned: ${metrics.retryAfterLearned}`,
			`totalWaitMs: ${metrics.totalWaitMs}`,
		].join("\n"),
	);
});

await bot.start();
console.log("throttle example bot is running");
