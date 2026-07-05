import { createServer, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { Bot } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";
import { deleteWebhook, setWebhook, webhook } from "@yaebal/web";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/webhook-edge/.env first (copy .env.example)");
	process.exit(1);
}

const secretToken = process.env.WEBHOOK_SECRET || "dev-secret";
const port = Number(process.env.PORT ?? 8080);
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");

const bot = new Bot(token, { allowedUpdates: ["message", "callback_query"] })
	.command("start", (ctx) =>
		ctx.reply("webhook edge bot is live. press the button or send /where.", {
			reply_markup: new InlineKeyboard().text("answer over webhook", "edge:pong").build(),
		}),
	)
	.command("where", (ctx) => ctx.reply("this update came through a fetch-style webhook handler."))
	.command("deletewebhook", async (ctx) => {
		await deleteWebhook(bot, false);
		return ctx.reply("webhook deleted. long polling can take over now.");
	})
	.callbackQuery("edge:pong", async (ctx) => {
		await ctx.answerCallbackQuery({ text: "pong from edge" });
		await ctx.send("callback handled through webhook.");
	});

export const fetch = webhook(bot, { secretToken });
export default { fetch };

const server = createServer(async (req, res) => {
	try {
		const response = await fetch(toFetchRequest(req));
		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key] = value;
		});

		res.writeHead(response.status, headers);
		res.end(Buffer.from(await response.arrayBuffer()));
	} catch (error) {
		console.error("webhook request failed", error);
		res.statusCode = 500;
		res.end("internal error");
	}
});

server.listen(port, async () => {
	console.log(`webhook edge local server: http://localhost:${port}`);
	if (!publicUrl) return;

	await setWebhook(bot, `${publicUrl}/telegram`, {
		secretToken,
		allowedUpdates: ["message", "callback_query"],
		dropPendingUpdates: true,
	}).catch((error) => console.error("setWebhook failed", error));
	console.log(`telegram webhook target: ${publicUrl}/telegram`);
});

function toFetchRequest(req: IncomingMessage): Request {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const headers = new Headers();

	for (const [key, value] of Object.entries(req.headers)) {
		if (Array.isArray(value)) for (const item of value) headers.append(key, item);
		else if (value !== undefined) headers.set(key, value);
	}

	const method = req.method ?? "GET";
	const body = method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(req);
	const init: RequestInit & { duplex?: "half" } = {
		method,
		headers,
		...(body ? { body: body as ReadableStream, duplex: "half" } : {}),
	};

	return new Request(url, init);
}
