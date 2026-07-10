import { Bot } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";
import {
	dedupe,
	deleteWebhook,
	getWebhookInfo,
	sequentialize,
	serve,
	setWebhook,
} from "@yaebal/web";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/webhook-edge/.env first (copy .env.example)");
	process.exit(1);
}

const secretToken = process.env.WEBHOOK_SECRET || "dev-secret";
const port = Number(process.env.PORT ?? 8080);
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");

const bot = new Bot(token, { allowedUpdates: ["message", "callback_query"] });

// production hardening: order updates per chat, and drop telegram's redeliveries.
// install these before any state plugin.
bot.use(sequentialize());
bot.use(dedupe());

bot
	.command("start", (ctx) =>
		ctx.reply("webhook edge bot is live. press the button or send /where.", {
			reply_markup: new InlineKeyboard().text("answer over webhook", "edge:pong").build(),
		}),
	)
	.command("where", (ctx) => ctx.reply("this update came through a fetch-style webhook handler."))
	.command("status", async (ctx) => {
		const info = await getWebhookInfo(bot);
		return ctx.reply(
			`url: ${info.url || "(none)"}\npending: ${info.pending_update_count}\nlast error: ${info.last_error_message ?? "none"}`,
		);
	})
	.command("deletewebhook", async (ctx) => {
		await deleteWebhook(bot, { dropPendingUpdates: false });
		return ctx.reply("webhook deleted. long polling can take over now.");
	})
	.callbackQuery("edge:pong", async (ctx) => {
		await ctx.answerCallbackQuery({ text: "pong from edge" });
		await ctx.send("callback handled through webhook.");
	});

// the same fetch handler edge runtimes use — export it for cloudflare/deno/bun/vercel:
//   export default { fetch: webhook(bot, { secretToken }) };
// here we run it as a local node server via serve() (which works on node too).
const server = await serve(bot, { port, secretToken, path: "/telegram" });
console.log(`webhook edge local server: ${server.url}/telegram`);

process.once("SIGINT", () => {
	void server.stop().then(() => process.exit(0));
});

if (publicUrl) {
	await setWebhook(bot, `${publicUrl}/telegram`, {
		secretToken,
		allowedUpdates: ["message", "callback_query"],
		dropPendingUpdates: true,
	}).catch((error) => console.error("setWebhook failed", error));
	console.log(`telegram webhook target: ${publicUrl}/telegram`);
}
