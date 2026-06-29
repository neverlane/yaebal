import { autoRetry } from "@yaebal/again";
import { callbackData } from "@yaebal/callback-data";
import { Bot, type Context, type Plugin, bold, format, italic, media } from "@yaebal/core";
import { and, command, isPrivate, regex } from "@yaebal/filters";
import { html } from "@yaebal/fmt";
import { i18n } from "@yaebal/i18n";
import { InlineKeyboard } from "@yaebal/keyboard";
import { type DialogDef, back, button, dialogs, switchTo } from "@yaebal/morda";
import { prompt } from "@yaebal/prompt";
import { type SceneDef, scenes } from "@yaebal/scenes";
import { session } from "@yaebal/session";
import { throttle } from "@yaebal/throttle";

// a single-file tour of the yaebal stack. each command shows off one plugin.
//
//   pnpm --filter @yaebal/example-basic dev   (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/basic/.env first (copy .env.example)");
	process.exit(1);
}

// the command menu telegram shows in the "/" picker — registered on start
const COMMANDS = [
	{ command: "start", description: "greeting + an inline keyboard" },
	{ command: "count", description: "a per-chat counter (session)" },
	{ command: "menu", description: "a two-window dialog (morda)" },
	{ command: "photo", description: "send a photo by url (media)" },
	{ command: "lang", description: "toggle the locale (i18n)" },
	{ command: "register", description: "a name → age wizard (scenes)" },
	{ command: "name", description: "ask once, handle the reply (prompt)" },
	{ command: "help", description: "list every command" },
];

// i18n tables; ctx.t / ctx.changeLanguage become available after install
const locales = {
	en: { hello: "hi {who}! switched to english." },
	ru: { hello: "привет {who}! язык переключён на русский." },
};

// a step-by-step wizard (scenes): name → age
const wizard: SceneDef = {
	enter: (ctx) => ctx.reply("what's your name?"),
	steps: [
		(ctx) => {
			ctx.scene.next();
			return ctx.reply(`hi, ${ctx.text}! how old are you?`);
		},
		(ctx) => {
			ctx.scene.leave();
			return ctx.reply(`${ctx.text} — noted ✨`);
		},
	],
};

// a two-window dialog (morda): main ↔ settings, with stack navigation
const menu: DialogDef = {
	main: () => ({
		text: "🏠 main menu",
		keyboard: [
			[switchTo("⚙️ settings", "settings")],
			[
				button("🔔 ping", {
					id: "ping",
					onClick: (c) => c.answerCallbackQuery({ text: "pong 🏓" }),
				}),
			],
		],
	}),
	settings: () => ({ text: "⚙️ settings", keyboard: [[back("← back")]] }),
};

// a trivial context plugin — exercises install() and the typed-dependency flow
const stamp: Plugin<Context, { startedAt: Date }> = (c) => c.decorate({ startedAt: new Date() });

// typed callback_data: vote.pack({ choice }) → string, vote.unpack(data) → { choice } | undefined
const vote = callbackData("vote", { choice: String });

const bot = new Bot(token)
	// retry on 429/flood-wait and transient 5xx, and throttle outgoing calls
	.install(autoRetry())
	.install(throttle())
	// install a plugin; `startedAt` now flows into every handler's context type
	.install(stamp)
	// per-chat session; `ctx.session` is now typed { count: number }
	.install(session({ initial: () => ({ count: 0 }) }))
	// dialogs engine; `ctx.dialog` (start/push/back) now available
	.install(dialogs(menu))
	// i18n; `ctx.t` / `ctx.changeLanguage` now available
	.install(i18n({ defaultLocale: "en", locales }))
	// scenes (wizards) and prompt (one-shot next message)
	.install(scenes({ register: wizard }))
	.install(prompt())
	// async per-request enrichment — types flow into the handlers below
	.derive((ctx) => ({
		who: ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name ?? "stranger"),
	}))
	// command router: matches /start, strips @botname, parses args
	.command("start", (ctx) =>
		ctx.send(
			format`hey, ${bold(ctx.who)}! 🐴
this is ${italic("yaebal")} — Yet Another tElegram Bot Api Library.
try /help, or tap a button below.`,
			{
				reply_markup: new InlineKeyboard()
					.text("👍", vote.pack({ choice: "up" }))
					.text("👎", vote.pack({ choice: "down" }))
					.build(),
			},
		),
	)
	// session in action: a per-chat counter
	.command("count", (ctx) => {
		ctx.session.count++;
		return ctx.reply(`you've called /count ${ctx.session.count} time(s)`);
	})
	// open the morda dialog
	.command("menu", (ctx) => ctx.dialog.start("main"))
	// media: send a photo by URL (or media.path(...) / media.buffer(...))
	.command("photo", (ctx) =>
		ctx.sendPhoto(media.url("https://picsum.photos/400"), { caption: "a random picture" }),
	)
	// i18n: toggle locale and reply in the new language
	.command("lang", async (ctx) => {
		await ctx.changeLanguage(ctx.locale === "ru" ? "en" : "ru");
		return ctx.reply(ctx.t("hello", { who: ctx.who }));
	})
	// scenes: start the wizard
	.command("register", (ctx) => ctx.scene.enter("register"))
	// prompt: ask once, handle the next message
	.command("name", (ctx) => ctx.prompt("what's your name?", (c) => c.reply(`hi, ${c.text}!`)))
	// @yaebal/filters: composed filter — /help only in private chats, with an fmt html reply
	.filter(and(isPrivate, command("help")), (ctx) =>
		ctx.send(
			html`<b>commands</b>
${COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n")}`,
		),
	)
	// hears: regex match on text, exposes ctx.match
	.hears(/^(ping|пинг)$/i, (ctx) => ctx.reply("pong"))
	// @yaebal/filters: regex filter — exposes ctx.match, replies with html bold/italic via @yaebal/fmt
	.filter(regex(/^(hello|привет)/i), (ctx) =>
		ctx.send(html`<b>hello!</b> you wrote: <i>${ctx.match[0]}</i>`),
	)
	// filter query: only text messages; ctx.text is narrowed to string
	.on("message:text", (ctx) => ctx.reply(format`you said: ${bold(ctx.text)}`))
	// typed callback buttons: only "vote:*" data, payload parsed via callback-data
	.callbackQuery(vote.pattern, async (ctx) => {
		const choice = vote.unpack(ctx.callbackQuery.data ?? "")?.choice;
		await ctx.answerCallbackQuery({ text: choice === "up" ? "liked 👍" : "disliked 👎" });
	})
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
