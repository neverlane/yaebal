import { media } from "@yaebal/core";
import type { Context, Plugin } from "@yaebal/core";
import { PANEL_HTML } from "./panel-html.js";

/** keep at most this many messages per chat in the in-memory store. */
const MAX_HISTORY = 1000;

/** constant-time compare (pure js — runs on node, bun, deno and edge/web). */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);

	return diff === 0;
}

export { PANEL_HTML } from "./panel-html.js";
// note: `serve` (node:http) and `SqlitePanelStore` (node:sqlite) are intentionally NOT
// re-exported here so this entry stays runtime-agnostic for edge bundles. import them
// from "@yaebal/panel/serve" and "@yaebal/panel/sqlite" respectively.

/** downloadable file kinds carried by a message (each maps to one `file_id`). */
export type AttachmentType =
	| "photo"
	| "video"
	| "animation"
	| "audio"
	| "voice"
	| "video_note"
	| "document"
	| "sticker";

/** single-file media kinds (photo is special — it's an array of sizes). */
const FILE_KINDS: AttachmentType[] = [
	"video",
	"animation",
	"audio",
	"voice",
	"video_note",
	"document",
	"sticker",
];

/** non-downloadable kinds we still label in the chat preview. */
const TAG_KINDS = ["location", "contact", "poll", "dice"] as const;

/** a downloadable attachment, referenced by telegram `file_id`. */
export interface PanelAttachment {
	type: AttachmentType;
	fileId: string;
	fileName?: string;
	mimeType?: string;
}

/** pull every downloadable attachment out of a telegram message. */
function extractAttachments(message: Record<string, unknown>): PanelAttachment[] {
	const out: PanelAttachment[] = [];

	const photo = message.photo;
	if (Array.isArray(photo) && photo.length > 0) {
		const largest = photo[photo.length - 1] as { file_id?: string };
		if (largest.file_id) out.push({ type: "photo", fileId: largest.file_id });
	}

	for (const kind of FILE_KINDS) {
		const m = message[kind] as
			| { file_id?: string; file_name?: string; mime_type?: string }
			| undefined;
		if (m && typeof m.file_id === "string") {
			out.push({ type: kind, fileId: m.file_id, fileName: m.file_name, mimeType: m.mime_type });
		}
	}

	return out;
}

/** best-effort one-line label for a message: its text/caption, else a `[media]` tag. */
function describe(message: Record<string, unknown> | undefined): string | undefined {
	if (!message) return undefined;

	const text = message.text ?? message.caption;
	if (typeof text === "string") return text;

	const att = extractAttachments(message);
	if (att.length > 0) return `[${att[0]!.type}]`;

	for (const kind of TAG_KINDS) {
		if (message[kind] !== undefined) return `[${kind}]`;
	}

	return undefined;
}

export interface PanelMessage {
	direction: "in" | "out";
	/** caption / text, or a `[kind]` placeholder when the message is media-only. */
	text: string;
	date: number;
	/** downloadable attachments, fetched lazily through `GET /api/file?id=…`. */
	attachments?: PanelAttachment[];
	/** telegram album id — consecutive messages sharing it are one media group. */
	mediaGroupId?: string;
}

/** build a {@link PanelMessage} from a telegram message, or undefined if nothing to log. */
function toPanelMessage(
	direction: "in" | "out",
	message: Record<string, unknown> | undefined,
): PanelMessage | undefined {
	if (!message) return undefined;

	const text = describe(message);
	const attachments = extractAttachments(message);
	if (text === undefined && attachments.length === 0) return undefined;

	const date = typeof message.date === "number" ? message.date : Math.floor(Date.now() / 1000);
	const msg: PanelMessage = { direction, text: text ?? "", date };
	if (attachments.length > 0) msg.attachments = attachments;
	if (typeof message.media_group_id === "string") msg.mediaGroupId = message.media_group_id;

	return msg;
}

export interface PanelChat {
	id: number;
	name: string;
	lastText: string;
	lastDate: number;
}

/** options for reading a slice of a conversation. */
export interface HistoryOptions {
	/** return only messages strictly older than this unix timestamp (for "load earlier"). */
	before?: number;
	/** cap the result to the most recent N messages within the window. */
	limit?: number;
}

