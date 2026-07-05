import { Bot } from "@yaebal/core";
import { run } from "@yaebal/runner";
import { createPool } from "@yaebal/workers";
import type { Tasks } from "./tasks.js";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/runner-workers/.env first (copy .env.example)");
	process.exit(1);
}

const pool = createPool<Tasks>(new URL("./tasks.ts", import.meta.url), {
	size: Number(process.env.WORKER_POOL_SIZE ?? 2),
});

const bot = new Bot(token)
	.command("start", (ctx) =>
		ctx.reply(
			[
				"runner workers is live.",
				"updates are processed concurrently, but each chat stays ordered.",
				`worker pool size: ${pool.size}`,
				"try /hash hello, /score launch plan, /fanout.",
			].join("\n"),
		),
	)
	.command("hash", async (ctx) => {
		const input = ctx.args.join(" ").trim() || "yaebal";
		const digest = await pool.run("digest", input);
		return ctx.reply(`sha256(${input})\n${digest}`);
	})
	.command("score", async (ctx) => {
		const text = ctx.args.join(" ").trim() || "ship the bot";
		const result = await pool.run("score", { text, rounds: 90_000 });
		return ctx.reply(`score=${result.score}, length=${result.length}`);
	})
	.command("fanout", async (ctx) => {
		const chatId = ctx.chat?.id;
		if (chatId === undefined) return ctx.reply("no chat in this update.");

		await Promise.all(
			Array.from({ length: 6 }, (_, index) =>
				ctx.api.sendMessage({ chat_id: chatId, text: `fanout message ${index + 1}/6` }),
			),
		);
	})
	.on("message:text", (ctx) => ctx.reply("try /hash text or /score text."));

await bot.api
	.call("setMyCommands", {
		commands: [
			{ command: "start", description: "show runner status" },
			{ command: "hash", description: "hash text in a worker" },
			{ command: "score", description: "score text in a worker" },
			{ command: "fanout", description: "send several messages" },
		],
	})
	.catch(() => {});

const runner = run(bot, {
	concurrency: 32,
	limit: 100,
	onError: (error) => console.error("runner error", error),
});

console.log(`runner workers is polling with ${pool.size} worker thread(s)`);

async function shutdown() {
	await runner.stop();
	await pool.destroy();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
