import type { Context, Plugin } from "@yaebal/core";
import { PANEL_HTML } from "./panel-html.js";

/** Keep at most this many messages per chat in the in-memory store. */
const MAX_HISTORY = 1000;

/** Constant-time compare (pure JS — runs on Node, Bun, Deno and edge/web). */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export { PANEL_HTML } from "./panel-html.js";

export interface PanelMessage {
	direction: "in" | "out";
	text: string;
	date: number;
}

export interface PanelChat {
	id: number;
	name: string;
	lastText: string;
	lastDate: number;
}

/** Where conversations are kept for the panel to read. Implement for persistence. */
export interface PanelStore {
	record(chat: { id: number; name?: string }, message: PanelMessage): void | Promise<void>;
	chats(): PanelChat[] | Promise<PanelChat[]>;
	history(chatId: number): PanelMessage[] | Promise<PanelMessage[]>;
}

/** Default in-memory store. Lost on restart — swap for a persistent one in production. */
export class MemoryPanelStore implements PanelStore {
	#chats = new Map<number, PanelChat>();
	#messages = new Map<number, PanelMessage[]>();

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
	}

	chats(): PanelChat[] {
		return [...this.#chats.values()].sort((a, b) => b.lastDate - a.lastDate);
	}

	history(chatId: number): PanelMessage[] {
		return this.#messages.get(chatId) ?? [];
	}
}

/** Records incoming private-chat text into the store so the panel can show it. */
export function recorder(store: PanelStore): Plugin<Context, Record<never, never>> {
	const plugin: Plugin<Context, Record<never, never>> = (composer) =>
		composer.use(async (ctx, next) => {
			const text = ctx.text;
			const chat = ctx.chat;
			if (text !== undefined && chat?.type === "private") {
				const name = ctx.from?.username
					? `@${ctx.from.username}`
					: (ctx.from?.first_name ?? `chat ${chat.id}`);
				await store.record(
					{ id: chat.id, name },
					{ direction: "in", text, date: Math.floor(Date.now() / 1000) },
				);
			}
			await next();
		});
	return plugin;
}

interface SendApi {
	sendMessage(params: Record<string, unknown>): Promise<unknown>;
}

export interface PanelOptions {
	/** Shared secret required to open the panel and call its API. */
	token: string;
}

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json", "x-content-type-options": "nosniff" },
	});

/**
 * A fetch-style handler for the operator panel: serves the UI at `/`, and a small
 * API to list chats, read a conversation, and send a reply. Mount it on any
 * fetch-compatible server. Open it at `/?token=<your token>`.
 */
export function panelHandler(
	api: SendApi,
	store: PanelStore,
	options: PanelOptions,
): (request: Request) => Promise<Response> {
	if (!options.token) throw new Error("panelHandler: a non-empty token is required");

	return async (request) => {
		const url = new URL(request.url);
		const provided =
			url.searchParams.get("token") ??
			request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
			"";
		// fail closed: reject empty/missing tokens and use a constant-time compare
		if (!provided || !safeEqual(provided, options.token)) {
			return new Response("unauthorized", { status: 401 });
		}

		if (url.pathname === "/" && request.method === "GET") {
			return new Response(PANEL_HTML, {
				headers: {
					"content-type": "text/html; charset=utf-8",
					// the token rides in the URL on this initial load — keep it out of Referer
					"referrer-policy": "no-referrer",
					"content-security-policy":
						"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
					"x-content-type-options": "nosniff",
				},
			});
		}
		if (url.pathname === "/api/chats" && request.method === "GET") {
			return json(await store.chats());
		}
		const get = url.pathname.match(/^\/api\/chats\/(-?\d+)$/);
		if (get?.[1] && request.method === "GET") {
			return json(await store.history(Number(get[1])));
		}
		const send = url.pathname.match(/^\/api\/chats\/(-?\d+)\/send$/);
		if (send?.[1] && request.method === "POST") {
			const chatId = Number(send[1]);
			const body = (await request.json().catch(() => ({}))) as { text?: string };
			if (!body.text) return json({ error: "text required" }, 400);
			await api.sendMessage({ chat_id: chatId, text: body.text });
			await store.record(
				{ id: chatId },
				{ direction: "out", text: body.text, date: Math.floor(Date.now() / 1000) },
			);
			return json({ ok: true });
		}
		return json({ error: "not found" }, 404);
	};
}