/** a change the panel may want to react to in real time. */
export interface PanelEvent {
	type: "record";
	chatId: number;
	direction: "in" | "out";
}

/** where conversations are kept for the panel to read. implement for persistence. */
export interface PanelStore {
	record(chat: { id: number; name?: string }, message: PanelMessage): void | Promise<void>;
	chats(): PanelChat[] | Promise<PanelChat[]>;
	history(chatId: number, options?: HistoryOptions): PanelMessage[] | Promise<PanelMessage[]>;
	/** optional realtime hook — return an unsubscribe fn. enables the panel's SSE stream. */
	subscribe?(listener: (event: PanelEvent) => void): () => void;
}

/** defaults to in-memory store. Lost on restart — swap for a persistent one in production. */
export class MemoryPanelStore implements PanelStore {
	#chats = new Map<number, PanelChat>();
	#messages = new Map<number, PanelMessage[]>();
	#listeners = new Set<(event: PanelEvent) => void>();

	record(chat: { id: number; name?: string }, message: PanelMessage): void {
		const list = this.#messages.get(chat.id) ?? [];

		list.push(message);
		if (list.length > MAX_HISTORY) list.shift();

		this.#messages.set(chat.id, list);

		const prev = this.#chats.get(chat.id);
		this.#chats.set(chat.id, {
			id: chat.id,
			name: chat.name ?? prev?.name ?? `chat ${chat.id}`,
			lastText: message.text,
			lastDate: message.date,
		});

		for (const fn of this.#listeners) {
			fn({ type: "record", chatId: chat.id, direction: message.direction });
		}
	}

	chats(): PanelChat[] {
		return [...this.#chats.values()].sort((a, b) => b.lastDate - a.lastDate);
	}

	history(chatId: number, options?: HistoryOptions): PanelMessage[] {
		let list = this.#messages.get(chatId) ?? [];
		if (options?.before !== undefined) list = list.filter((m) => m.date < options.before!);
		if (options?.limit !== undefined) list = list.slice(-options.limit);
		return list;
	}

	subscribe(listener: (event: PanelEvent) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}
}

/** records incoming private-chat text into the store so the panel can show it. */
export function recorder(store: PanelStore): Plugin<Context, Record<never, never>> {
	const plugin: Plugin<Context, Record<never, never>> = (composer) =>
		composer.use(async (ctx, next) => {
			const chat = ctx.chat;
			const message = toPanelMessage("in", ctx.message as Record<string, unknown> | undefined);

			if (message && chat?.type === "private") {
				const name = ctx.from?.username
					? `@${ctx.from.username}`
					: (ctx.from?.first_name ?? `chat ${chat.id}`);

				await store.record({ id: chat.id, name }, message);
			}

			await next();
		});

	return plugin;
}

/**
 * what {@link panelHandler} needs from the api. `sendMessage` is required; `call` and
 * `fileUrl` unlock media (file proxying + operator uploads) and are present on the real
 * `@yaebal/core` `Api`. without them, media routes answer `501`.
 */
interface PanelApi {
	sendMessage(params: Record<string, unknown>): Promise<unknown>;
	call?<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
	fileUrl?(filePath: string): string;
}

/** map an attachment kind to its telegram send method + param field. */
const SEND_METHODS: Record<AttachmentType, { method: string; field: string }> = {
	photo: { method: "sendPhoto", field: "photo" },
	video: { method: "sendVideo", field: "video" },
	animation: { method: "sendAnimation", field: "animation" },
	audio: { method: "sendAudio", field: "audio" },
	voice: { method: "sendVoice", field: "voice" },
	video_note: { method: "sendVideoNote", field: "video_note" },
	document: { method: "sendDocument", field: "document" },
	sticker: { method: "sendSticker", field: "sticker" },
};

/** choose how to send an operator-uploaded file: explicit `type`, else infer from mime. */
function pickSendKind(type: string, mime: string): AttachmentType {
	if (type && type in SEND_METHODS) return type as AttachmentType;
	if (mime.startsWith("image/")) return mime === "image/gif" ? "animation" : "photo";
	if (mime.startsWith("video/")) return "video";
	if (mime === "audio/ogg") return "voice";
	if (mime.startsWith("audio/")) return "audio";
	return "document";
}

