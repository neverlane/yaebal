import { Broadcast, type BroadcastEvent, type BroadcastJobHandle } from "@yaebal/broadcast";
import { Bot } from "@yaebal/core";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/broadcast/.env first (copy .env.example)");
	process.exit(1);
}

const adminId = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : undefined;
const subscribers = new Set<number>();
const jobs = new Map<string, BroadcastJobHandle>();
const recentEvents: string[] = [];

const bot = new Bot(token);

function remember(event: BroadcastEvent): void {
	recentEvents.push(event.type);
	if (recentEvents.length > 10) recentEvents.shift();
}

function isAdmin(userId: number | undefined): boolean {
	return adminId === undefined || userId === adminId;
}

function requireAdmin(userId: number | undefined): string | undefined {
	if (isAdmin(userId)) return undefined;
	return "this command is restricted. set ADMIN_ID in .env to your telegram user id.";
}

const broadcaster = new Broadcast(bot.api, {
	concurrency: 3,
	rateLimit: { limit: 20, windowMs: 1_000 },
	retry: { attempts: 5, fixedDelayMs: 1_000 },
	onEvent: remember,
}).type("digest", (chatId: number, text: string) =>
	bot.api.sendMessage({
		chat_id: chatId,
		text,
		disable_notification: true,
	}),
);

bot
	.command("start", async (ctx) => {
		if (ctx.chat?.id !== undefined) subscribers.add(ctx.chat.id);

		await ctx.reply(`you are subscribed to the broadcast demo.

try /status to see worker metrics.
admin commands: /broadcast text, /pause job_id, /resume job_id, /cancel job_id.`);
	})
	.command("subscribe", async (ctx) => {
		if (ctx.chat?.id === undefined) return ctx.reply("no chat id in this update.");
		subscribers.add(ctx.chat.id);
		return ctx.reply(`subscribed. audience size: ${subscribers.size}.`);
	})
	.command("unsubscribe", async (ctx) => {
		if (ctx.chat?.id !== undefined) subscribers.delete(ctx.chat.id);
		return ctx.reply(`unsubscribed. audience size: ${subscribers.size}.`);
	})
	.command("broadcast", async (ctx) => {
		const denied = requireAdmin(ctx.from?.id);
		if (denied) return ctx.reply(denied);

		const text = ctx.args.join(" ").trim();
		if (!text) return ctx.reply("usage: /broadcast text to send");

		const audience = [...subscribers];
		if (audience.length === 0)
			return ctx.reply("no subscribers yet. ask users to send /start first.");

		const job = await broadcaster.start(
			"digest",
			audience.map((chatId) => [chatId, text] as const),
			{ metadata: { requestedBy: ctx.from?.id } },
		);
		jobs.set(job.id, job);

		await ctx.reply(`queued ${audience.length} deliveries.
job id: ${job.id}`);

		void job
			.wait()
			.then((result) =>
				ctx.reply(
					`job ${result.jobId} finished: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed.`,
				),
			);
	})
	.command("status", async (ctx) => {
		const latest = (await broadcaster.listJobs()).slice(-5).reverse();
		const lines = latest.map(
			(job) =>
				`${job.id}: ${job.status}, ${job.sent}/${job.total} sent, ${job.skipped} skipped, ${job.failed} failed`,
		);
		const metrics = broadcaster.metrics;

		return ctx.reply(`audience: ${subscribers.size}
active deliveries: ${metrics.active}
events: ${recentEvents.join(", ") || "none"}

recent jobs:
${lines.join("\n") || "none"}`);
	})
	.command("pause", async (ctx) =>
		controlJob(ctx.args[0], "pause", (job) => job.pause(), ctx.reply.bind(ctx)),
	)
	.command("resume", async (ctx) =>
		controlJob(ctx.args[0], "resume", (job) => job.resume(), ctx.reply.bind(ctx)),
	)
	.command("cancel", async (ctx) =>
		controlJob(ctx.args[0], "cancel", (job) => job.cancel(), ctx.reply.bind(ctx)),
	)
	.on("message:text", (ctx) => ctx.reply("send /start to subscribe or /status to inspect jobs."))
	.onStart(async (info) => {
		await bot.api
			.call("setMyCommands", {
				commands: [
					{ command: "start", description: "subscribe to the demo" },
					{ command: "broadcast", description: "admin: queue a broadcast" },
					{ command: "status", description: "show broadcast metrics" },
					{ command: "pause", description: "admin: pause a job" },
					{ command: "resume", description: "admin: resume a job" },
					{ command: "cancel", description: "admin: cancel a job" },
				],
			})
			.catch(() => {});

		console.log(`@${info.username} is live. admin id: ${adminId ?? "not set"}`);
	})
	.onStop(() => broadcaster.stop({ drain: true }));

async function controlJob(
	id: string | undefined,
	verb: string,
	action: (job: BroadcastJobHandle) => Promise<void>,
	reply: (text: string) => Promise<unknown>,
): Promise<unknown> {
	if (!id) return reply(`usage: /${verb} job_id`);

	const job = jobs.get(id);
	if (!job) return reply(`unknown job: ${id}`);

	await action(job);
	return reply(`${verb}d job ${id}.`);
}

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
