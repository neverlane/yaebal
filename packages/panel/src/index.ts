import type { ApiOptions, Context, Plugin } from "@yaebal/core";
import { createApi, media } from "@yaebal/core";
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
// from "@yaebal/panel/serve" and "@yaebal/panel/sqlite" respectively. `skladPanelStore`
// lives in "@yaebal/panel/sklad" for the same reason — it only type-imports `@yaebal/sklad`.

/** either a plain value or a promise of one — mirrors `@yaebal/sklad`'s `MaybePromise`. */
export type MaybePromise<T> = T | Promise<T>;

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
const TAG_KINDS = [
	"location",
	"contact",
	"poll",
	"dice",
	"venue",
	"story",
	"game",
	"invoice",
	"successful_payment",
	"paid_media",
] as const;

/** a downloadable attachment, referenced by telegram `file_id`. */
export interface PanelAttachment {
	type: AttachmentType;
	fileId: string;
	fileName?: string;
	mimeType?: string;
}

export interface PanelKeyboardButton {
	text: string;
	kind?: "callback" | "url" | "web_app" | "login_url" | "switch_inline" | "pay" | "unknown";
	callbackData?: string;
	url?: string;
}

export interface PanelKeyboard {
	type: "inline" | "reply";
	rows: PanelKeyboardButton[][];
}

export type PanelMessageEventType =
	| "callback"
	| "reaction"
	| "reaction_count"
	| "poll_answer"
	| "chat_member";

export interface PanelMessageEvent {
	type: PanelMessageEventType;
	title: string;
	detail?: string;
	data?: string;
}

export interface PanelChatRecord {
	id: number;
	name?: string;
	firstName?: string;
	lastName?: string;
	username?: string;
}

/** where a chat sits in the operator workflow. `handled` is what {@link handoff} checks. */
export type PanelChatStatus = "open" | "handled" | "archived";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function keyboardButton(raw: unknown): PanelKeyboardButton | undefined {
	if (!isRecord(raw)) return undefined;
	const text = stringValue(raw.text);
	if (!text) return undefined;

	const button: PanelKeyboardButton = { text };
	const callbackData = stringValue(raw.callback_data);
	const url = stringValue(raw.url);

	if (callbackData) {
		button.kind = "callback";
		button.callbackData = callbackData;
	} else if (url) {
		button.kind = "url";
		button.url = url;
	} else if (raw.web_app !== undefined) button.kind = "web_app";
	else if (raw.login_url !== undefined) button.kind = "login_url";
	else if (
		raw.switch_inline_query !== undefined ||
		raw.switch_inline_query_current_chat !== undefined
	) {
		button.kind = "switch_inline";
	} else if (raw.pay === true) button.kind = "pay";
	else button.kind = "unknown";

	return button;
}

function keyboardRows(raw: unknown): PanelKeyboardButton[][] {
	if (!Array.isArray(raw)) return [];

	const rows: PanelKeyboardButton[][] = [];
	for (const row of raw) {
		if (!Array.isArray(row)) continue;

		const buttons: PanelKeyboardButton[] = [];
		for (const item of row) {
			const button = keyboardButton(item);
			if (button) buttons.push(button);
		}

		if (buttons.length > 0) rows.push(buttons);
	}

	return rows;
}

function extractKeyboard(message: Record<string, unknown>): PanelKeyboard | undefined {
	const markup = message.reply_markup;
	if (!isRecord(markup)) return undefined;

	const inline = keyboardRows(markup.inline_keyboard);
	if (inline.length > 0) return { type: "inline", rows: inline };

	const reply = keyboardRows(markup.keyboard);
	if (reply.length > 0) return { type: "reply", rows: reply };

	return undefined;
}

/** best-effort one-line label for a message: its text/caption, else a `[media]` tag. */
function describe(message: Record<string, unknown> | undefined): string | undefined {
	if (!message) return undefined;

	const text = message.text ?? message.caption;
	if (typeof text === "string") return text;

	const att = extractAttachments(message);
	if (att.length > 0) return `[${att[0]?.type}]`;

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
	/**
	 * store-assigned monotonic ordinal, set on {@link PanelStore.record}. tie-breaker for
	 * pagination cursors when two messages share a `date` (telegram dates are per-second, so
	 * this is common) — see {@link HistoryOptions.beforeSeq}. callers never set this themselves.
	 */
	seq?: number;
	/** telegram `message_id`, when known. needed to reply to, edit or delete this message. */
	id?: number;
	/** `message_id` this message replies to, if it was a reply. */
	replyToId?: number;
	/** downloadable attachments, fetched lazily through `GET /api/file?id=...`. */
	attachments?: PanelAttachment[];
	/** telegram album id — consecutive messages sharing it are one media group. */
	mediaGroupId?: string;
	/** inline/reply keyboard attached to the telegram message, rendered as a compact preview. */
	keyboard?: PanelKeyboard;
	/** non-message update rendered in the timeline (callback, reaction, poll answer, member event). */
	event?: PanelMessageEvent;
	/** name of the operator who sent this from the panel — audit trail. unset for bot/user messages. */
	operator?: string;
	/** set once telegram confirms an edit (from the panel, or an `edited_message` update). */
	edited?: boolean;
	/** soft-deleted (via the panel's delete action) — the row stays for the audit trail. */
	deleted?: boolean;
}

/** build a {@link PanelMessage} from a telegram message, or undefined if nothing to log. */
function toPanelMessage(
	direction: "in" | "out",
	message: Record<string, unknown> | undefined,
): PanelMessage | undefined {
	if (!message) return undefined;

	const text = describe(message);
	const attachments = extractAttachments(message);
	const keyboard = extractKeyboard(message);
	if (text === undefined && attachments.length === 0 && !keyboard) return undefined;

	const date = typeof message.date === "number" ? message.date : Math.floor(Date.now() / 1000);
	const msg: PanelMessage = { direction, text: text ?? "", date };
	if (attachments.length > 0) msg.attachments = attachments;
	if (typeof message.media_group_id === "string") msg.mediaGroupId = message.media_group_id;
	if (keyboard) msg.keyboard = keyboard;

	const id = numberValue(message.message_id);
	if (id !== undefined) msg.id = id;

	const reply = message.reply_to_message;
	const replyId = isRecord(reply) ? numberValue(reply.message_id) : undefined;
	if (replyId !== undefined) msg.replyToId = replyId;

	return msg;
}

