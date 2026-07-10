import type { IncomingMessage, ServerResponse } from "node:http";
import { type UpdateSink, type WebhookOptions, webhookCallback } from "./webhook.js";

/**
 * build a fetch `Request` from a node request. the body streams through (no
 * buffering here) so the webhook's size cap applies as bytes arrive.
 */
export function toFetchRequest(req: IncomingMessage): Request {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const headers = new Headers();

	for (const [key, value] of Object.entries(req.headers)) {
		if (Array.isArray(value)) for (const item of value) headers.append(key, item);
		else if (value !== undefined) headers.set(key, value);
	}

	const method = req.method ?? "GET";
	if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });

	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			req.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
			req.on("end", () => controller.close());
			req.on("error", (error) => controller.error(error));
		},
		cancel() {
			req.destroy();
		},
	});

	return new Request(url, { method, headers, body, duplex: "half" });
}

/** write a fetch `Response` back to a node response. */
export async function sendFetchResponse(response: Response, res: ServerResponse): Promise<void> {
	const headers: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});

	res.writeHead(response.status, headers);
	const body = response.body ? new Uint8Array(await response.arrayBuffer()) : undefined;

	if (body?.byteLength) res.end(body);
	else res.end();
}

/**
 * a node `http` webhook handler — `http.createServer(nodeWebhookCallback(bot))`.
 * a thin bridge over {@link webhookCallback}, so every option (secret, path,
 * body cap, timeout/error policies, webhook reply) behaves identically to the
 * fetch handler.
 */
export function nodeWebhookCallback(
	bot: UpdateSink,
	options: WebhookOptions = {},
): (req: IncomingMessage, res: ServerResponse) => void {
	const handler = webhookCallback(bot, options);

	return (req, res) => {
		void (async () => {
			try {
				await sendFetchResponse(await handler(toFetchRequest(req)), res);
			} catch (error) {
				// the handler answers errors itself; this only catches transport-level failures
				console.error("[yaebal] webhook: failed to answer request:", error);
				if (!res.headersSent) res.statusCode = 500;
				res.end();
			}
		})();
	};
}
