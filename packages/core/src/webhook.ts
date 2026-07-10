import type { Update } from "./telegram-types.js";

/** default cap on an update's body size — telegram updates are tiny; anything wildly larger is abuse. */
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

/**
 * offered one api call per update: `claim` returns true when the call was taken
 * as the webhook's HTTP response (so it must not go over the network too).
 * created by `webhookCallback` when `reply` is enabled; consumed via
 * `withReplyEnvelope` in the api layer.
 */
export interface WebhookReplyEnvelope {
	claim(method: string, params: Record<string, unknown> | undefined): boolean;
}

/** per-update options for {@link UpdateSink.handleUpdate}. */
export interface HandleUpdateOptions {
	/** route one eligible api call into the webhook's HTTP response instead of its own request. */
	replyEnvelope?: WebhookReplyEnvelope;
}

/** anything that can take a single update — i.e. a `Bot`. */
export interface UpdateSink {
	handleUpdate(update: Update, options?: HandleUpdateOptions): Promise<void>;
	/**
	 * resolve the bot's own account (`getMe`) so `ctx.me` and `/cmd@botname`
	 * addressing work without `start()`. the webhook handler calls it lazily on
	 * the first update; absent (e.g. plain test sinks) it's simply skipped.
	 */
	init?(): Promise<unknown>;
}

/**
 * platform escape hatch passed as the handler's second argument: on serverless
 * runtimes that kill work once the response is sent (cloudflare's
 * `ctx.waitUntil`), timed-out updates are handed here so they can finish.
 */
export interface WebhookExecutionContext {
	waitUntil?(promise: Promise<unknown>): void;
}

/** a fetch-style webhook handler. the second argument is optional platform glue. */
export type WebhookHandler = (
	request: Request,
	execution?: WebhookExecutionContext,
) => Promise<Response>;

export interface WebhookOptions {
	/** if set, require telegram's `X-Telegram-Bot-Api-Secret-Token` header to match. */
	secretToken?: string;
	/** only serve this exact pathname; other paths go to `fallback` (or 404). */
	path?: string;
	/**
	 * handle requests the webhook doesn't own — wrong path or non-POST method —
	 * e.g. health checks. without it those answer 404 / 405.
	 */
	fallback?: (request: Request) => Response | Promise<Response>;
	/** max body size in bytes, enforced while streaming (default 1 MiB). */
	maxBodyBytes?: number;
	/**
	 * how long an update may run before the webhook answers anyway, in ms
	 * (default 10 000; `0` disables). telegram redelivers updates whose request
	 * hangs, so answering beats being timed out remotely.
	 */
	timeoutMs?: number;
	/**
	 * what to answer when `timeoutMs` is exceeded. `"ack"` (default) returns 200
	 * and lets the update finish in the background (logged; pass the platform's
	 * `waitUntil` on serverless so it survives) — telegram won't redeliver.
	 * `"fail"` returns 500 — telegram redelivers later, so the handler must be
	 * idempotent. or a custom response.
	 */
	onTimeout?: "ack" | "fail" | ((update: Update) => Response | Promise<Response>);
	/**
	 * what to answer when handling throws (an error handler that rethrows, a
	 * failing `init`). `"fail"` (default) returns 500 — telegram redelivers the
	 * update with backoff, which also means a deterministic crash repeats until
	 * it ages out. `"ack"` returns 200 — the update is dropped after the log
	 * line. or a custom response.
	 */
	onError?: "fail" | "ack" | ((error: unknown, update?: Update) => Response | Promise<Response>);
	/**
	 * webhook reply: answer the webhook's HTTP request with an api call instead
	 * of making a separate request — saves a round trip per update. `true`
	 * allows any upload-free call; a predicate restricts it (e.g. only
	 * `sendChatAction`). caveats: the call's promise resolves `true` (telegram
	 * doesn't return the result), and it's delivered *after* any later direct
	 * calls the handler makes.
	 */
	reply?: boolean | ((method: string, params?: Record<string, unknown>) => boolean);
}

const SECRET_TOKEN_RE = /^[A-Za-z0-9_-]{1,256}$/;

/** telegram rejects other secrets at `setWebhook` time — fail fast and locally instead. */
export function assertSecretToken(secret: string | undefined): void {
	if (secret !== undefined && !SECRET_TOKEN_RE.test(secret)) {
		throw new Error(
			"secretToken must be 1-256 characters of A-Z, a-z, 0-9, _ and - (telegram requirement)",
		);
	}
}

