import { autoAnswer } from "@yaebal/auto-answer";
import { createBot, InlineKeyboard } from "yaebal";

// a tour of @yaebal/auto-answer: the "deadline" default (a handler's own alert always wins
// the race, a forgotten handler still gets a fallback ack), skipAutoAnswer() for a callback
// answered later from off to the side, and filter() for callbacks another plugin already
// answers its own way.
//
//   pnpm --filter @yaebal/example-auto-answer dev   (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/auto-answer/.env first (copy .env.example)");
	process.exit(1);
}

const COMMANDS = [
	{ command: "start", description: "a handler that answers fast — its own alert wins" },
	{ command: "forgot", description: "a handler that never answers — the fallback fires" },
	{ command: "queue", description: "skipAutoAnswer() + answering later from a queued job" },
	{ command: "raw", description: "filter() — a callback another plugin answers itself" },
	{ command: "help", description: "list every command" },
];

const bot = createBot(token)
	.install(
		autoAnswer({
			// "deadline" is the default — spelled out here for the tour. a handler has 1.5s to
			// answer on its own before the plugin fills the gap with an empty ack.
			mode: "deadline",
			timeout: 1500,
			// the "raw:" callbacks below answer themselves — let them.
			filter: (ctx) => !ctx.callbackQuery.data?.startsWith("raw:"),
			onAnswer: (ctx) => console.log("auto-answered", ctx.callbackQuery.id),
			onError: (error, ctx) => console.warn("auto-answer failed", ctx.callbackQuery.id, error),
		}),
	)

	.command("start", (ctx) =>
		ctx.reply("a handler that answers fast keeps its own alert — try it:", {
			reply_markup: new InlineKeyboard().text("show alert", "alert:go"),
		}),
	)
	.callbackQuery("alert:go", (ctx) =>
		// well inside the 1.5s deadline — this alert reaches the client untouched, the plugin
		// never gets a chance to fire its own empty ack.
		ctx.answerCallbackQuery({ text: "still yours to control ✨", show_alert: true }),
	)

	.command("forgot", (ctx) =>
		ctx.reply("this handler never calls answerCallbackQuery — the spinner still clears:", {
			reply_markup: new InlineKeyboard().text("press me", "forgot:go"),
		}),
	)
	.callbackQuery("forgot:go", (ctx) => ctx.reply("handled — no answerCallbackQuery call in sight"))

	.command("queue", (ctx) =>
		ctx.reply("archiving happens off to the side — the plugin won't fill the gap for this one:", {
			reply_markup: new InlineKeyboard().text("archive", "queue:go"),
		}),
	)
	.callbackQuery("queue:go", async (ctx) => {
		// tell the plugin this update is spoken for, then answer whenever the "job" finishes —
		// well past the deadline, which would otherwise have already answered for it.
		ctx.skipAutoAnswer();
		await ctx.reply("queued for archiving…");

		setTimeout(() => {
			void ctx.answerCallbackQuery({ text: "archived ✅" });
		}, 2000);
	})

	.command("raw", (ctx) =>
		ctx.reply("this callback matches the filter above — it answers itself:", {
			reply_markup: new InlineKeyboard().text("raw button", "raw:go"),
		}),
	)
	.callbackQuery("raw:go", (ctx) =>
		ctx.answerCallbackQuery({ text: "answered outside the plugin, by filter() design" }),
	)

	.command("help", (ctx) =>
		ctx.reply(COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n")),
	)

	.onError((error, ctx) => {
		console.error(`update ${ctx.update.update_id} failed:`, error);
	})
	.onStart(async (info) => {
		// publish the command menu so it shows up in the telegram "/" picker
		await bot.api.call("setMyCommands", { commands: COMMANDS }).catch(() => {});
		console.log(`✨ @${info.username} is live — DM it /start`);
	});

// graceful shutdown
process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