/** the slice of `@yaebal/core`'s `Api` that {@link recordOutgoing} needs. */
interface AfterHookApi {
	after(hook: (method: string, result: unknown) => unknown): unknown;
}

/** log a single telegram message result as an outgoing record (text or media). */
function recordResult(store: PanelStore, result: unknown): void {
	if (!result || typeof result !== "object") return;

	const raw = result as Record<string, unknown>;
	const chat = raw.chat as { id?: number; type?: string } | undefined;
	if (chat?.id === undefined || chat.type !== "private") return;

	const message = toPanelMessage("out", raw);
	if (message) void Promise.resolve(store.record({ id: chat.id }, message));
}

/**
 * record replies the bot sends *outside* the panel (e.g. `ctx.reply(...)` or `ctx.replyWithPhoto(...)`
 * in your handlers) so they show up in the conversation too. hooks the api's `after` stage and logs
 * every successful `send*` call (including `sendMediaGroup`, which returns an array) to a private chat.
 *
 * pairs with `panelHandler(..., { recordSends: false })` — the panel records its own sends,
 * so disable that to avoid double entries when this is installed.
 *
 * ```ts
 * recordOutgoing(bot.api, store);
 * const handler = panelHandler(bot.api, store, { token, recordSends: false });
 * ```
 */
export function recordOutgoing<A extends AfterHookApi>(api: A, store: PanelStore): A {
	api.after((method, result) => {
		if (method.startsWith("send")) {
			if (Array.isArray(result)) for (const item of result) recordResult(store, item);
			else recordResult(store, result);
		}
		return result;
	});

	return api;
}

export interface PanelOptions {
	/** shared secret required to open the panel and call its api. */
	token: string;
	/**
	 * allowed CORS origin(s) for the panel api. omit for same-origin only (default).
	 * pass `"*"` to allow any origin, or an explicit list to echo a matching `Origin` back.
	 */
	cors?: string | string[];
	/**
	 * mount prefix when the handler does not live at the server root, e.g. `"/panel"`.
	 * the UI builds its api urls from this, so no extra rewriting is needed. default `""`.
	 */
	basePath?: string;
	/**
	 * throttle failed auth attempts per client. defaults to 10 failures / 60s, then `429`
	 * until the window passes. pass `false` to disable.
	 */
	rateLimit?: { max?: number; windowMs?: number } | false;
	/**
	 * derive a client key for rate limiting. defaults to `x-forwarded-for` / `x-real-ip`,
	 * falling back to a single shared bucket when no proxy header is present.
	 */
	clientKey?: (request: Request) => string;
	/**
	 * record replies sent from the panel into the store. default `true`. set to `false`
	 * when you use {@link recordOutgoing}, which already captures every outgoing message.
	 */
	recordSends?: boolean;
}

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json", "x-content-type-options": "nosniff" },
	});

/** resolve the `Access-Control-Allow-Origin` value for a request, or undefined if disallowed. */
function corsOrigin(cors: PanelOptions["cors"], request: Request): string | undefined {
	if (cors === undefined) return undefined;
	if (cors === "*") return "*";

	const origin = request.headers.get("origin");
	if (!origin) return undefined;

	const allowed = Array.isArray(cors) ? cors : [cors];
	return allowed.includes(origin) ? origin : undefined;
}

/** fields a panel client may pass through to `sendMessage` alongside `chat_id`/`text`. */
const SEND_PASSTHROUGH = ["parse_mode", "reply_to_message_id", "reply_parameters"] as const;

