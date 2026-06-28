import { autoRetry } from "@yaebal/again";
import { Bot } from "@yaebal/core";
import { MemoryPanelStore, panelHandler, recordOutgoing, recorder } from "@yaebal/panel";
import { serve } from "@yaebal/panel/serve";

// a full tour of @yaebal/panel: live operator dashboard with media in both directions.
//
//   pnpm --filter @yaebal/example-panel dev   (needs BOT_TOKEN + PANEL_TOKEN in .env)
//   open http://localhost:3000 and paste PANEL_TOKEN on the login screen

const bot = new Bot(process.env.BOT_TOKEN ?? "");

// in-memory store (lost on restart). swap for the persistent sqlite one:
//   import { SqlitePanelStore } from "@yaebal/panel/sqlite";
//   const store = new SqlitePanelStore({ path: "./panel.db" });
const store = new MemoryPanelStore();

autoRetry(bot.api);

// 1. record INCOMING private messages — text, captions, and media (photo/doc/voice/album)
bot.install(recorder(store));

// 2. record OUTGOING replies the bot sends from its own handlers (so they appear too).
//    pairs with recordSends:false below to avoid double-logging panel replies.
recordOutgoing(bot.api, store);

bot.command("start", (ctx) =>
	ctx.reply("hello from yaebal 👋 — send me text, a photo, a document or a voice note"),
);

bot.on("message:text", (ctx) => ctx.reply(`echo: ${ctx.text}`));

// echo a photo straight back by file_id → shows up both ways in the panel
bot.on("message:photo", (ctx) => {
	const photos = ctx.message?.photo;
	const fileId = photos?.[photos.length - 1]?.file_id;
	if (fileId) ctx.sendPhoto(fileId, { caption: "got your photo 📸" });
});

// 3. serve the panel — login page, realtime SSE, media proxy, file uploads
const handler = panelHandler(bot.api, store, {
	token: process.env.PANEL_TOKEN ?? "",
	recordSends: false, // recordOutgoing already logs panel replies
});

serve(handler, {
	port: 3000,
	onListen: ({ port }) => console.log(`🖥️  panel:  http://localhost:${port}   (token = PANEL_TOKEN)`),
});

bot.start().then(() => console.log("🤖 bot started — DM it, then watch the panel update live"));
