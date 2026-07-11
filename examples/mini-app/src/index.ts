import { createServer } from "node:http";
import {
	attachMenuLink,
	miniApp,
	miniAppLink,
	parseWebAppData,
	validateAuthHeader,
	webAppInfo,
	webAppUrl,
} from "@yaebal/mini-app";
import { createBot, InlineKeyboard } from "yaebal";

// a tour of @yaebal/mini-app: HMAC + Ed25519 initData validation, a mini app's own http backend
// (Authorization: tma header), answerWebAppQuery, web_app_data, and link builders.
//
//   pnpm --filter @yaebal/example-mini-app dev   (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/mini-app/.env first (copy .env.example)");
	process.exit(1);
}

// swap for your own deployed (https) mini app — webAppUrl/webAppInfo refuse http.
const miniAppUrl = process.env.MINI_APP_URL || "https://example.com/app";
const backendPort = Number(process.env.BACKEND_PORT ?? 8787);

const COMMANDS = [
	{ command: "start", description: "open the mini app (inline button)" },
	{ command: "menubutton", description: "set this chat's persistent menu button" },
	{ command: "demo", description: "sign + validate a synthetic initData round trip" },
	{ command: "check", description: "validate a real initData you paste (HMAC)" },
	{
		command: "check3rd",
		description: "validate a real initData you paste (Ed25519, no bot token)",
	},
	{ command: "answer", description: "answerWebAppQuery for a pasted query_id" },
	{ command: "links", description: "print direct + attachment-menu links" },
	{ command: "help", description: "list every command" },
];