/** normalize a mount prefix: `""` or `/foo` (no trailing slash). */
function normalizeBase(basePath: string | undefined): string {
	if (!basePath) return "";
	const trimmed = basePath.replace(/\/+$/, "");
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** a tiny in-memory limiter for failed auth attempts, keyed per client. */
function createLimiter(config: PanelOptions["rateLimit"]) {
	if (config === false) return undefined;

	const max = config?.max ?? 10;
	const windowMs = config?.windowMs ?? 60_000;
	const hits = new Map<string, { count: number; resetAt: number }>();

	return {
		/** ms the caller must wait, or 0 if still allowed. */
		blockedFor(key: string): number {
			const now = Date.now();
			const entry = hits.get(key);
			if (entry && now < entry.resetAt && entry.count >= max) {
				return entry.resetAt - now;
			}
			return 0;
		},
		fail(key: string): void {
			const now = Date.now();
			const entry = hits.get(key);
			if (!entry || now >= entry.resetAt) {
				hits.set(key, { count: 1, resetAt: now + windowMs });
			} else {
				entry.count++;
			}
		},
		reset(key: string): void {
			hits.delete(key);
		},
	};
}

function defaultClientKey(request: Request): string {
	const fwd = request.headers.get("x-forwarded-for");
	if (fwd) return fwd.split(",")[0]!.trim();
	return request.headers.get("x-real-ip") ?? "shared";
}

/** an SSE response that forwards store events to the browser (keep-alive pinged). */
function streamResponse(store: PanelStore): Response {
	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | undefined;
	let ping: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream({
		start(controller) {
			const push = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					/* client gone — cancel() will clean up */
				}
			};

			push(": connected\n\n");
			unsubscribe = store.subscribe?.((event) => push(`event: record\ndata: ${JSON.stringify(event)}\n\n`));
			ping = setInterval(() => push(": ping\n\n"), 25_000);
		},
		cancel() {
			if (ping) clearInterval(ping);
			unsubscribe?.();
		},
	});

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream; charset=utf-8",
			"cache-control": "no-cache, no-transform",
			"x-content-type-options": "nosniff",
		},
	});
}

/**
 * a fetch-style handler for the operator panel: serves the login + chat UI at the mount
 * root, and a small api to list chats, read a conversation, stream updates, and send a
 * reply. mount it on any fetch-compatible server.
 */
