import { autoRetry } from "@yaebal/again";
import {
	type CannedResponse,
	handoff,
	MemoryPanelStore,
	type PanelOperator,
	panelHandler,
	recorder,
	recordOutgoing,
} from "@yaebal/panel";
import { serve } from "@yaebal/panel/serve";
import { createBot, type UpdateName } from "yaebal";

// the full tour of @yaebal/panel: live operator dashboard with handoff, multi-operator
// login + audit trail, reply/edit/delete, search, canned responses, export, a typing
// indicator, admin notifications, and media in both directions.
//
//  pnpm --filter @yaebal/example-panel dev
//    needs BOT_TOKEN + PANEL_TOKEN in .env
//    optional: ALICE_TOKEN + BOB_TOKEN instead of PANEL_TOKEN -> multi-operator login
//    optional: ADMIN_CHAT_ID -> your own DM, pinged when a message arrives with no panel open
//  open http://localhost:3000 and log in
const allowedUpdates: UpdateName[] = [
	"message",
	"edited_message",
	"callback_query",
	"message_reaction",
	"message_reaction_count",
	"poll_answer",
	"my_chat_member",
	"chat_member",
];

const bot = createBot(process.env.BOT_TOKEN ?? "", { allowedUpdates });

// in-memory store (lost on restart). swap for a persistent one:
//
//  import { SqlitePanelStore } from "@yaebal/panel/sqlite";
//  const store = new SqlitePanelStore({ path: "./panel.db" }); // fast, FTS5 search, node 22.5+
//
//  import { MemoryStorage } from "@yaebal/sklad"; // or redisStorage/kvStorage/sqliteStorage
//  import { skladPanelStore } from "@yaebal/panel/sklad";
//  const store = skladPanelStore(new MemoryStorage()); // any sklad adapter — redis, kv, edge
const store = new MemoryPanelStore();

autoRetry(bot.api);

// 1. record INCOMING private updates: messages, media, callbacks, reactions and poll answers.
//  widen to group/channel chats with `recorder(store, { chats: "all" })` or a predicate.
bot.install(recorder(store));

// 2. once an operator marks a chat "handled" in the panel, mute the bot's own handlers for
//  it until they release it back to "open" (or archive it) — must come before the handlers
//  registered below, since it's a guard that short-circuits the middleware chain.
bot.install(handoff(store));

// 3. record OUTGOING replies the bot sends from its own handlers (so they appear too).
//  pairs with recordSends:false below to avoid double-logging panel replies.
recordOutgoing(bot.api, store, {
	onError: (error, context) => console.error(`[panel:${context}]`, error),
});

const demoKeyboard = {
	inline_keyboard: [
		[
			{ text: "open media demo", callback_data: "panel:media" },
			{ text: "panel docs", url: "https://yaebal.mom/docs/plugins/panel" },
		],
		[{ text: "record callback event", callback_data: "panel:callback" }],
	],
};

// a reply keyboard whose buttons ask telegram to attach the user's contact/location — the
// panel renders both as `[contact]`/`[location]` placeholders in the timeline.
const shareKeyboard = {
	keyboard: [
		[{ text: "share my location", request_location: true }],
		[{ text: "share my contact", request_contact: true }],
	],
	resize_keyboard: true,
	one_time_keyboard: true,
};

bot.command("start", (ctx) =>
	ctx.reply(
		[
			"panel demo is running.",
			"",
			"try text, photos, documents, voice notes, videos, albums, reactions, polls and the",
			"buttons below — everything shows up in the panel, in real time.",
			"",
			"in the panel you can: hand this chat off from the bot to yourself (status pill),",
			"assign it, pin it, reply to a specific message, edit or delete something you sent,",
			"search across every conversation, export this one, and pick a canned response from",
			"the composer's quick-reply menu.",
			"",
			"edit a message you just sent — the panel patches it in place instead of duplicating it.",
			"try /demo for polls, dice and location/contact sharing.",
		].join("\n"),
		{ reply_markup: demoKeyboard },
	),
);

