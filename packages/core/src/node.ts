import type { IncomingMessage, ServerResponse } from "node:http";
import type { Update } from "./telegram-types.js";
import type { UpdateSink, WebhookOptions } from "./webhook.js";

const MAX_BODY = 1 << 20; // 1 MiB

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;

	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** a node `http` webhook handler — `http.createServer(nodeWebhookCallback(bot))`. */
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
