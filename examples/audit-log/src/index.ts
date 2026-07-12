import { applyRedaction, auditAdmin, auditLog, chatSink, memorySink } from "@yaebal/audit-log";
import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/audit-log/.env first (copy .env.example)");
	process.exit(1);
}

// set ADMIN_ID in .env to your telegram user id to unlock /audit; otherwise everyone can use it
// (fine for this demo, but pass a real allow-list/role check in production).
const adminId = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : undefined;
const isAdmin = (ctx: { from?: { id: number } }) =>
	adminId === undefined || ctx.from?.id === adminId;

// a bounded ring buffer of recent audit entries, readable from /status without a separate db.
const recent = memorySink({ limit: 20 });

// bot.api is available as soon as createBot() returns — independent of what's installed
// later — so chatSink(bot, ...) can be built before auditLog() is installed on bot.
const bot = createBot(token);

const audit = auditLog({
	sinks: [
		recent,
		// only wire chatSink if you've set an admin chat — it ships errors straight into
		// that chat via the bot's own sendMessage, deduped and rate-limited.
		...(process.env.ADMIN_CHAT_ID
			? [chatSink(bot, { chatId: process.env.ADMIN_CHAT_ID, minLevel: "error" as const })]
			: []),
	],
});

bot.install(audit);
// telegram-native ops surface for the counters auditLog() tracks: /audit, /audit flush
bot.install(auditAdmin({ logger: audit, isAdmin }));

bot.command("start", (ctx) =>
	ctx.reply(
		[
			"this bot demos @yaebal/audit-log. try:",
			"/whoami — a normal reply; watch the terminal for the update + api.call/api.result events",
			"/secret — shows redaction masking a fake secret_token and phone_number before logging",
			"/status — the last few audit entries, read straight out of a memorySink",
			"/boom — throws inside the handler; still logged (with the error), still propagates",
			"/audit — auditLog()'s running counters (admin command; open unless ADMIN_ID is set)",
		].join("\n"),
	),
);

bot.command("whoami", (ctx) => ctx.reply(`you are ${ctx.from?.id} in chat ${ctx.chat?.id}`));

bot.command("secret", async (ctx) => {
	const before = {
		chat_id: ctx.chat?.id,
		secret_token: "sk_live_abc123",
		phone_number: "+15551234567",
		note: "this field isn't a known secret key, so it passes through unmasked",
	};
	const after = applyRedaction(before);

	console.log("[demo] before redaction:", before);
	console.log("[demo] after  redaction:", after);
	await ctx.reply(
		"check the terminal — secret_token and phone_number just got masked, `note` didn't",
	);
});

bot.command("status", async (ctx) => {
	const lines = recent.events
		.slice(-5)
		.map((event) => `${event.kind}${"method" in event ? ` ${event.method}` : ""}`);
	await ctx.reply(lines.length > 0 ? lines.join("\n") : "no audit entries yet");
});

bot.command("boom", () => {
	throw new Error("deliberate crash — check the terminal for the update event's `error` field");
});

bot.start();
