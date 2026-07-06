import { autoRetry, type RetryReason } from "@yaebal/again";
import { createBot, TelegramError } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/again/.env first (copy .env.example)");
	process.exit(1);
}

const retryCounts: Record<RetryReason, number> = {
	retry_after: 0,
	rate_limit_backoff: 0,
	internal: 0,
};

let totalRetryDelayMs = 0;

const bot = createBot(token).install(
	autoRetry({
		maxRetries: 5,
		maxDelayMs: 60_000,
		retryAfterPaddingMs: 250,
		jitter: 0.1,
		onRetry: (event) => {
			retryCounts[event.reason] = (retryCounts[event.reason] ?? 0) + 1;
			totalRetryDelayMs += event.delayMs;
			console.log(
				`retry ${event.method}: reason=${event.reason} attempt=${event.attempt} delay=${event.delayMs}ms`,
			);
		},
	}),
);

bot.command("start", (ctx) =>
	ctx.reply(
		"This bot uses @yaebal/again. Try /burst to send a burst and /stats to inspect retry metrics.",
	),
);

bot.command("burst", async (ctx) => {
	await ctx.reply("sending 45 messages; any 429 retry_after will be awaited and retried");

	for (let index = 1; index <= 45; index++) {
		await ctx.send(`burst message ${index}/45`);
	}

	return ctx.reply("burst finished");
});

bot.command("stats", (ctx) =>
	ctx.reply(
		[
			"again retry stats",
			`retry_after: ${retryCounts.retry_after}`,
			`rate_limit_backoff: ${retryCounts.rate_limit_backoff}`,
			`internal: ${retryCounts.internal}`,
			`total retry delay: ${totalRetryDelayMs}ms`,
		].join("\n"),
	),
);

bot.onError((error, ctx) => {
	if (error instanceof TelegramError) {
		console.error("telegram api error", {
			method: error.method,
			code: error.code,
			parameters: error.parameters,
		});
	} else {
		console.error("handler error", error);
	}

	return ctx.reply("the request failed after all retries; check the example logs");
});

await bot.start();
console.log("again example bot is running");