export interface PanelChat {
	id: number;
	name: string;
	firstName?: string;
	lastName?: string;
	username?: string;
	lastText: string;
	lastDate: number;
	lastAttachmentType?: AttachmentType;
	lastEventType?: PanelMessageEventType;
	/** operator workflow state. new chats start `"open"`. */
	status: PanelChatStatus;
	/** unread incoming messages since the operator last viewed this chat. */
	unread: number;
	/** operator currently handling this chat, if assigned. */
	assignedTo?: string;
	pinned?: boolean;
}

/** options for reading a slice of a conversation. */
export interface HistoryOptions {
	/** return only messages strictly older than this unix timestamp (for "load earlier"). */
	before?: number;
	/**
	 * tie-breaker for `before` — the `seq` of the oldest message already loaded. without it,
	 * messages sharing the exact same `before` second can be silently skipped on the next page.
	 */
	beforeSeq?: number;
	/** cap the result to the most recent N messages within the window. */
	limit?: number;
}

/** options for listing chats. */
export interface ChatsOptions {
	limit?: number;
	offset?: number;
	status?: PanelChatStatus;
}

/** a partial update to an already-recorded message (edit/delete from the panel or telegram). */
export interface MessagePatch {
	text?: string;
	edited?: boolean;
	deleted?: boolean;
}

export interface SearchOptions {
	/** restrict the search to one chat. omit to search every chat. */
	chatId?: number;
	limit?: number;
}

export interface PanelSearchResult {
	chatId: number;
	message: PanelMessage;
}

/** a change the panel may want to react to in real time. */
export type PanelEvent =
	| { type: "record"; chatId: number; direction: "in" | "out" }
	| { type: "status"; chatId: number; status: PanelChatStatus }
	| { type: "read"; chatId: number }
	/** chat metadata changed in a way that isn't a status transition (assign, pin, …). */
	| { type: "chat"; chatId: number }
	| { type: "deleted"; chatId: number };

/** where conversations are kept for the panel to read. implement for persistence. */
export interface PanelStore {
	record(chat: PanelChatRecord, message: PanelMessage): MaybePromise<void>;
	chats(options?: ChatsOptions): MaybePromise<PanelChat[]>;
	history(chatId: number, options?: HistoryOptions): MaybePromise<PanelMessage[]>;
	/** cheap point lookup for a single chat's status — what {@link handoff} calls per update. */
	status(chatId: number): MaybePromise<PanelChatStatus | undefined>;
	setStatus(chatId: number, status: PanelChatStatus): MaybePromise<void>;
	assign(chatId: number, operator: string | null): MaybePromise<void>;
	pin(chatId: number, pinned: boolean): MaybePromise<void>;
	/** reset the chat's unread counter. called whenever the panel opens/views a conversation. */
	markRead(chatId: number): MaybePromise<void>;
	/** patch an already-recorded message by its telegram `message_id` (edit/delete). */
	updateMessage(chatId: number, messageId: number, patch: MessagePatch): MaybePromise<void>;
	/** remove a chat and its history entirely (operator cleanup / data-deletion requests). */
	deleteChat(chatId: number): MaybePromise<void>;
	/**
	 * optional full-text search. every built-in store implements it; `SqlitePanelStore`'s is
	 * FTS5-backed and stays fast at scale — a custom store may omit it (the api answers `501`).
	 */
	search?(query: string, options?: SearchOptions): MaybePromise<PanelSearchResult[]>;
	/** optional realtime hook — return an unsubscribe fn. enables the panel's SSE stream. */
	subscribe?(listener: (event: PanelEvent) => void): () => void;
}

/** options for {@link MemoryPanelStore}. */
export interface MemoryPanelStoreOptions {
	/** keep at most this many messages per chat. default 1000. */
	maxHistory?: number;
}

interface StoredMessage extends PanelMessage {
	seq: number;
}

/** defaults to in-memory store. Lost on restart — swap for a persistent one in production. */
export class MemoryPanelStore implements PanelStore {
	#chats = new Map<number, PanelChat>();
	#messages = new Map<number, StoredMessage[]>();
	#listeners = new Set<(event: PanelEvent) => void>();
	#maxHistory: number;
	#seq = 0;

	constructor(options: MemoryPanelStoreOptions = {}) {
		this.#maxHistory = options.maxHistory ?? MAX_HISTORY;
	}

	#emit(event: PanelEvent): void {
		for (const fn of this.#listeners) fn(event);
	}

