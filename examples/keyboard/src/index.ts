import { createBot, InlineKeyboard, Keyboard } from "yaebal";

// a tour of every @yaebal/keyboard feature. each command builds one kind of markup.
//
//   pnpm --filter @yaebal/example-keyboard dev   (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/keyboard/.env first (copy .env.example)");
	process.exit(1);
}

// the command menu telegram shows in the "/" picker — registered on start
const COMMANDS = [
	{ command: "start", description: "text/style/url/row — the basics" },
	{ command: "gallery", description: "every remaining inline button type" },
	{ command: "grid", description: "buttons from an array — add() + columns()" },
	{ command: "contact", description: "contact/location/poll/web app (reply keyboard)" },
	{ command: "profile", description: "request user/chat/managed bot (reply keyboard)" },
	{ command: "hide", description: "Keyboard.remove()" },
	{ command: "ask", description: "Keyboard.forceReply()" },
	{ command: "help", description: "list every command" },
];

// items for the /grid demo — anything can be mapped into buttons this way
const FRUITS = ["apple", "banana", "cherry", "date", "fig", "grape"];

// the exact prompt /ask sends — used to recognize the reply to it
const ASK_PROMPT = "what's your name?";

const bot = createBot(token)
	// text, style(), url(), row() — the basics. reply_markup takes the builder
	// itself here: InlineKeyboard implements toJSON(), and Api stringifies
	// reply_markup, so the trailing .build() below is optional (both work).
	.command("start", (ctx) =>
		ctx.reply("👋 welcome — try /gallery, /grid, /contact, /profile, /hide, /ask or /help.", {
			reply_markup: new InlineKeyboard()
				.text("👍 like", "vote:up")
				.text("👎 dislike", "vote:down")
				.style("danger") // styles the button just added — "👎 dislike"
				.row()
				.url("⭐ star it on github", "https://github.com/neverlane/yaebal"),
		}),
	)
	.callbackQuery(/^vote:(up|down)$/, async (ctx) => {
		const liked = ctx.callbackQuery.data === "vote:up";
		await ctx.answer(liked ? "thanks! 👍" : "noted 👎");
	})

	// every inline button type that's safe to send in a plain message.
	// .pay()/.game()/.icon() are demoed separately below — telegram rejects them
	// outside their specific requirements (see the comment further down).
	.command("gallery", (ctx) => {
		const kb = new InlineKeyboard()
			.webApp("open web app", "https://core.telegram.org/bots/webapps")
			.row()
			.login("log in", "https://core.telegram.org/widgets/login") // needs a domain linked via @BotFather
			.row()
			.switchInline("share in a chat", "yaebal")
			.row()
			.switchInlineCurrentChat("insert here", "yaebal")
			.row()
			.switchInlineChosenChat("share in a group", { allow_group_chats: true })
			.row()
			.copyText("copy install command", "pnpm add @yaebal/keyboard")
			.build();

		// .pay()/.game() are only valid as the first button of the first row, and
		// only inside an invoice/game message. .icon() needs a *numeric* custom
		// emoji id (not a literal emoji), and only renders for bots that bought a
		// Fragment username or whose owner has Telegram Premium — building all
		// three here just to show the api, not sending them.
		console.log("pay button:", JSON.stringify(new InlineKeyboard().pay("5 ⭐").build()));
		console.log("game button:", JSON.stringify(new InlineKeyboard().game("play").build()));
		console.log(
			"icon button:",
			JSON.stringify(
				new InlineKeyboard().text("starred", "noop").icon("5368324170671202286").build(),
			),
		);

		return ctx.reply(
			"every inline button type (minus pay/game/icon — see the bot's console log):",
			{
				reply_markup: kb,
			},
		);
	})

	// buttons built from an array: add() + the static, instance-free builders,
	// wrapped into rows of 3 by columns().
	.command("grid", (ctx) =>
		ctx.reply("pick a fruit:", {
			reply_markup: new InlineKeyboard()
				.columns(3)
				.add(...FRUITS.map((fruit) => InlineKeyboard.text(fruit, `pick:${fruit}`)))
				.build(),
		}),
	)
	.callbackQuery(/^pick:/, async (ctx) => {
		const fruit = ctx.callbackQuery.data?.slice("pick:".length);
		await ctx.answer(`you picked ${fruit} 🍽️`);
	})

	// reply keyboard: requestContact/requestLocation/requestPoll/webApp, resized + oneTime.
	.command("contact", (ctx) =>
		ctx.reply("share something with the bot:", {
			reply_markup: new Keyboard()
				.requestContact("📱 share phone")
				.requestLocation("📍 share location")
				.row()
				.requestPoll("📊 create a poll", "quiz")
				.webApp("🌐 open web app", "https://core.telegram.org/bots/webapps")
				.resized()
				.oneTime()
				.build(),
		}),
	)
	.on("message:contact", (ctx) => ctx.reply(`got your contact: ${ctx.contact?.phone_number}`))
	.on("message:location", (ctx) =>
		ctx.reply(`got your location: ${ctx.location?.latitude}, ${ctx.location?.longitude}`),
	)
	.on("message:poll", (ctx) => ctx.reply(`got your poll: "${ctx.poll?.question}"`))

	// reply keyboard: requestUsers/requestChat/requestManagedBot, persistent +
	// placeholder + selective. requestId only needs to be unique within this keyboard.
	.command("profile", (ctx) =>
		ctx.reply("pick one:", {
			reply_markup: new Keyboard()
				.requestUsers("👤 pick a user", 1, { max_quantity: 1, user_is_bot: false })
				.row()
				.requestChat("📢 pick a channel", 2, /* isChannel */ true, { request_title: true })
				.row()
				.requestChat("👥 pick a group", 3, /* isChannel */ false)
				.row()
				.requestManagedBot("🤖 create a bot for me", 4, { suggested_name: "My Shop Bot" })
				.persistent()
				.placeholder("pick something above")
				.selective()
				.build(),
		}),
	)
	.on("message:users_shared", (ctx) => {
		const shared = ctx.users_shared;
		return ctx.reply(`request #${shared?.request_id}: got ${shared?.users.length} user(s)`);
	})
	.on("message:chat_shared", (ctx) => {
		const shared = ctx.chat_shared;
		return ctx.reply(`request #${shared?.request_id}: got chat ${shared?.chat_id}`);
	})
	.on("message:managed_bot_created", (ctx) => {
		const bot_ = ctx.managed_bot_created?.bot;
		return ctx.reply(`created @${bot_?.username} — fetch its token with getManagedBotToken`);
	})
	// same event, delivered as its own update instead of a message field
	.on("managed_bot", (ctx) => {
		const updated = ctx.update.managed_bot;
		console.log(`managed_bot update: @${updated?.bot.username}, owner ${updated?.user.id}`);
	})

	// Keyboard.remove() — static, no builder instance needed
	.command("hide", (ctx) => ctx.reply("hiding the keyboard.", { reply_markup: Keyboard.remove() }))

	// Keyboard.forceReply() — static, and a matching handler for the round trip
	.command("ask", (ctx) =>
		ctx.reply(ASK_PROMPT, {
			reply_markup: Keyboard.forceReply({ input_field_placeholder: "your name" }),
		}),
	)
	.on("message:text", (ctx, next) => {
		if (ctx.reply_to_message?.text !== ASK_PROMPT) return next();
		return ctx.reply(`nice to meet you, ${ctx.text}! 🎉`);
	})

	.command("help", (ctx) =>
		ctx.reply(COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n")),
	)
	// anything else: echo it back
	.on("message:text", (ctx) => ctx.reply(`you said: ${ctx.text}`))

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
