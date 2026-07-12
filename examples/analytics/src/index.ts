import { analytics, analyticsAdmin, consoleAdapter, memoryAdapter, p } from "@yaebal/analytics";
import { createBot, InlineKeyboard } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/analytics/.env first (copy .env.example)");
	process.exit(1);
}

// set ADMIN_ID in .env to your telegram user id to unlock /analytics; otherwise everyone can use
// it (fine for this demo, but pass a real allow-list/role check in production).
const adminId = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : undefined;

// query()-able, so /analytics can read it back — swap for sqliteAdapter/clickhouseAdapter in
// production; this one lives only in memory for the demo.
const store = memoryAdapter();

const bot = createBot(token)
	.install(
		analytics({
			// event names + properties are checked against this catalog — try renaming "purchase"
			// below to "purchse" and watch `tsc` catch it before you ever run the bot.
			events: {
				start: true, // declared, untyped — any properties allowed
				purchase: { props: p.object({ amount: p.number(), plan: p.optional(p.string()) }) },
			},
			adapters: [consoleAdapter(), store],
			// no manual ctx.track() needed for commands/buttons/messages — see the handlers below
			autoTrack: ["commands", "callback_queries", "messages"],
			// merged onto every event, typed and untyped alike
			context: (ctx) => ({ languageCode: ctx.from?.language_code }),
			onError: (error, event) => console.error("[analytics] failed:", event.name, error),
		}),
	)
	.install(
		analyticsAdmin({
			isAdmin: (ctx) => adminId === undefined || ctx.from?.id === adminId,
			adapter: store,
		}),
	);

bot.command("start", (ctx) => {
	ctx.track("start", { source: "deeplink" });
	return ctx.reply(
		"analytics demo — try /buy, /identify, /menu, /analytics (admin report), or just send a message.\n\n" +
			"autoTrack is on for commands, buttons, and messages, so most of what you do here gets " +
			"tracked without a single ctx.track() call.",
	);
});

bot.command("buy", (ctx) => {
	// name + props type-checked against the `events` catalog above
	ctx.track("purchase", { amount: 9, plan: "pro" });
	return ctx.reply("thanks! logged as a typed `purchase` event (see the console).");
});

bot.command("identify", (ctx) => {
	ctx.identify({ plan: "pro", locale: ctx.from?.language_code });
	return ctx.reply(
		"identified you to every adapter that supports it (posthog-style person props).",
	);
});

bot.command("menu", (ctx) =>
	ctx.reply("press the button — the click is auto-captured too", {
		reply_markup: new InlineKeyboard().text("ping", "ping").build(),
	}),
);

bot.callbackQuery("ping", async (ctx) => {
	await ctx.answerCallbackQuery();
	await ctx.reply("pong");
});

bot.on("message:text", (ctx) =>
	ctx.reply(`you said: ${ctx.text} (auto-tracked as message_received)`),
);

bot.onStart(() =>
	console.log("bot ready — analytics.flush() will run on bot.onStop automatically"),
);

bot.start();
