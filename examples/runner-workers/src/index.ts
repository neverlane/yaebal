import { Bot } from "@yaebal/core";
import { run } from "@yaebal/runner";
import { createPool, TaskTimeoutError } from "@yaebal/workers";
import { tasks } from "@yaebal/workers/plugin";
import type { Tasks } from "./tasks.js";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/runner-workers/.env first (copy .env.example)");
	process.exit(1);
}

// parse the pool size safely — a bad env value should not silently produce a zero-worker pool.
const parsedSize = Number.parseInt(process.env.WORKER_POOL_SIZE ?? "", 10);
const size = Number.isInteger(parsedSize) && parsedSize > 0 ? parsedSize : 2;

const pool = createPool<Tasks>(new URL("./tasks.ts", import.meta.url), {
	size,
	// every task gets 3s; cpu-heavy score loops that overrun are cancelled cooperatively via signal.
	timeout: 3_000,
	// shed load instead of growing an unbounded backlog under a flood of updates.
	maxQueue: 512,
});

pool.on("worker:crash", ({ worker, code, willRespawn }) =>
	console.error(
		`worker ${worker} crashed (code ${code})${willRespawn ? " — respawning" : " — dead"}`,
	),
);

const bot = new Bot(token)
	// the plugin puts the typed pool on ctx as `ctx.tasks`. the runner drives the loop itself and
	// never fires the bot's stop handlers, so we own shutdown below (onStop: false).
	.install(tasks(pool, { onStop: false }))
	.command("start", (ctx) =>
		ctx.reply(
			[
				"runner workers is live.",
				"updates are processed concurrently, but each chat stays ordered.",
				`worker pool size: ${pool.size}`,
				"try /hash hello, /score launch plan, /stats, /fanout.",
			].join("\n"),
		),
	)
	.command("hash", async (ctx) => {
		const input = ctx.args.join(" ").trim() || "yaebal";
		const digest = await ctx.tasks.run("digest", input);
		return ctx.reply(`sha256(${input})\n${digest}`);
	})
	.command("score", async (ctx) => {
		const text = ctx.args.join(" ").trim() || "ship the bot";
		try {
			const result = await ctx.tasks.run("score", { text, rounds: 50_000_000 });
			return ctx.reply(`score=${result.score}, length=${result.length}`);
		} catch (error) {
			if (error instanceof TaskTimeoutError)
				return ctx.reply("scoring took too long — try shorter text.");
			throw error;
		}
	})
	.command("stats", (ctx) => {
		const s = ctx.tasks.stats();
		return ctx.reply(
			[
				`workers: ${s.ready}/${s.size} ready, ${s.busy} busy, ${s.dead} dead`,
				`tasks: ${s.running} running, ${s.queued} queued`,
				`lifetime: ${s.completed} done, ${s.failed} failed, ${s.restarts} restarts`,
			].join("\n"),
		);
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
	.on("message:text", (ctx) => ctx.reply("try /hash text, /score text or /stats."));

await bot.api
	.call("setMyCommands", {
		commands: [
			{ command: "start", description: "show runner status" },
			{ command: "hash", description: "hash text in a worker" },
			{ command: "score", description: "score text in a worker" },
			{ command: "stats", description: "show worker pool stats" },
			{ command: "fanout", description: "send several messages" },
		],
	})
	.catch(() => {});

// surface a bad worker file (crash-on-load) at startup instead of on the first request.
await pool.ready().catch((error) => {
	console.error("worker pool failed to start:", error);
	process.exit(1);
});

const runner = run(bot, {
	concurrency: 32,
	limit: 100,
	onError: (error) => console.error("runner error", error),
});

console.log(`runner workers is polling with ${pool.size} worker thread(s)`);

async function shutdown() {
	await runner.stop();
	await pool.close({ timeout: 5_000 }); // let in-flight tasks finish, then force-terminate
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
