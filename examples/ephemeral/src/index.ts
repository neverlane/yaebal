import { commands } from "@yaebal/commands";
import { type EphemeralControl, ephemeral, wrapEphemeralMessage } from "@yaebal/ephemeral";
import { type Context, createBot, InlineKeyboard } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/ephemeral/.env first (copy .env.example)");
	process.exit(1);
}

// the registry's handlers see ctx.replyEphemeral / ctx.sendEphemeral because the
// ephemeral() plugin is installed before cmd.plugin() below
type BotContext = Context & EphemeralControl;

const rollKeyboard = () => new InlineKeyboard().text("reroll", "reroll").text("dismiss", "dismiss");

const cmd = commands<BotContext>()
	// ephemeral(): the menu entry carries is_ephemeral — in groups telegram shows the
	// /roll invocation only to its sender, and the answer below stays private too
	.ephemeral("roll", "roll a die only you can see", async (ctx) => {
		// in a group: a real ephemeral message. in a private chat: a normal message
		// (already visible to just this user) behind the exact same handle.
		const msg = await ctx.replyEphemeral("rolling…");
		await msg.edit(`🎲 you rolled a ${1 + Math.floor(Math.random() * 6)}`, {
			reply_markup: rollKeyboard(),
		});
	})
	.ephemeral("me", "who telegram thinks you are", (ctx) =>
		ctx.replyEphemeral(
			[
				`id: ${ctx.from?.id}`,
				`name: ${ctx.from?.first_name}`,
				`premium: ${ctx.from?.is_premium ? "yes" : "no"}`,
			].join("\n"),
		),
	)
	// a normal command for contrast — this one lands in the group history for everyone
	.add("about", "what this bot demonstrates", (ctx) =>
		ctx.reply(
			[
				"a focused tour of @yaebal/ephemeral + @yaebal/commands:",
				"/roll and /me answer so only you see it (add me to a group to see the",
				"difference — in this private chat the fallback sends a normal message).",
				"see examples/ephemeral/src/index.ts.",
			].join("\n"),
		),
	);

const bot = createBot(token)
	.install(ephemeral({ onExpired: "ignore" }))
	.install(cmd.plugin())
	.on("callback_query", async (ctx) => {
		await ctx.answerCallbackQuery();

		// the buttons live on an ephemeral message — rebuild a handle from the
		// callback's message payload and keep editing it in place
		const message = ctx.callbackQuery.message;
		if (!message || !("ephemeral_message_id" in message)) return;
		if (message.ephemeral_message_id === undefined) return;

		const msg = wrapEphemeralMessage(ctx.api, message, { onExpired: "ignore" });
		if (ctx.callbackQuery.data === "dismiss") {
			await msg.delete(); // idempotent: false (not a crash) if it already expired
			return;
		}
		if (ctx.callbackQuery.data === "reroll") {
			await msg.edit(`🎲 you rolled a ${1 + Math.floor(Math.random() * 6)}`, {
				reply_markup: rollKeyboard(),
			});
		}
	})
	.onStart(async (info) => {
		// pushes is_ephemeral flags too — flipping a command to ephemeral repushes its menu
		const result = await cmd.sync(bot.api).catch(() => undefined);
		const status = result
			? `${result.pushed.length} pushed, ${result.skipped.length} unchanged`
			: "sync failed";
		console.log(`@${info.username} ephemeral tour is live — menus: ${status}`);
	});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