/** read the whole body, capped: `undefined` means it went over `cap` bytes. */
async function readBody(request: Request, cap: number): Promise<string | undefined> {
	// a valid content-length lets us refuse early; a missing or garbage one
	// (chunked transfer, spoofed header) falls through to the streaming cap.
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > cap) return undefined;

	const stream = request.body;
	if (!stream) {
		// some runtimes surface no stream for small bodies — the text is already
		// in memory, so only the (exact, encoded) size check is left to do.
		const text = await request.text();
		return new TextEncoder().encode(text).byteLength > cap ? undefined : text;
	}

	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;

		total += value.byteLength;
		if (total > cap) {
			await reader.cancel().catch(() => {});
			return undefined;
		}

		chunks.push(value);
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return new TextDecoder().decode(bytes);
}

function isUpdate(value: unknown): value is Update {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { update_id?: unknown }).update_id === "number"
	);
}

/** race `work` against a timer; true ⇒ timed out (work keeps running). rejections propagate. */
async function exceeded(work: Promise<void>, ms: number): Promise<boolean> {
	if (!(ms > 0) || !Number.isFinite(ms)) {
		await work;
		return false;
	}

	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work.then(() => false),
			new Promise<true>((resolve) => {
				timer = setTimeout(() => resolve(true), ms);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

interface Envelope extends WebhookReplyEnvelope {
	take(): { method: string; params: Record<string, unknown> | undefined } | undefined;
	close(): void;
}

function createEnvelope(
	allow: (method: string, params?: Record<string, unknown>) => boolean,
): Envelope {
	let payload: { method: string; params: Record<string, unknown> | undefined } | undefined;
	let closed = false;

	return {
		claim(method, params) {
			if (closed || payload || !allow(method, params)) return false;

			payload = { method, params };
			return true;
		},
		take() {
			closed = true;
			return payload;
		},
		close() {
			closed = true;
		},
	};
}

/**
 * a fetch-style webhook handler — `(Request) => Response`. works on bun, deno,
 * cloudflare workers, and any runtime with the fetch globals. `@yaebal/web`
 * wraps this into adapters for every mainstream framework/platform.
 */
export function webhookCallback(bot: UpdateSink, options: WebhookOptions = {}): WebhookHandler {
	assertSecretToken(options.secretToken);

	const cap = options.maxBodyBytes ?? MAX_BODY;
	const timeoutMs = options.timeoutMs ?? 10_000;
	const allowReply =
		options.reply === true ? () => true : options.reply === false ? undefined : options.reply;
	let initialized = false;

	return async (request, execution) => {
		const decline = (status: number, body: string, headers?: Record<string, string>) =>
			options.fallback ? options.fallback(request) : new Response(body, { status, headers });

		if (options.path) {
			let pathname = "";
			try {
				pathname = new URL(request.url).pathname;
			} catch {
				// keep "" — no valid url, treat as a path miss
			}
			if (pathname !== options.path) return decline(404, "not found");
		}

		if (request.method !== "POST") {
			return decline(405, "method not allowed", { allow: "POST" });
		}

		if (
			options.secretToken &&
			!safeEqual(request.headers.get("x-telegram-bot-api-secret-token") ?? "", options.secretToken)
		) {
			return new Response("unauthorized", { status: 401 });
		}

		const body = await readBody(request, cap).catch(() => undefined);
		if (body === undefined) return new Response("payload too large", { status: 413 });

		let update: Update;
		try {
			const parsed: unknown = JSON.parse(body);
			if (!isUpdate(parsed)) return new Response("bad request", { status: 400 });
			update = parsed;
		} catch {
			return new Response("bad request", { status: 400 });
		}

		try {
			if (!initialized && bot.init) {
				await bot.init();
				initialized = true;
			}

			const envelope = allowReply ? createEnvelope(allowReply) : undefined;
			const work = bot.handleUpdate(update, envelope && { replyEnvelope: envelope });

			if (await exceeded(work, timeoutMs)) {
				envelope?.close();
				const rest = work.catch((error) =>
					console.error(
						`[yaebal] webhook: update ${update.update_id} failed after timeout:`,
						error,
					),
				);
				execution?.waitUntil?.(rest);

				if (typeof options.onTimeout === "function") return await options.onTimeout(update);
				if (options.onTimeout === "fail") return new Response("handler timeout", { status: 500 });

				console.error(
					`[yaebal] webhook: update ${update.update_id} exceeded ${timeoutMs}ms — acknowledged, still running`,
				);
				return new Response("ok");
			}

			const claimed = envelope?.take();
			return claimed
				? new Response(JSON.stringify({ method: claimed.method, ...claimed.params }), {
						headers: { "content-type": "application/json" },
					})
				: new Response("ok");
		} catch (error) {
			if (typeof options.onError === "function") return await options.onError(error, update);

			console.error(`[yaebal] webhook: update ${update.update_id} failed:`, error);
			return options.onError === "ack"
				? new Response("ok")
				: new Response("internal error", { status: 500 });
		}
	};
}