export function panelHandler(
	api: PanelApi,
	store: PanelStore,
	options: PanelOptions,
): (request: Request) => Promise<Response> {
	if (!options.token) throw new Error("panelHandler: a non-empty token is required");

	const base = normalizeBase(options.basePath);
	const limiter = createLimiter(options.rateLimit);
	const clientKey = options.clientKey ?? defaultClientKey;

	return async (request) => {
		const allowOrigin = corsOrigin(options.cors, request);

		// attach CORS headers (when enabled) to every response the handler returns
		const finish = (response: Response): Response => {
			if (allowOrigin) {
				response.headers.set("access-control-allow-origin", allowOrigin);
				response.headers.set("vary", "origin");
			}
			return response;
		};

		// preflight is unauthenticated by spec — answer it before the token check
		if (request.method === "OPTIONS") {
			return finish(
				new Response(null, {
					status: 204,
					headers: {
						"access-control-allow-methods": "GET, POST, OPTIONS",
						"access-control-allow-headers": "authorization, content-type",
						"access-control-max-age": "86400",
					},
				}),
			);
		}

		const url = new URL(request.url);

		// resolve the path relative to the configured mount prefix
		let path = url.pathname;
		if (base) {
			if (path === base) path = "/";
			else if (path.startsWith(`${base}/`)) path = path.slice(base.length);
			else return finish(json({ error: "not found" }, 404));
		}

		// the login + app shell is public; auth is enforced on /api/* only
		if (path === "/" && request.method === "GET") {
			return finish(
				new Response(PANEL_HTML.replaceAll("__BASE__", base), {
					headers: {
						"content-type": "text/html; charset=utf-8",
						// tokens are never put in the page url anymore, but stay strict anyway
						"referrer-policy": "no-referrer",
						"content-security-policy":
							"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
						"x-content-type-options": "nosniff",
					},
				}),
			);
		}

		// ---- everything below requires a valid token ----

		const key = clientKey(request);
		const wait = limiter?.blockedFor(key) ?? 0;
		if (wait > 0) {
			const res = json({ error: "too many attempts" }, 429);
			res.headers.set("retry-after", String(Math.ceil(wait / 1000)));
			return finish(res);
		}

		const provided =
			url.searchParams.get("token") ??
			request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
			"";

		// fail closed: reject empty/missing tokens and use a constant-time compare
		if (!provided || !safeEqual(provided, options.token)) {
			limiter?.fail(key);
			return finish(new Response("unauthorized", { status: 401 }));
		}
		limiter?.reset(key);

		if (path === "/api/chats" && request.method === "GET") {
			return finish(json(await store.chats()));
		}

		// realtime stream of store events (EventSource can't set headers → token in query)
		if (path === "/api/stream" && request.method === "GET") {
			return finish(streamResponse(store));
		}

		// proxy a telegram file by file_id, keeping the bot token server-side
		if (path === "/api/file" && request.method === "GET") {
			const fileId = url.searchParams.get("id");
			if (!fileId) return finish(json({ error: "id required" }, 400));
			if (!api.call || !api.fileUrl) {
				return finish(json({ error: "media proxy needs an api with call()/fileUrl()" }, 501));
			}

			const file = await api
				.call<{ file_path?: string }>("getFile", { file_id: fileId })
				.catch(() => undefined);
			if (!file?.file_path) return finish(json({ error: "file not found" }, 404));

			const upstream = await fetch(api.fileUrl(file.file_path));
			if (!upstream.ok || !upstream.body) return finish(json({ error: "download failed" }, 502));

			return finish(
				new Response(upstream.body, {
					headers: {
						"content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
						"cache-control": "private, max-age=86400",
						"x-content-type-options": "nosniff",
					},
				}),
			);
		}

		const get = path.match(/^\/api\/chats\/(-?\d+)$/);
		if (get?.[1] && request.method === "GET") {
			const before = url.searchParams.get("before");
			const limit = url.searchParams.get("limit");
			const opts: HistoryOptions = {};
			if (before !== null) opts.before = Number(before);
			if (limit !== null) opts.limit = Number(limit);
			return finish(json(await store.history(Number(get[1]), opts)));
		}

		const send = path.match(/^\/api\/chats\/(-?\d+)\/send$/);
		if (send?.[1] && request.method === "POST") {
			const chatId = Number(send[1]);
			const contentType = request.headers.get("content-type") ?? "";

			// ---- operator file upload (multipart) → sendPhoto / sendDocument / sendVoice / … ----
			if (contentType.includes("multipart/form-data")) {
				if (!api.call) {
					return finish(json({ error: "uploads need an api with call()" }, 501));
				}

				const form = await request.formData().catch(() => undefined);
				const file = form?.get("file");
				if (!(file instanceof Blob)) return finish(json({ error: "file required" }, 400));

				const kind = pickSendKind(String(form?.get("type") ?? ""), file.type);
				const { method, field } = SEND_METHODS[kind];
				const filename = (file as File).name || kind;
				const bytes = new Uint8Array(await file.arrayBuffer());

				const params: Record<string, unknown> = {
					chat_id: chatId,
					[field]: media.buffer(bytes, filename),
				};
				const caption = form?.get("caption");
				if (typeof caption === "string" && caption) params.caption = caption;

				const result = await api.call(method, params);
				if (options.recordSends !== false) recordResult(store, result);

				return finish(json({ ok: true }));
			}

			// ---- text reply (json) → sendMessage ----
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			if (typeof body.text !== "string" || !body.text) {
				return finish(json({ error: "text required" }, 400));
			}

			const params: Record<string, unknown> = { chat_id: chatId, text: body.text };
			for (const field of SEND_PASSTHROUGH) {
				if (body[field] !== undefined) params[field] = body[field];
			}

			const result = await api.sendMessage(params);
			// skip when recordOutgoing already logs every send (avoids double entries)
			if (options.recordSends !== false) {
				// record from the api result when it's a real message, else fall back to the text
				if (result && typeof result === "object" && "chat" in result) recordResult(store, result);
				else {
					await store.record(
						{ id: chatId },
						{ direction: "out", text: body.text, date: Math.floor(Date.now() / 1000) },
					);
				}
			}

			return finish(json({ ok: true }));
		}

		return finish(json({ error: "not found" }, 404));
	};
}
