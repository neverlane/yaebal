import type { IncomingMessage, ServerResponse } from "node:http";
import type { Update } from "./telegram-types.js";

/** Telegram updates are tiny; reject anything wildly larger to avoid memory abuse. */
const MAX_BODY = 1 << 20; // 1 MiB

/**
 * Constant-time string compare so the secret-token check can't be timed.
 * Pure JS (no node:crypto / Buffer) so it runs on Node, Bun, Deno and edge/web.
 */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** Anything that can take a single update — i.e. a `Bot`. */
export interface UpdateSink {
	handleUpdate(update: Update): Promise<void>;
}

export interface WebhookOptions {
	/** If set, require Telegram's `X-Telegram-Bot-Api-Secret-Token` header to match. */
	secretToken?: string;
}

/**
 * A fetch-style webhook handler — `(Request) => Response`. Works on Bun, Deno,
 * Cloudflare Workers, and any runtime with the fetch globals.
 */
export function webhookCallback(
	bot: UpdateSink,
	options: WebhookOptions = {},
): (request: Request) => Promise<Response> {
	return async (request) => {
		if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
		if (
			options.secretToken &&
			!safeEqual(request.headers.get("x-telegram-bot-api-secret-token") ?? "", options.secretToken)
		) {
			return new Response("unauthorized", { status: 401 });
		}
		if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
			return new Response("payload too large", { status: 413 });
		}
		let update: Update;
		try {
			update = (await request.json()) as Update;
		} catch {
			return new Response("bad request", { status: 400 });
		}
		await bot.handleUpdate(update);
		return new Response("ok");
	};
}

/** A Node `http` webhook handler — `http.createServer(nodeWebhookCallback(bot))`. */
export function nodeWebhookCallback(
	bot: UpdateSink,
	options: WebhookOptions = {},
): (req: IncomingMessage, res: ServerResponse) => void {
	return (req, res) => {
		if (req.method !== "POST") {
			res.statusCode = 405;
			res.end();
			return;
		}
		const got = req.headers["x-telegram-bot-api-secret-token"];
		if (
			options.secretToken &&
			!safeEqual(typeof got === "string" ? got : "", options.secretToken)
		) {
			res.statusCode = 401;
			res.end();
			return;
		}
		const chunks: Buffer[] = [];
		let size = 0;
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > MAX_BODY) {
				res.statusCode = 413;
				res.end();
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on("end", async () => {
			try {
				const update = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Update;
				await bot.handleUpdate(update);
				res.statusCode = 200;
				res.end("ok");
			} catch {
				res.statusCode = 400;
				res.end();
			}
		});
	};
}
