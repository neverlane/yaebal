import { Bot, bold, code, format } from "@yaebal/core";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/core-echo/.env first (copy .env.example)");
	process.exit(1);
}

// bare @yaebal/core: middleware engine, filter queries, ctx.send/reply, raw typed api client.
// no generated contexts here — ctx.react()/ctx.answer() sugar needs @yaebal/contexts (or yaebal).
const bot = new Bot(token, { allowedUpdates: ["message"] })
	.derive(() => ({ receivedAt: new Date() }))
	.command("start", (ctx) =>
		ctx.send(
			format`${bold("core echo")} — a bot on bare @yaebal/core.
send any text and it comes back; try ${code("/me")} and ${code("/react")}.`,
		),
	)
	.command("me", async (ctx) => {
		const me = await ctx.api.getMe();
		return ctx.reply(`i am @${me.username} (id ${me.id})`);
	})
	.command("react", async (ctx) => {
		// core has no ctx.react() — that shortcut is generated in @yaebal/contexts.
		// the raw passthrough takes any Bot API method, current or future.
		await ctx.api.call("setMessageReaction", {
			chat_id: ctx.chat?.id,
			message_id: ctx.message?.message_id,
			reaction: [{ type: "emoji", emoji: "👍" }],
		});
	})
	.on("message:text", (ctx) => ctx.reply(`echo at ${ctx.receivedAt.toISOString()}: ${ctx.text}`))
	.onStart((info) => console.log(`@${info.username} core echo is live`));

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