bot.command("demo", async (ctx) => {
	await ctx.reply("Inline keyboard and callback preview", { reply_markup: demoKeyboard });

	await ctx.sendPoll(
		"which panel feature should you try first?",
		["handoff", "search", "canned responses", "reply/edit/delete"],
		{ is_anonymous: false },
	);
	await ctx.sendDice();

	await ctx.reply("share your location or contact — both render as previews in the panel:", {
		reply_markup: shareKeyboard,
	});
});

bot.on("callback_query:data", async (ctx) => {
	const data = ctx.callbackQuery?.data ?? "callback";
	await ctx.answer("recorded in the panel");

	if (data === "panel:media") {
		await ctx.send(
			"send a photo, video, voice note or album. the panel will render it with the media viewer and styled cards.",
		);
		return;
	}

	await ctx.send(`callback data: ${data}`);
});

// echo replies AS a reply to the original message, so the panel's "replying to ..." strip
// shows up in the timeline too.
bot.on("message:text", (ctx) =>
	ctx.reply(`echo: ${ctx.text}`, {
		reply_parameters: { message_id: ctx.message?.message_id ?? 0 },
	}),
);

bot.on("message:location", (ctx) =>
	ctx.reply(`got it — ${ctx.message?.location?.latitude}, ${ctx.message?.location?.longitude}`, {
		reply_markup: { remove_keyboard: true },
	}),
);

bot.on("message:contact", (ctx) =>
	ctx.reply(`thanks, ${ctx.message?.contact?.first_name ?? "friend"}!`, {
		reply_markup: { remove_keyboard: true },
	}),
);

// echo a photo straight back by file_id; shows up both ways in the panel.
bot.on("message:photo", (ctx) => {
	const fileId = ctx.photo?.[ctx.photo.length - 1]?.file_id;
	if (fileId) ctx.sendPhoto(fileId, { caption: "photo preview card" });
});

bot.on("message:video", (ctx) => {
	const fileId = ctx.video?.file_id;
	if (fileId) ctx.sendVideo(fileId, { caption: "video preview card" });
});

bot.on("message:voice", (ctx) => {
	const fileId = ctx.voice?.file_id;
	if (fileId) ctx.sendVoice(fileId, { caption: "voice message style" });
});

bot.on("message:document", (ctx) =>
	ctx.reply("document stored in the panel with file name and mime preview"),
);

// 4. multi-operator login: set ALICE_TOKEN + BOB_TOKEN to demo named logins and the audit
//  trail (every panel-sent message records who sent it). falls back to a single shared
//  PANEL_TOKEN when those aren't set.
const operators: PanelOperator[] | undefined =
	process.env.ALICE_TOKEN && process.env.BOB_TOKEN
		? [
				{ name: "alice", token: process.env.ALICE_TOKEN },
				{ name: "bob", token: process.env.BOB_TOKEN },
			]
		: undefined;

const cannedResponses: CannedResponse[] = [
	{ label: "Greeting", text: "Hey! Thanks for reaching out — how can I help?" },
	{ label: "Hours", text: "We're online 9am-6pm UTC, Monday to Friday." },
	{ label: "Closing", text: "Glad that's sorted — reach out anytime!" },
];

// 5. serve the panel — login, realtime SSE, handoff, search, export, media proxy, uploads.
const handler = panelHandler(bot.api, store, {
	...(operators ? { operators } : { token: process.env.PANEL_TOKEN ?? "" }),
	recordSends: false, // recordOutgoing already logs panel replies
	cannedResponses,
	// ping your own DM when a message arrives and nobody has the panel open — set this to
	// your telegram user/chat id to try it.
	...(process.env.ADMIN_CHAT_ID ? { notifyChatId: process.env.ADMIN_CHAT_ID } : {}),
	rateLimit: { max: 10, windowMs: 60_000 },
	maxUploadBytes: 25 * 1024 * 1024,
	sessionTtlMs: 12 * 60 * 60 * 1000,
	onError: (error, context) => console.error(`[panel:${context}]`, error),
});

serve(handler, {
	port: 3000,
	onListen: ({ port }) => {
		const mode = operators ? `${operators.length} operators` : "single PANEL_TOKEN";
		console.log(`panel: http://localhost:${port} (${mode})`);
	},
});

bot.onStart((info) =>
	console.log(`bot started @${info.username} - DM it, then watch the panel update live`),
);

await bot.start();
