import type { Api, Chat, Message } from "@yaebal/core";

/** `Message`'s own `reply_markup` union — reused so a `BotMessage` structurally satisfies `Message`. */
type ReplyMarkup = NonNullable<Message["reply_markup"]>;

/**
 * a live mirror of one message the bot sent — built from the outgoing `send*` params (so it's
 * populated even against the builtin `{ message_id }` stub, no `onApi` override needed) and kept
 * in sync in place as `editMessageText`/`editMessageCaption`/`editMessageReplyMarkup` calls land,
 * so a reference captured before an edit still reflects it after.
 */
export interface BotMessage {
	message_id: number;
	chat: { id: number; type: Chat["type"] };
	text?: string;
	caption?: string;
	reply_markup?: ReplyMarkup;
	date: number;
}

export interface LastBotMessageQuery {
	/** scope to a specific chat (an `{ id }`-shaped value — a `ChatActor` or `pmChat` both qualify). */
	chat?: { id: number };
	/** only consider messages currently carrying a non-empty `inline_keyboard`. */
	withReplyMarkup?: boolean;
	/** arbitrary predicate over the call that produced (or last touched) the message. */
	where?: (call: { method: string; params: Record<string, unknown> | undefined }) => boolean;
}

export interface BotMessageTracker {
	lastBotMessage(query?: LastBotMessageQuery): BotMessage | undefined;
	botMessage(chatId: number, messageId: number): BotMessage | undefined;
	clear(): void;
}

const SEND_LIKE = (method: string): boolean =>
	method.startsWith("send") || method === "forwardMessage" || method === "copyMessage";

function hasInlineKeyboard(markup: ReplyMarkup | undefined): boolean {
	const withRows = markup as { inline_keyboard?: unknown[] } | undefined;
	const rows = withRows?.inline_keyboard;
	return Array.isArray(rows) && rows.length > 0;
}

/** install bot-message tracking on a mock `api` via its `after` hook. */
export function attachBotMessageTracking(
	api: Api,
	resolveChatType: (chatId: number) => Chat["type"],
): BotMessageTracker {
	interface Entry extends BotMessage {
		lastCall: { method: string; params: Record<string, unknown> | undefined };
	}

	const byKey = new Map<string, Entry>();
	const order: Entry[] = [];
	const key = (chatId: number, messageId: number): string => `${chatId}:${messageId}`;

	api.after((method, params, result) => {
		const p = params ?? {};

		if (method.startsWith("edit")) {
			const chatId = p.chat_id as number | undefined;
			const messageId = p.message_id as number | undefined;
			if (chatId === undefined || messageId === undefined) return;

			const entry = byKey.get(key(chatId, messageId));
			if (!entry) return;

			if (method === "editMessageText" && typeof p.text === "string") entry.text = p.text;
			if (method === "editMessageCaption") entry.caption = p.caption as string | undefined;
			if ("reply_markup" in p) entry.reply_markup = p.reply_markup as ReplyMarkup | undefined;

			entry.lastCall = { method, params: p };
			return;
		}

		if (!SEND_LIKE(method)) return;
		if (!result || typeof result !== "object" || !("message_id" in result)) return;

		const chatId = p.chat_id as number | undefined;
		if (chatId === undefined) return;

		const messageId = (result as { message_id: number }).message_id;
		const entry: Entry = {
			message_id: messageId,
			chat: { id: chatId, type: resolveChatType(chatId) },
			text: p.text as string | undefined,
			caption: p.caption as string | undefined,
			reply_markup: p.reply_markup as ReplyMarkup | undefined,
			date: (result as { date?: number }).date ?? Date.now(),
			lastCall: { method, params: p },
		};

		byKey.set(key(chatId, messageId), entry);
		order.push(entry);
	});

	return {
		lastBotMessage(query = {}) {
			for (let i = order.length - 1; i >= 0; i--) {
				const entry = order[i] as Entry;
				if (query.chat && entry.chat.id !== query.chat.id) continue;
				if (query.withReplyMarkup && !hasInlineKeyboard(entry.reply_markup)) continue;
				if (query.where && !query.where(entry.lastCall)) continue;

				return entry;
			}

			return undefined;
		},
		botMessage: (chatId, messageId) => byKey.get(key(chatId, messageId)),
		clear() {
			byKey.clear();
			order.length = 0;
		},
	};
}
