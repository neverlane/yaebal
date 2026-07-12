import { cron, cronAdmin } from "@yaebal/cron";
import { fileStorage } from "@yaebal/sklad/file";
import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/cron/.env first (copy .env.example)");
	process.exit(1);
}

// set ADMIN_ID in .env to your telegram user id to gate /cron; otherwise everyone can use it
// (fine for this demo, but pass a real allow-list/role check in production).
const adminId = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : undefined;

// persists each job's lastRunAt to a JSON file — restart the bot and "digest" still knows
// whether it missed its 09:00 run while the process was down. any @yaebal/sklad adapter works
// here (MemoryStorage, redisStorage, sqliteStorage, kvStorage) — fileStorage is the
// zero-infrastructure choice for a demo like this one.
const store = fileStorage<{ lastRunAt: number }>("./data/cron-state.json");

let syncAttempts = 0;

const bot = createBot(token)
	.install(
		cron({
			tz: "Europe/Moscow", // default zone for every job below; per-job `tz` overrides it
			store,
			onEvent: (event) => console.log(`[cron] ${event.type}`, event),
			jobs: {
				// fires every 10s — watch it tick in the terminal without touching any commands
				heartbeat: {
					schedule: 10_000,
					task: (ctx) => console.log(`[heartbeat] tick #${ctx.run}`),
				},

				// intentionally flaky, to show retries + backoff + a cooperative timeout in action.
				// overlap: "wait" means a tick that arrives mid-retry queues instead of piling up.
				"flaky-sync": {
					schedule: 15_000,
					overlap: "wait",
					retries: 2,
					retryDelayMs: (attempt) => attempt * 500, // 500ms, then 1000ms
					timeoutMs: 3_000,
					task: async (ctx) => {
						console.log(
							`[flaky-sync] run ${ctx.run}, attempt ${ctx.attempt} (total attempts: ${++syncAttempts})`,
						);
						if (Math.random() < 0.5) throw new Error("upstream hiccup");
					},
					onError: (error) => console.error("[flaky-sync] gave up:", (error as Error).message),
				},

				// a real "send a report" job: cron expression (in Moscow time), catches up on a
				// missed run at startup (see `store` above), and is also triggerable on demand
				// below via /run-digest — respecting whatever's already in flight.
				digest: {
					schedule: "0 9 * * *", // 09:00 Europe/Moscow
					catchUp: true,
					retries: 1,
					task: async (ctx) => {
						console.log(
							`[digest] sending (scheduled for ${new Date(ctx.scheduledFor).toISOString()})`,
						);
					},
				},
			},
		}),
	)
	// a telegram-native ops surface for every job above:
	// /cron | /cron run <name> | /cron pause|resume <name> | /cron next <name>
	.install(cronAdmin({ isAdmin: (ctx) => adminId === undefined || ctx.from?.id === adminId }));

bot.command("start", (ctx) =>
	ctx.reply(
		[
			"this bot demos @yaebal/cron. try:",
			"/run-digest — trigger the digest job now, bypassing its schedule",
			"/state — every job's current state (runs, failures, next/last run)",
			"/cron — the cronAdmin ops surface (admin command; open unless ADMIN_ID is set)",
			"",
			"heartbeat ticks every 10s and flaky-sync (which fails ~50% of the time, retrying with",
			"backoff) runs every 15s — watch the terminal to see them fire on their own.",
		].join("\n"),
	),
);

// the plugin decorates ctx.cron — any handler can reach trigger/pause/resume/states/nextRuns
// without a separate import.
bot.command("run-digest", async (ctx) => {
	const outcome = await ctx.cron.trigger("digest"); // "ran" | "skipped" — never disturbs the schedule
	await ctx.reply(`digest: ${outcome}`);
});

bot.command("state", async (ctx) => {
	const lines = ctx.cron.states().map((state) => {
		const next = state.nextRunAt ? new Date(state.nextRunAt).toISOString() : "—";
		return `${state.name}: runs=${state.runs} failures=${state.failures} next=${next}`;
	});
	await ctx.reply(lines.join("\n") || "(no jobs)");
});

bot.start();
