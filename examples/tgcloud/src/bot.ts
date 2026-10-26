import { Bot } from "@yaebal/core";
import { and, callbackData, chatType, text } from "@yaebal/filters";
import { InlineKeyboard } from "@yaebal/keyboard";
import { bump } from "./db.js";

/**
 * the same bot locally and on telegram serverless.
 *
 * locally, `src/index.ts` long-polls it. `pnpm build` bundles this export into
 * `tgcloud/handlers/message.js` and `tgcloud/handlers/callback_query.js`, and
 * every `ctx.reply()` becomes an `sdk.api` call. `bump()` is inlined; its
 * `sdk` and `sdk/db` imports stay bare, which is the only thing the runtime
 * resolves.
 *
 * the token is a placeholder on purpose. serverless holds the real one and
 * never shows it to the bundle.
 */
export const bot = new Bot(process.env.BOT_TOKEN ?? "0:tgcloud");

const keyboard = () => new InlineKeyboard().text("ping the counter", "ping").build();

bot.command("start", (ctx) =>
	ctx.reply("tgcloud echo. send text and it comes back, with a count that survives restarts.", {
		reply_markup: keyboard(),
	}),
);

// every chat type, so `ctx.chat` is narrowed without dropping groups. `text`
// narrows `ctx.text`. commands are matched first, so `/count` never falls
// through to the echo.
const hasChat = chatType("private", "group", "supergroup", "channel");

bot.filter(and(hasChat, text), async (ctx) => {
	if (ctx.text === "/count") {
		const row = await bump(ctx.chat.id, "seen");
		return ctx.reply(`this chat: ${row.seen} echoed, ${row.pings} pings.`, {
			reply_markup: keyboard(),
		});
	}
	const row = await bump(ctx.chat.id, "seen");
	return ctx.reply(`echo #${row.seen}: ${ctx.text}`, { reply_markup: keyboard() });
});

// `on` records `callback_query` so the bundler emits that handler. `hasChat`
// narrows `ctx.chat`; the button's message is in that same chat, so no
// `message?.chat` probe.
bot.on("callback_query").filter(and(hasChat, callbackData("ping")), async (ctx) => {
	await ctx.answerCallbackQuery();
	const row = await bump(ctx.chat.id, "pings");
	return ctx.reply(`pong. ${row.pings} pings, ${row.seen} echoed.`, {
		reply_markup: keyboard(),
	});
});
