import { Bot, media } from "@yaebal/core";

/** a bot the bundler test compiles. kept tiny so the assertion reads the output. */
export const bot = new Bot("123:test");

bot.command("start", (ctx) => ctx.reply("hello"));
bot.on("callback_query:data", async (ctx) => {
	await ctx.answerCallbackQuery();
	await ctx.reply("clicked");
});
bot.on("message:photo", (ctx) => ctx.sendPhoto(media.buffer(new Uint8Array([1, 2, 3]), "a.jpg")));