	record(chat: PanelChatRecord, message: PanelMessage): void {
		const stored: StoredMessage = { ...message, seq: ++this.#seq };
		const list = this.#messages.get(chat.id) ?? [];

		list.push(stored);
		if (list.length > this.#maxHistory) list.shift();

		this.#messages.set(chat.id, list);

		const prev = this.#chats.get(chat.id);
		const next: PanelChat = {
			id: chat.id,
			name: chat.name ?? prev?.name ?? `chat ${chat.id}`,
			lastText: message.text,
			lastDate: message.date,
			status: prev?.status ?? "open",
			unread: message.direction === "in" ? (prev?.unread ?? 0) + 1 : (prev?.unread ?? 0),
		};
		const firstName = chat.firstName ?? prev?.firstName;
		const lastName = chat.lastName ?? prev?.lastName;
		const username = chat.username ?? prev?.username;
		const lastAttachmentType = message.attachments?.[0]?.type;
		const lastEventType = message.event?.type;

		if (firstName) next.firstName = firstName;
		if (lastName) next.lastName = lastName;
		if (username) next.username = username;
		if (lastAttachmentType) next.lastAttachmentType = lastAttachmentType;
		if (lastEventType) next.lastEventType = lastEventType;
		if (prev?.assignedTo) next.assignedTo = prev.assignedTo;
		if (prev?.pinned) next.pinned = prev.pinned;

		this.#chats.set(chat.id, next);
		this.#emit({ type: "record", chatId: chat.id, direction: message.direction });
	}

	chats(options: ChatsOptions = {}): PanelChat[] {
		let list = [...this.#chats.values()];

		if (options.status) list = list.filter((c) => c.status === options.status);
		list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastDate - a.lastDate);
		if (options.offset) list = list.slice(options.offset);
		if (options.limit !== undefined) list = list.slice(0, options.limit);

		return list.map((c) => ({ ...c }));
	}

	history(chatId: number, options: HistoryOptions = {}): PanelMessage[] {
		let list = this.#messages.get(chatId) ?? [];

		if (options.before !== undefined) {
			const before = options.before;
			const beforeSeq = options.beforeSeq;
			list = list.filter((m) =>
				beforeSeq !== undefined
					? m.date < before || (m.date === before && m.seq < beforeSeq)
					: m.date < before,
			);
		}
		if (options.limit !== undefined) list = list.slice(-options.limit);

		// copy every message too — callers must not be able to corrupt the store by mutating
		// the array (or its entries) this returns.
		return list.map((m) => ({ ...m }));
	}

	status(chatId: number): PanelChatStatus | undefined {
		return this.#chats.get(chatId)?.status;
	}

	setStatus(chatId: number, status: PanelChatStatus): void {
		const chat = this.#chats.get(chatId);
		if (!chat) return;

		chat.status = status;
		this.#emit({ type: "status", chatId, status });
	}

	assign(chatId: number, operator: string | null): void {
		const chat = this.#chats.get(chatId);
		if (!chat) return;

		if (operator) chat.assignedTo = operator;
		else chat.assignedTo = undefined;
		this.#emit({ type: "chat", chatId });
	}

	pin(chatId: number, pinned: boolean): void {
		const chat = this.#chats.get(chatId);
		if (!chat) return;

		chat.pinned = pinned;
		this.#emit({ type: "chat", chatId });
	}

	markRead(chatId: number): void {
		const chat = this.#chats.get(chatId);
		// only emit on a real transition: viewing an already-read chat (e.g. the panel
		// refetching it after some other event) must stay silent, or a client that reacts
		// to "read" by refetching would retrigger this and loop with the server forever.
		if (!chat || chat.unread === 0) return;

		chat.unread = 0;
		this.#emit({ type: "read", chatId });
	}

	updateMessage(chatId: number, messageId: number, patch: MessagePatch): void {
		const message = this.#messages.get(chatId)?.find((m) => m.id === messageId);
		if (!message) return;

		if (patch.text !== undefined) message.text = patch.text;
		if (patch.edited !== undefined) message.edited = patch.edited;
		if (patch.deleted !== undefined) message.deleted = patch.deleted;

		this.#emit({ type: "chat", chatId });
	}

	deleteChat(chatId: number): void {
		this.#chats.delete(chatId);
		this.#messages.delete(chatId);
		this.#emit({ type: "deleted", chatId });
	}

	search(query: string, options: SearchOptions = {}): PanelSearchResult[] {
		const q = query.trim().toLowerCase();
		if (!q) return [];

		const limit = options.limit ?? 50;
		const out: PanelSearchResult[] = [];
		const chatIds = options.chatId !== undefined ? [options.chatId] : [...this.#messages.keys()];

		for (const chatId of chatIds) {
			for (const message of this.#messages.get(chatId) ?? []) {
				if (!message.text.toLowerCase().includes(q)) continue;

				out.push({ chatId, message: { ...message } });
				if (out.length >= limit) return out;
			}
		}

		return out;
	}

	subscribe(listener: (event: PanelEvent) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}
}

/** how {@link recorder} / {@link recordTelegramUpdate} decide which chats to log. */
export type RecorderScope = "private" | "all" | ((chat: { id: number; type: string }) => boolean);

/** resolve a chat's id under a {@link RecorderScope}, or undefined if it's out of scope. */
function scopedChatId(chat: unknown, scope: RecorderScope): number | undefined {
	if (!isRecord(chat)) return undefined;

	const id = numberValue(chat.id);
	const type = stringValue(chat.type);
	if (id === undefined || type === undefined) return undefined;

	const matches =
		scope === "all" ? true : scope === "private" ? type === "private" : scope({ id, type });
	return matches ? id : undefined;
}

function chatIdentity(chatId: number, user: unknown): PanelChatRecord {
	const out: PanelChatRecord = { id: chatId };

	if (isRecord(user)) {
		const firstName = stringValue(user.first_name);
		const lastName = stringValue(user.last_name);
		const username = stringValue(user.username);

		if (firstName) out.firstName = firstName;
		if (lastName) out.lastName = lastName;
		if (username) out.username = username;

		const fullName = [firstName, lastName].filter(Boolean).join(" ");
		out.name = username ? `@${username}` : fullName || undefined;
	}

	out.name ??= `chat ${chatId}`;
	return out;
}

function eventMessage(
	type: PanelMessageEventType,
	title: string,
	detail?: string,
	data?: string,
): PanelMessage {
	const event: PanelMessageEvent = { type, title };
	if (detail) event.detail = detail;
	if (data) event.data = data;

	return {
		direction: "in",
		text: detail ? `${title}: ${detail}` : title,
		date: Math.floor(Date.now() / 1000),
		event,
	};
}

function reactionCount(raw: unknown): number | undefined {
	return Array.isArray(raw) ? raw.length : undefined;
}

function eventRecord(
	update: Record<string, unknown>,
	scope: RecorderScope,
): { chat: PanelChatRecord; message: PanelMessage } | undefined {
	if (isRecord(update.callback_query)) {
		const query = update.callback_query;
		const message = isRecord(query.message) ? query.message : undefined;
		const chatId = scopedChatId(message?.chat, scope);
		if (chatId === undefined) return undefined;

		const data = stringValue(query.data);
		return {
			chat: chatIdentity(chatId, query.from),
			message: eventMessage("callback", "button clicked", data ?? "callback query", data),
		};
	}

	if (isRecord(update.message_reaction)) {
		const reaction = update.message_reaction;
		const chatId = scopedChatId(reaction.chat, scope);
		if (chatId === undefined) return undefined;

		const next = reactionCount(reaction.new_reaction) ?? 0;
		const detail = `changed to ${next} reaction${next === 1 ? "" : "s"}`;
		return {
			chat: chatIdentity(chatId, reaction.user),
			message: eventMessage("reaction", "message reaction", detail),
		};
	}

	if (isRecord(update.message_reaction_count)) {
		const reaction = update.message_reaction_count;
		const chatId = scopedChatId(reaction.chat, scope);
		if (chatId === undefined) return undefined;

		const next = reactionCount(reaction.reactions) ?? 0;
		const detail = `${next} reaction type${next === 1 ? "" : "s"}`;
		return {
			chat: chatIdentity(chatId, reaction.chat),
			message: eventMessage("reaction_count", "reaction count", detail),
		};
	}

	if (isRecord(update.poll_answer)) {
		// poll answers carry no `chat` object (just the answering user) — there's nothing to
		// scope-check, so this always attributes them to the user's implied private chat.
		const answer = update.poll_answer;
		const user = answer.user;
		if (!isRecord(user)) return undefined;

		const chatId = numberValue(user.id);
		if (chatId === undefined) return undefined;

		const optionIds = Array.isArray(answer.option_ids)
			? answer.option_ids.filter((id): id is number => typeof id === "number")
			: [];

		return {
			chat: chatIdentity(chatId, user),
			message: eventMessage("poll_answer", "poll answer", `options ${optionIds.join(", ")}`),
		};
	}

	const member = isRecord(update.my_chat_member)
		? update.my_chat_member
		: isRecord(update.chat_member)
			? update.chat_member
			: undefined;
	if (member) {
		const chatId = scopedChatId(member.chat, scope);
		if (chatId === undefined) return undefined;

		const next = isRecord(member.new_chat_member)
			? stringValue(member.new_chat_member.status)
			: undefined;

		return {
			chat: chatIdentity(chatId, member.from),
			message: eventMessage("chat_member", "chat member", next ?? "updated"),
		};
	}

	return undefined;
}

/** options for {@link recordTelegramUpdate} / {@link recorder}. */
export interface RecorderOptions {
	/** which chats to record. default `"private"` — matches the panel's original behavior. */
	chats?: RecorderScope;
}

/** records a raw Telegram update into the store; useful from any bot framework. */
export async function recordTelegramUpdate(
	store: PanelStore,
	update: unknown,
	options: RecorderOptions = {},
): Promise<boolean> {
	if (!isRecord(update)) return false;
	const scope = options.chats ?? "private";

	let recorded = false;

	// channel posts only match when `scope` allows non-private chats (default "private" excludes them)
	const rawMessage = update.message ?? update.channel_post;
	if (isRecord(rawMessage)) {
		const chatId = scopedChatId(rawMessage.chat, scope);
		const message = toPanelMessage("in", rawMessage);
		if (chatId !== undefined && message) {
			await store.record(chatIdentity(chatId, rawMessage.from), message);
			recorded = true;
		}
	}

	if (isRecord(update.edited_message)) {
		const edited = update.edited_message;
		const chatId = scopedChatId(edited.chat, scope);
		const messageId = numberValue(edited.message_id);
		if (chatId !== undefined && messageId !== undefined) {
			await store.updateMessage(chatId, messageId, { text: describe(edited) ?? "", edited: true });
			recorded = true;
		}
	}

	const event = eventRecord(update, scope);
	if (event) {
		await store.record(event.chat, event.message);
		recorded = true;
	}

	return recorded;
}

/** records updates into the store so the panel can show them (default: private chats only). */
export function recorder(
	store: PanelStore,
	options: RecorderOptions = {},
): Plugin<Context, Record<never, never>> {
	const scope = options.chats ?? "private";

	const plugin: Plugin<Context, Record<never, never>> = (composer) =>
		composer.use(async (ctx, next) => {
			await recordTelegramUpdate(store, ctx.update, { chats: scope });
			await next();
		});

	return plugin;
}

/** options for {@link handoff}. */
export interface HandoffOptions {
	/** statuses under which the bot's own handlers are suppressed. default `["handled"]`. */
	suppressOn?: PanelChatStatus[];
}

/**
 * a guard: once an operator marks a chat `"handled"` (via the panel), the bot's own handlers
 * stop firing for it — install this *before* your other handlers so it can short-circuit them.
 * pairs with the panel's status toggle: an operator "takes over" a conversation and the bot
 * goes quiet until they release it back to `"open"`.
 *
 * ```ts
 * bot.install(recorder(store));
 * bot.install(handoff(store)); // must come before your reply handlers
 * bot.on("message:text", (ctx) => ctx.reply("..."));
 * ```
 */
export function handoff(
	store: PanelStore,
	options: HandoffOptions = {},
): Plugin<Context, Record<never, never>> {
	const suppress = new Set<PanelChatStatus>(options.suppressOn ?? ["handled"]);

	const plugin: Plugin<Context, Record<never, never>> = (composer) =>
		composer.use(async (ctx, next) => {
			const chat = ctx.chat;
			if (chat?.type === "private") {
				const status = await store.status(chat.id);
				if (status && suppress.has(status)) return; // an operator owns this conversation
			}
			return next();
		});

	return plugin;
}

/**
 * what {@link panelHandler} needs from the api. `sendMessage` is required; `call` unlocks
 * media proxying, operator uploads, edit/delete/typing (present on the real `@yaebal/core`
 * `Api`). without it, those routes answer `501`. `fileUrl` unlocks the file proxy specifically.
 */
export interface PanelApi {
	sendMessage(params: { chat_id: number | string; text: string }): Promise<unknown>;
	call?<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
	fileUrl?(filePath: string): string;
}

/** create a small Bot API client that satisfies {@link PanelApi}; useful with any framework. */
export function createPanelApi(token: string, options?: ApiOptions): PanelApi {
	return createApi(token, options);
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

/**
 * the slice of `@yaebal/core`'s `Api` that {@link recordOutgoing} needs. matches the real
 * `AfterHook` shape — `(method, params, result)` — exactly: the engine always calls hooks
 * with all three positionally, so a hook declaring fewer params silently binds `params` to
 * whatever name the second parameter is given, never seeing the real `result` at all.
 */
interface AfterHookApi {
	after(
		hook: (method: string, params: Record<string, unknown> | undefined, result: unknown) => unknown,
	): unknown;
}

/** report a store/api failure through `onError` instead of letting it vanish (or crash the process). */
function reportError(
	onError: ((error: unknown, context: string) => void) | undefined,
	context: string,
) {
	return (error: unknown): void => {
		onError?.(error, context);
	};
}

/** log a single telegram message result as an outgoing record (text or media). */
function recordResult(
	store: PanelStore,
	result: unknown,
	operator: string | undefined,
	onError: ((error: unknown, context: string) => void) | undefined,
): void {
	if (!result || typeof result !== "object") return;

	const raw = result as Record<string, unknown>;
	const chat = raw.chat as { id?: number; type?: string } | undefined;
	if (chat?.id === undefined || chat.type !== "private") return;

	const message = toPanelMessage("out", raw);
	if (!message) return;
	if (operator) message.operator = operator;

	try {
		const outcome = store.record(chatIdentity(chat.id, raw.chat), message);
		if (outcome instanceof Promise) outcome.catch(reportError(onError, "record"));
	} catch (error) {
		reportError(onError, "record")(error);
	}
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
export function recordOutgoing<A extends AfterHookApi>(
	api: A,
	store: PanelStore,
	options: { onError?: (error: unknown, context: string) => void } = {},
): A {
	api.after((method, _params, result) => {
		try {
			if (method.startsWith("send")) {
				if (Array.isArray(result)) {
					for (const item of result) recordResult(store, item, undefined, options.onError);
				} else recordResult(store, result, undefined, options.onError);
			}
		} catch (error) {
			// a broken store must never take down the bot's own send pipeline
			reportError(options.onError, "recordOutgoing")(error);
		}
		return result;
	});

	return api;
}

/** a named operator identity — its `token` authenticates it, its `name` shows up in the audit trail. */
export interface PanelOperator {
	name: string;
	token: string;
}

/** a static canned-response template surfaced in the panel's composer. */
export interface CannedResponse {
	label: string;
	text: string;
}

export interface PanelOptions {
	/** single shared token — shorthand for `operators: [{ name: "operator", token }]`. */
	token?: string;
	/** named operators, each with their own token — enables per-send audit + `assign()`. */
	operators?: PanelOperator[];
	/**
	 * allowed CORS origin(s) for the panel api. omit for same-origin only (default).
	 * pass `"*"` to allow any origin, or an explicit list to echo a matching `Origin` back.
	 * note: session cookies require credentialed CORS, which browsers refuse for `"*"` — list
	 * explicit origins if you both embed cross-origin *and* want cookie-based operator login.
	 */
	cors?: string | string[];
	/**
	 * mount prefix when the handler does not live at the server root, e.g. `"/panel"`.
	 * the UI builds its api urls from this, so no extra rewriting is needed. default `""`.
	 */
	basePath?: string;
	/**
	 * throttle failed auth attempts per client. defaults to 10 failures / 60s, then `429`
	 * until the window passes. pass `false` to disable. a request presenting no credential at
	 * all (e.g. a reconnecting `EventSource` whose session expired) never counts as a failure —
	 * only a *wrong* token does, so an expired session can't lock an operator out of logging back in.
	 */
	rateLimit?: { max?: number; windowMs?: number } | false;
	/**
	 * derive a client key for rate limiting. defaults to the socket address `serve()` stamps
	 * on the request (`x-panel-remote-addr`), falling back to a single shared bucket when
	 * that's absent (e.g. mounted directly on bun/deno/an edge runtime without going through
	 * `@yaebal/panel/serve`) — supply your own to use that platform's client-ip mechanism.
	 */
	clientKey?: (request: Request) => string;
	/**
	 * trust `x-forwarded-for`/`x-real-ip` (client-supplied, spoofable unless a proxy in front
	 * of this handler strips and re-sets them) for rate-limit keys and `Secure`-cookie detection
	 * via `x-forwarded-proto`. default `false` — only enable this behind a proxy you control.
	 */
	trustProxy?: boolean;
	/**
	 * record replies sent from the panel into the store. default `true`. set to `false`
	 * when you use {@link recordOutgoing}, which already captures every outgoing message.
	 */
	recordSends?: boolean;
	/** cap an operator file upload at this many bytes. default 50 MiB (telegram's own limit). */
	maxUploadBytes?: number;
	/** operator session cookie lifetime in ms. default 12 hours. */
	sessionTtlMs?: number;
	/** static canned-response templates surfaced in the composer's quick-reply menu. */
	cannedResponses?: CannedResponse[];
	/** notify this chat (usually the bot admin's own DM) when a message arrives with no panel connected. */
	notifyChatId?: number | string;
	/** called with any error the store or api throws, so failures don't vanish silently. */
	onError?: (error: unknown, context: string) => void;
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
	// hard cap so a client that rotates its key (e.g. a spoofed x-forwarded-for under
	// `trustProxy`) can't grow this map without bound — evicts the oldest tracked key.
	const maxKeys = 5000;
	const hits = new Map<string, { count: number; resetAt: number }>();

	function sweepExpired(now: number): void {
		for (const [key, entry] of hits) if (now >= entry.resetAt) hits.delete(key);
	}

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
			sweepExpired(now);

			const entry = hits.get(key);
			if (!entry || now >= entry.resetAt) {
				if (hits.size >= maxKeys) {
					const oldest = hits.keys().next().value;
					if (oldest !== undefined) hits.delete(oldest);
				}
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

/** client key from the socket address `serve()` stamps — see {@link PanelOptions.clientKey}. */
function defaultClientKey(request: Request): string {
	return request.headers.get("x-panel-remote-addr") ?? "shared";
}

/** client key trusting proxy-supplied headers — only used when `trustProxy: true`. */
function trustingClientKey(request: Request): string {
	const fwd = request.headers.get("x-forwarded-for");
	const forwardedIp = fwd?.split(",")[0]?.trim();
	if (forwardedIp) return forwardedIp;

	return request.headers.get("x-real-ip") ?? defaultClientKey(request);
}

/** whether the connection should be treated as https (for the session cookie's `Secure` flag). */
function isSecureRequest(request: Request, trustProxy: boolean): boolean {
	if (new URL(request.url).protocol === "https:") return true;
	return trustProxy && request.headers.get("x-forwarded-proto") === "https";
}

const SESSION_COOKIE = "panel_session";

function cookieSessionId(request: Request): string | undefined {
	const cookie = request.headers.get("cookie");
	return cookie?.match(/(?:^|;\s*)panel_session=([^;]+)/)?.[1];
}

function sessionCookieHeader(
	id: string,
	base: string,
	maxAgeSeconds: number,
	secure: boolean,
): string {
	const parts = [`${SESSION_COOKIE}=${id}`, "HttpOnly", "SameSite=Strict", `Path=${base || "/"}`];
	parts.push(`Max-Age=${maxAgeSeconds}`);
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

function clearSessionCookieHeader(base: string, secure: boolean): string {
	const parts = [
		`${SESSION_COOKIE}=`,
		"HttpOnly",
		"SameSite=Strict",
		`Path=${base || "/"}`,
		"Max-Age=0",
	];
	if (secure) parts.push("Secure");
	return parts.join("; ");
}

/** fields a panel client may pass through to `sendMessage` alongside `chat_id`/`text`. */
const SEND_PASSTHROUGH = [
	"parse_mode",
	"entities",
	"link_preview_options",
	"reply_to_message_id",
	"reply_parameters",
	"reply_markup",
	"disable_notification",
	"protect_content",
] as const;

/** an SSE response that forwards store events to the browser (keep-alive pinged). */
function streamResponse(
	store: PanelStore,
	onConnectedChange: (connected: boolean) => void,
): Response {
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
			onConnectedChange(true);
			unsubscribe = store.subscribe?.((event) =>
				push(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
			);
			ping = setInterval(() => push(": ping\n\n"), 25_000);
		},
		cancel() {
			if (ping) clearInterval(ping);
			unsubscribe?.();
			onConnectedChange(false);
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
 * root, and an api to list/search/export chats, read a conversation, stream updates, and
 * send, reply to, edit or delete a message. mount it on any fetch-compatible server.
 */
export function panelHandler(
	api: PanelApi,
	store: PanelStore,
	options: PanelOptions,
): (request: Request) => Promise<Response> {
	const operators: PanelOperator[] = [
		...(options.token ? [{ name: "operator", token: options.token }] : []),
		...(options.operators ?? []),
	];
	if (operators.length === 0) {
		throw new Error("panelHandler: provide a non-empty `token` or at least one `operators` entry");
	}

	const base = normalizeBase(options.basePath);
	const limiter = createLimiter(options.rateLimit);
	const trustProxy = options.trustProxy ?? false;
	const clientKey = options.clientKey ?? (trustProxy ? trustingClientKey : defaultClientKey);
	const maxUploadBytes = options.maxUploadBytes ?? 50 * 1024 * 1024;
	const sessionTtlMs = options.sessionTtlMs ?? 12 * 60 * 60 * 1000;
	const onError = options.onError;

	const sessions = new Map<string, { operator: string; expiresAt: number }>();

	function findOperator(token: string): PanelOperator | undefined {
		if (!token) return undefined;
		for (const op of operators) if (safeEqual(token, op.token)) return op;
		return undefined;
	}

	function newSession(operatorName: string): string {
		const now = Date.now();
		for (const [id, entry] of sessions) if (now >= entry.expiresAt) sessions.delete(id);

		const id = crypto.randomUUID();
		sessions.set(id, { operator: operatorName, expiresAt: now + sessionTtlMs });
		return id;
	}

	function sessionOperator(request: Request): string | undefined {
		const id = cookieSessionId(request);
		if (!id) return undefined;

		const entry = sessions.get(id);
		if (!entry) return undefined;
		if (Date.now() > entry.expiresAt) {
			sessions.delete(id);
			return undefined;
		}
		return entry.operator;
	}

	/** session cookie first, else a `Bearer` token — used by every authenticated api route. */
	function resolveOperator(request: Request): string | undefined {
		const bySession = sessionOperator(request);
		if (bySession) return bySession;

		const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
		return bearer ? findOperator(bearer)?.name : undefined;
	}

	let activeStreams = 0;

	async function notifyIfIdle(chatId: number): Promise<void> {
		if (activeStreams > 0 || !options.notifyChatId) return;
		try {
			await api.sendMessage({
				chat_id: options.notifyChatId,
				text: `panel: new message in chat ${chatId} (no operator online)`,
			});
		} catch (error) {
			onError?.(error, "notify");
		}
	}

	// fire admin notifications straight off the store's own event stream — the only place
	// that reliably sees every incoming message, regardless of which route (or framework
	// middleware) recorded it. (a previous version tried to trigger this from the panel's
	// own send routes with `direction: "out"`, which can never match an "in" check — the
	// notifyChatId option silently never fired.) only subscribe when the feature is actually
	// configured: `store.subscribe` has no matching unsubscribe call here (this listener is
	// meant to live as long as the handler does), so an unconditional subscription would be
	// a permanent, unbounded listener leak for every `panelHandler()` construction that
	// doesn't even use notifications.
	if (options.notifyChatId) {
		store.subscribe?.((event) => {
			if (event.type === "record" && event.direction === "in") {
				notifyIfIdle(event.chatId).catch(() => {});
			}
		});
	}

	async function route(
		request: Request,
		finish: (response: Response) => Response,
	): Promise<Response> {
		// preflight is unauthenticated by spec — answer it before anything else
		if (request.method === "OPTIONS") {
			return finish(
				new Response(null, {
					status: 204,
					headers: {
						"access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
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
						"referrer-policy": "no-referrer",
						"x-frame-options": "DENY",
						"content-security-policy":
							"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
						"x-content-type-options": "nosniff",
					},
				}),
			);
		}

		const secureCookie = isSecureRequest(request, trustProxy);

		if (path === "/api/login" && request.method === "POST") {
			const key = clientKey(request);
			const wait = limiter?.blockedFor(key) ?? 0;
			if (wait > 0) {
				const res = json({ error: "too many attempts" }, 429);
				res.headers.set("retry-after", String(Math.ceil(wait / 1000)));
				return finish(res);
			}

			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const provided = typeof body.token === "string" ? body.token : "";
			const op = provided ? findOperator(provided) : undefined;
			if (!op) {
				limiter?.fail(key);
				return finish(json({ error: "invalid token" }, 401));
			}
			limiter?.reset(key);

			const id = newSession(op.name);
			const res = json({ operator: op.name });
			res.headers.append(
				"set-cookie",
				sessionCookieHeader(id, base, Math.floor(sessionTtlMs / 1000), secureCookie),
			);
			return finish(res);
		}

		if (path === "/api/logout" && request.method === "POST") {
			const id = cookieSessionId(request);
			if (id) sessions.delete(id);

			const res = json({ ok: true });
			res.headers.append("set-cookie", clearSessionCookieHeader(base, secureCookie));
			return finish(res);
		}

		// ---- everything below requires a valid operator identity ----

		const key = clientKey(request);
		const wait = limiter?.blockedFor(key) ?? 0;
		if (wait > 0) {
			const res = json({ error: "too many attempts" }, 429);
			res.headers.set("retry-after", String(Math.ceil(wait / 1000)));
			return finish(res);
		}

		const bearerProvided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
		const operatorName = resolveOperator(request);
		if (!operatorName) {
			// only penalize the limiter when a credential was actually presented and wrong — a
			// bare missing/expired session (e.g. an EventSource reconnecting every few seconds
			// after the cookie expired) isn't a guess and must never lock the operator out.
			if (bearerProvided) limiter?.fail(key);
			return finish(json({ error: "unauthorized" }, 401));
		}
		limiter?.reset(key);

		if (path === "/api/session" && request.method === "GET") {
			return finish(json({ operator: operatorName }));
		}

		if (path === "/api/chats" && request.method === "GET") {
			const opts: ChatsOptions = {};
			const limit = url.searchParams.get("limit");
			const offset = url.searchParams.get("offset");
			const status = url.searchParams.get("status");
			if (limit !== null && Number.isFinite(Number(limit))) opts.limit = Number(limit);
			if (offset !== null && Number.isFinite(Number(offset))) opts.offset = Number(offset);
			if (status === "open" || status === "handled" || status === "archived") opts.status = status;
			return finish(json(await store.chats(opts)));
		}

		if (path === "/api/canned" && request.method === "GET") {
			return finish(json(options.cannedResponses ?? []));
		}

		if (path === "/api/search" && request.method === "GET") {
			if (!store.search) return finish(json({ error: "store does not support search" }, 501));

			const q = url.searchParams.get("q") ?? "";
			if (!q) return finish(json([]));

			const opts: SearchOptions = {};
			const chatIdParam = url.searchParams.get("chatId");
			const limitParam = url.searchParams.get("limit");
			if (chatIdParam !== null && Number.isFinite(Number(chatIdParam)))
				opts.chatId = Number(chatIdParam);
			if (limitParam !== null && Number.isFinite(Number(limitParam)))
				opts.limit = Number(limitParam);

			return finish(json(await store.search(q, opts)));
		}

		// realtime stream of store events (EventSource can't set headers, but it's same-origin
		// so the session cookie is sent automatically — no token in the url)
		if (path === "/api/stream" && request.method === "GET") {
			return finish(
				streamResponse(store, (connected) => {
					activeStreams += connected ? 1 : -1;
				}),
			);
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

		const exportMatch = path.match(/^\/api\/chats\/(-?\d+)\/export$/);
		if (exportMatch?.[1] && request.method === "GET") {
			const chatId = Number(exportMatch[1]);
			const messages = await store.history(chatId);
			const format = url.searchParams.get("format") === "text" ? "text" : "json";

			if (format === "text") {
				const body = messages
					.map((m) => `[${new Date(m.date * 1000).toISOString()}] ${m.direction}: ${m.text}`)
					.join("\n");
				return finish(
					new Response(body, {
						headers: {
							"content-type": "text/plain; charset=utf-8",
							"content-disposition": `attachment; filename="chat-${chatId}.txt"`,
						},
					}),
				);
			}

			return finish(
				new Response(JSON.stringify(messages, null, 2), {
					headers: {
						"content-type": "application/json; charset=utf-8",
						"content-disposition": `attachment; filename="chat-${chatId}.json"`,
					},
				}),
			);
		}

		const statusMatch = path.match(/^\/api\/chats\/(-?\d+)\/status$/);
		if (statusMatch?.[1] && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			if (body.status !== "open" && body.status !== "handled" && body.status !== "archived") {
				return finish(json({ error: "status must be open, handled or archived" }, 400));
			}
			await store.setStatus(Number(statusMatch[1]), body.status);
			return finish(json({ ok: true }));
		}

		const assignMatch = path.match(/^\/api\/chats\/(-?\d+)\/assign$/);
		if (assignMatch?.[1] && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			const assignee = body.operator === null ? null : stringValue(body.operator);
			if (assignee === undefined) return finish(json({ error: "operator required" }, 400));
			await store.assign(Number(assignMatch[1]), assignee);
			return finish(json({ ok: true }));
		}

		const pinMatch = path.match(/^\/api\/chats\/(-?\d+)\/pin$/);
		if (pinMatch?.[1] && request.method === "POST") {
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			await store.pin(Number(pinMatch[1]), body.pinned === true);
			return finish(json({ ok: true }));
		}

		const typingMatch = path.match(/^\/api\/chats\/(-?\d+)\/typing$/);
		if (typingMatch?.[1] && request.method === "POST") {
			// fire-and-forget: this is cosmetic only, so the browser must never wait on
			// telegram's response time (rate-limit backoff, a slow network, autoRetry
			// retries…) to hear back "ok" — awaiting it here made every keystroke feel as
			// slow as the single slowest telegram call, for a feature nobody needs confirmed.
			if (api.call) {
				api
					.call("sendChatAction", { chat_id: Number(typingMatch[1]), action: "typing" })
					.catch(reportError(onError, "typing"));
			}
			return finish(json({ ok: true }));
		}

		const editMatch = path.match(/^\/api\/chats\/(-?\d+)\/messages\/(\d+)\/edit$/);
		if (editMatch?.[1] && editMatch[2] && request.method === "POST") {
			if (!api.call) return finish(json({ error: "editing needs an api with call()" }, 501));

			const chatId = Number(editMatch[1]);
			const messageId = Number(editMatch[2]);
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			if (typeof body.text !== "string" || !body.text) {
				return finish(json({ error: "text required" }, 400));
			}

			await api.call("editMessageText", {
				chat_id: chatId,
				message_id: messageId,
				text: body.text,
			});
			await store.updateMessage(chatId, messageId, { text: body.text, edited: true });
			return finish(json({ ok: true }));
		}

		const deleteMsgMatch = path.match(/^\/api\/chats\/(-?\d+)\/messages\/(\d+)\/delete$/);
		if (deleteMsgMatch?.[1] && deleteMsgMatch[2] && request.method === "POST") {
			if (!api.call) return finish(json({ error: "deleting needs an api with call()" }, 501));

			const chatId = Number(deleteMsgMatch[1]);
			const messageId = Number(deleteMsgMatch[2]);
			await api.call("deleteMessage", { chat_id: chatId, message_id: messageId });
			await store.updateMessage(chatId, messageId, { deleted: true });
			return finish(json({ ok: true }));
		}

		const deleteChatMatch = path.match(/^\/api\/chats\/(-?\d+)$/);
		if (deleteChatMatch?.[1] && request.method === "DELETE") {
			await store.deleteChat(Number(deleteChatMatch[1]));
			return finish(json({ ok: true }));
		}

		const get = path.match(/^\/api\/chats\/(-?\d+)$/);
		if (get?.[1] && request.method === "GET") {
			const chatId = Number(get[1]);
			const beforeParam = url.searchParams.get("before");
			const beforeSeqParam = url.searchParams.get("beforeSeq");
			const limitParam = url.searchParams.get("limit");

			const opts: HistoryOptions = {};
			if (beforeParam !== null) {
				if (!Number.isFinite(Number(beforeParam)))
					return finish(json({ error: "invalid before" }, 400));
				opts.before = Number(beforeParam);
			}
			if (beforeSeqParam !== null) {
				if (!Number.isFinite(Number(beforeSeqParam))) {
					return finish(json({ error: "invalid beforeSeq" }, 400));
				}
				opts.beforeSeq = Number(beforeSeqParam);
			}
			if (limitParam !== null) {
				if (!Number.isFinite(Number(limitParam)))
					return finish(json({ error: "invalid limit" }, 400));
				opts.limit = Number(limitParam);
			}

			const [messages] = await Promise.all([store.history(chatId, opts), store.markRead(chatId)]);
			return finish(json(messages));
		}

		const send = path.match(/^\/api\/chats\/(-?\d+)\/send$/);
		if (send?.[1] && request.method === "POST") {
			const chatId = Number(send[1]);
			const contentType = request.headers.get("content-type") ?? "";

			// ---- operator file upload (multipart) -> sendPhoto / sendDocument / sendVoice / ... ----
			if (contentType.includes("multipart/form-data")) {
				if (!api.call) {
					return finish(json({ error: "uploads need an api with call()" }, 501));
				}

				const form = await request.formData().catch(() => undefined);
				const file = form?.get("file");
				if (!(file instanceof Blob)) return finish(json({ error: "file required" }, 400));
				if (file.size > maxUploadBytes) return finish(json({ error: "file too large" }, 413));

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
				if (options.recordSends !== false) recordResult(store, result, operatorName, onError);

				return finish(json({ ok: true }));
			}

			// ---- text reply (json) → sendMessage ----
			const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
			if (typeof body.text !== "string" || !body.text) {
				return finish(json({ error: "text required" }, 400));
			}

			const params: { chat_id: number | string; text: string } & Record<string, unknown> = {
				chat_id: chatId,
				text: body.text,
			};
			for (const field of SEND_PASSTHROUGH) {
				if (body[field] !== undefined) params[field] = body[field];
			}
			if (typeof body.replyToId === "number" && params.reply_parameters === undefined) {
				params.reply_parameters = { message_id: body.replyToId };
			}

			const result = await api.sendMessage(params);
			// skip when recordOutgoing already logs every send (avoids double entries)
			if (options.recordSends !== false) {
				// record from the api result when it's a real message, else fall back to the text
				if (result && typeof result === "object" && "chat" in result) {
					recordResult(store, result, operatorName, onError);
				} else {
					const fallback = toPanelMessage("out", {
						text: body.text,
						date: Math.floor(Date.now() / 1000),
						reply_markup: body.reply_markup,
					}) ?? { direction: "out", text: body.text, date: Math.floor(Date.now() / 1000) };
					fallback.operator = operatorName;

					await store.record({ id: chatId }, fallback);
				}
			}

			return finish(json({ ok: true }));
		}

		return finish(json({ error: "not found" }, 404));
	}

	return async (request) => {
		const allowOrigin = corsOrigin(options.cors, request);

		// attach CORS headers (when enabled) to every response the handler returns
		const finish = (response: Response): Response => {
			if (allowOrigin) {
				response.headers.set("access-control-allow-origin", allowOrigin);
				response.headers.set("vary", "origin");
				if (allowOrigin !== "*") response.headers.set("access-control-allow-credentials", "true");
			}
			return response;
		};

		try {
			return await route(request, finish);
		} catch (error) {
			onError?.(error, "handler");
			return finish(json({ error: "internal error" }, 500));
		}
	};
}