const bot = createBot(token)
	.install(miniApp({ botToken: token }))

	.command("start", (ctx) =>
		ctx.reply("👋 mini app tour — try /demo, /links, or open the app below.", {
			reply_markup: new InlineKeyboard().webApp("open the app", webAppUrl(miniAppUrl)),
		}),
	)

	// a chat's persistent menu button (bottom-left, next to the message box) can open a mini
	// app too — separate from any inline keyboard button.
	.command("menubutton", async (ctx) => {
		await ctx.api.setChatMenuButton({
			chat_id: ctx.chat?.id,
			menu_button: { type: "web_app", text: "open shop", web_app: webAppInfo(miniAppUrl) },
		});
		await ctx.reply(
			"this chat's menu button now opens the mini app — check the icon by the message box.",
		);
	})

	// no real mini app frontend handy? ctx.miniApp.sign builds a valid initData the same way
	// telegram does, so you can exercise the full validate round trip without one.
	.command("demo", async (ctx) => {
		if (!ctx.from) return ctx.reply("no user on this update.");

		const initData = await ctx.miniApp.sign({
			user: { id: ctx.from.id, first_name: ctx.from.first_name },
			start_param: "ref_42",
		});
		const result = await ctx.miniApp.validate(initData);
		await ctx.reply(
			result.ok
				? `round-trip ok — hi ${result.data.user?.first_name}! start_param=${result.data.start_param}`
				: `rejected: ${result.reason}`,
		);
	})

	// paste initData exported from a real mini app (e.g. via Telegram.WebApp.initData in devtools)
	// to see it validated for real, HMAC-style — against the bot token.
	.command("check", async (ctx) => {
		const initData = ctx.message?.text?.split(" ").slice(1).join(" ") ?? "";
		if (!initData)
			return ctx.reply("usage: /check <initData> — or try /demo, which doesn't need a real one.");

		const result = await ctx.miniApp.validate(initData);
		await ctx.reply(
			result.ok
				? `hi ${result.data.user?.first_name ?? "there"}! (HMAC ok)`
				: `rejected: ${result.reason}`,
		);
	})

	// same payload, verified via Ed25519 against telegram's public key instead — no bot token
	// involved at all. real initData always carries both hash and signature, so either works.
	.command("check3rd", async (ctx) => {
		const initData = ctx.message?.text?.split(" ").slice(1).join(" ") ?? "";
		if (!initData) return ctx.reply("usage: /check3rd <initData> — same payload as /check.");

		const result = await ctx.miniApp.validateThirdParty(initData);
		await ctx.reply(
			result.ok
				? `hi ${result.data.user?.first_name ?? "there"}! (ed25519 ok, no bot token used)`
				: `rejected: ${result.reason}`,
		);
	})

	// once a mini app calls Telegram.WebApp.switchInlineQuery(), initData.query_id shows up in
	// its initData — answering it sends a message on the user's behalf to the originating chat.
	.command("answer", async (ctx) => {
		const queryId = ctx.message?.text?.split(" ")[1];
		if (!queryId) {
			return ctx.reply(
				"usage: /answer <query_id> — query_id comes from initData.query_id, after the mini app calls Telegram.WebApp.switchInlineQuery().",
			);
		}

		try {
			await ctx.miniApp.answerQuery(queryId, {
				type: "article",
				id: "1",
				title: "shared from the mini app",
				input_message_content: { message_text: "sent via answerWebAppQuery!" },
			});
			await ctx.reply("answered.");
		} catch (error) {
			await ctx.reply(
				`answerWebAppQuery failed: ${(error as Error).message} (query_id is one-shot and short-lived — grab a fresh one from a live mini app)`,
			);
		}
	})

	.command("links", async (ctx) => {
		const me = await ctx.api.getMe();
		if (!me.username) return ctx.reply("this bot has no @username set.");

		const direct = miniAppLink({ botUsername: me.username, startParam: "ref_42" });
		const attach = attachMenuLink({ botUsername: me.username, startParam: "ref_42" });
		await ctx.reply(
			`direct link (opens with the bot):\n${direct}\n\nattachment-menu link (opens from any chat):\n${attach}`,
		);
	})

	.command("help", (ctx) =>
		ctx.reply(COMMANDS.map((c) => `/${c.command} — ${c.description}`).join("\n")),
	)

	// when the mini app calls Telegram.WebApp.sendData(), it arrives here — already client-controlled,
	// so treat the parsed shape as untrusted input just like any other user-supplied data.
	.on("message:web_app_data", async (ctx) => {
		const payload = parseWebAppData(ctx.message.web_app_data.data);
		await ctx.reply(
			`mini app sent (via button "${ctx.message.web_app_data.button_text}"): ${JSON.stringify(payload)}`,
		);
	})

	.on("message:text", (ctx) => ctx.reply("not a command i know — try /help."))

	.onError((error, ctx) => {
		console.error(`update ${ctx.update.update_id} failed:`, error);
	})

	.onStart(async (info) => {
		await bot.api.call("setMyCommands", { commands: COMMANDS }).catch(() => {});
		console.log(`✨ @${info.username} is live — DM it /start`);
	});

// a minimal standalone http server for the mini app's OWN backend — not a bot update at all.
// deliberately framework-agnostic: validateAuthHeader just needs whatever string your server got
// for the header, so the same call works in hono/express/edge fetch handlers (see the
// @yaebal/mini-app docs) — node:http is just the zero-dependency stand-in here.
const backend = createServer((req, res) => {
	if (req.url !== "/me") {
		res.writeHead(404).end("not found");
		return;
	}

	const authHeader = Array.isArray(req.headers.authorization)
		? req.headers.authorization[0]
		: req.headers.authorization;

	validateAuthHeader(authHeader ?? null, token).then((result) => {
		if (!result.ok) {
			res
				.writeHead(401, { "content-type": "application/json" })
				.end(JSON.stringify({ error: result.reason }));
			return;
		}
		res
			.writeHead(200, { "content-type": "application/json" })
			.end(JSON.stringify({ user: result.data.user }));
	});
});

backend.listen(backendPort, () => {
	console.log(
		`mini app backend demo: curl -H "Authorization: tma <initData>" http://localhost:${backendPort}/me`,
	);
});

// graceful shutdown
process.once("SIGINT", () => {
	bot.stop();
	backend.close();
});
process.once("SIGTERM", () => {
	bot.stop();
	backend.close();
});

await bot.start();
