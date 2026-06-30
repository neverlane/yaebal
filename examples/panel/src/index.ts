import { autoRetry } from "@yaebal/again";
import { Bot, type UpdateName } from "@yaebal/core";
import { MemoryPanelStore, panelHandler, recorder, recordOutgoing } from "@yaebal/panel";
import { serve } from "@yaebal/panel/serve";

// a full tour of @yaebal/panel: live operator dashboard with media in both directions.
//
//  pnpm --filter @yaebal/example-panel dev (needs BOT_TOKEN + PANEL_TOKEN in .env)
//  open http://localhost:3000 and paste PANEL_TOKEN on the login screen
const allowedUpdates: UpdateName[] = [
	"message",
	"callback_query",
	"message_reaction",
	"message_reaction_count",
	"poll_answer",
	"my_chat_member",
	"chat_member",
];

const bot = new Bot(process.env.BOT_TOKEN ?? "", { allowedUpdates });

// in-memory store (lost on restart). swap for the persistent sqlite one:
//  import { SqlitePanelStore } from "@yaebal/panel/sqlite";
//  const store = new SqlitePanelStore({ path: "./panel.db" });
const store = new MemoryPanelStore();

autoRetry(bot.api);

// 1. record INCOMING private updates: messages, media, callbacks, reactions and poll answers.
bot.install(recorder(store));

// 2. record OUTGOING replies the bot sends from its own handlers (so they appear too).
//  pairs with recordSends:false below to avoid double-logging panel replies.
recordOutgoing(bot.api, store);

const demoKeyboard = {
	inline_keyboard: [
		[
			{ text: "open media demo", callback_data: "panel:media" },
			{ text: "panel docs", url: "https://yaebal.pages.dev/docs/plugins/panel" },
		],
		[{ text: "record callback event", callback_data: "panel:callback" }],
	],
};

bot.command("start", (ctx) =>
	ctx.reply(
		[
			"panel demo is running.",
			"try text, photos, documents, voice notes, videos, albums, reactions and the buttons below.",
			"open the browser panel to see avatars, keyboard previews, media cards and event rows.",
		].join("\n"),
		{ reply_markup: demoKeyboard },
	),
);

bot.command("demo", async (ctx) => {
	await ctx.reply("Inline keyboard and callback preview", { reply_markup: demoKeyboard });

	const chatId = ctx.chat?.id;
	if (chatId === undefined) return;

	await ctx.api.call("sendPoll", {
		chat_id: chatId,
		question: "which panel card should you inspect first?",
		options: ["media viewer", "voice style", "callback event"],
		is_anonymous: false,
	});
	await ctx.api.call("sendDice", { chat_id: chatId });
});

bot.on("callback_query:data", async (ctx) => {
	const data = ctx.callbackQuery?.data ?? "callback";
	await ctx.answerCallbackQuery({ text: "recorded in the panel" });

	if (data === "panel:media") {
		await ctx.send(
			"send a photo, video, voice note or album. the panel will render it with the media viewer and styled cards.",
		);
		return;
	}

	await ctx.send(`callback data: ${data}`);
});

bot.on("message:text", (ctx) => ctx.reply(`echo: ${ctx.text}`));

// echo a photo straight back by file_id; shows up both ways in the panel.
bot.on("message:photo", (ctx) => {
	const photos = ctx.message?.photo;
	const fileId = photos?.[photos.length - 1]?.file_id;

	if (fileId) ctx.sendPhoto(fileId, { caption: "photo preview card" });
});

bot.on("message:video", (ctx) => {
	const fileId = ctx.message?.video?.file_id;
	if (fileId && ctx.chat?.id !== undefined) {
		ctx.api.call("sendVideo", {
			chat_id: ctx.chat.id,
			video: fileId,
			caption: "video preview card",
		});
	}
});

bot.on("message:voice", (ctx) => {
	const fileId = ctx.message?.voice?.file_id;
	if (fileId && ctx.chat?.id !== undefined) {
		ctx.api.call("sendVoice", {
			chat_id: ctx.chat.id,
			voice: fileId,
			caption: "voice message style",
		});
	}
});

bot.on("message:document", (ctx) =>
	ctx.reply("document stored in the panel with file name and mime preview"),
);

// 3. serve the panel — login page, realtime SSE, media proxy, file uploads
const handler = panelHandler(bot.api, store, {
	token: process.env.PANEL_TOKEN ?? "",
	recordSends: false, // recordOutgoing already logs panel replies
});

serve(handler, {
	port: 3000,
	onListen: ({ port }) => console.log(`panel: http://localhost:${port} (token = PANEL_TOKEN)`),
});

bot.onStart((info) =>
	console.log(`bot started @${info.username} - DM it, then watch the panel update live`),
);

await bot.start();
