import type { Update } from "./telegram-types.js";

/** telegram updates are tiny; reject anything wildly larger to avoid memory abuse. */
export const MAX_BODY = 1 << 20; // 1 MiB

/**
 * constant-time string compare so the secret-token check can't be timed.
 * pure js (no node:crypto / Buffer) so it runs on node, bun, deno and edge/web.
 * shared with the node webhook handler; not part of the public index.
 */
export function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;

	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** anything that can take a single update — i.e. a `Bot`. */
export interface UpdateSink {
	handleUpdate(update: Update): Promise<void>;
}

export interface WebhookOptions {
	/** if set, require telegram's `X-Telegram-Bot-Api-Secret-Token` header to match. */
	secretToken?: string;
}

/**
 * a fetch-style webhook handler — `(Request) => Response`. works on bun, deno,
 * cloudflare workers, and any runtime with the fetch globals.
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
