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

// i18n tables; ctx.t / ctx.changeLanguage become available after install
const locales = {
	en: { hello: "hi {who}! switched to English." },
	ru: { hello: "привет {who}! язык переключён на русский." },
};

// a step-by-step wizard (scenes): name → age
const wizard: SceneDef = {
	enter: (ctx) => ctx.reply("как тебя зовут?"),
	steps: [
		(ctx) => {
			ctx.scene.next();
			return ctx.reply(`привет, ${ctx.text}! сколько тебе лет?`);
		},
		(ctx) => {
			ctx.scene.leave();
			return ctx.reply(`${ctx.text} лет — записал ✨`);
		},
	],
};

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN env var first");
	process.exit(1);
}

// a trivial context plugin — exercises install() and the typed-dependency flow
const stamp: Plugin<Context, { startedAt: Date }> = (c) => c.decorate({ startedAt: new Date() });

// typed callback_data: vote.pack({ choice }) → string, vote.unpack(data) → { choice } | undefined
const vote = callbackData("vote", { choice: String });

// a two-window dialog (morda): main ↔ settings, with stack navigation
const menu: DialogDef = {
	main: () => ({
		text: "🏠 Главное меню",
		keyboard: [
			[switchTo("⚙️ Настройки", "settings")],
			[
				button("🔔 Пинг", {
					id: "ping",
					onClick: (c) => c.answerCallbackQuery({ text: "понг 🏓" }),
				}),
			],
		],
	}),
	settings: () => ({ text: "⚙️ Настройки", keyboard: [[back("← Назад")]] }),
};

const bot = new Bot(token)
	// install a plugin; `startedAt` now flows into every handler's context type
	.install(stamp)
	// per-chat session; `ctx.session` is now typed { count: number }
	.install(session({ initial: () => ({ count: 0 }) }))
	// dialogs engine; `ctx.dialog` (start/push/back) now available
	.install(dialogs(menu))
	// i18n; `ctx.t` / `ctx.changeLanguage` now available (powers useTranslation)
	.install(i18n({ defaultLocale: "ru", locales }))
	// scenes (wizards) and prompt (one-shot next message)
	.install(scenes({ register: wizard }))
	.install(prompt())
	// async per-request enrichment — types flow into handlers below
	.derive((ctx) => ({
		who: ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name ?? "аноним"),
	}))
	// command router: matches /start, strips @botname, parses args
	.command("start", (ctx) =>
		ctx.send(
			format`привет, ${bold(ctx.who)}! 🐴
это ${italic("YAEBAL")} — yet another telegram bot api library.
команды: /start, /count. или жми кнопку.`,
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
		return ctx.reply(`ты звал /count ${ctx.session.count} раз(а)`);
	})
	// open the morda dialog
	.command("menu", (ctx) => ctx.dialog.start("main"))
	// media: send a photo by URL (or media.path(...) / media.buffer(...))
	.command("photo", (ctx) =>
		ctx.sendPhoto(media.url("https://picsum.photos/400"), { caption: "случайная картинка" }),
	)
	// i18n: toggle locale and reply in the new language
	.command("lang", async (ctx) => {
		await ctx.changeLanguage(ctx.locale === "ru" ? "en" : "ru");
		return ctx.reply(ctx.t("hello", { who: ctx.who }));
	})
	// scenes: start the wizard
	.command("register", (ctx) => ctx.scene.enter("register"))
	// prompt: ask once, handle the next message
	.command("name", (ctx) => ctx.prompt("как тебя зовут?", (c) => c.reply(`привет, ${c.text}!`)))
	// hears: regex match on text, exposes ctx.match
	.hears(/^(пинг|ping)$/i, (ctx) => ctx.reply("понг"))
	// @yaebal/filters: composed filter — /help only in private chats, with fmt html reply
	.filter(and(isPrivate, command("help")), (ctx) =>
		ctx.send(
			html`<b>доступные команды</b>\n/start /count /menu /photo /lang /register /name /help`,
		),
	)
	// @yaebal/filters: regex filter — exposes ctx.match, replies with html bold via @yaebal/fmt
	.filter(regex(/^(привет|hello)/i), (ctx) =>
		ctx.send(html`<b>привет!</b> ты написал: <i>${ctx.match[0]}</i>`),
	)
	// filter query: only text messages; ctx.text is narrowed to string
	.on("message:text", (ctx) => ctx.reply(format`ты сказал: ${bold(ctx.text)}`))
	// typed callback buttons: only "vote:*" data, payload parsed via callback-data
	.callbackQuery(vote.pattern, async (ctx) => {
		const choice = vote.unpack(ctx.callbackQuery.data ?? "")?.choice;
		await ctx.answerCallbackQuery({ text: choice === "up" ? "лайк 👍" : "дизлайк 👎" });
	})
	.onError((error, ctx) => {
		console.error(`update ${ctx.update.update_id} failed:`, error);
	})
	.onStart((info) => {
		console.log(`✨ заведено: @${info.username}`);
	});

// retry on 429/flood-wait and transient 5xx, and throttle outgoing calls
autoRetry(bot.api);
throttle(bot.api);

// graceful shutdown
process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
