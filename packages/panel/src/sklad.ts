import type {
	ChatsOptions,
	HistoryOptions,
	MaybePromise,
	MessagePatch,
	PanelChat,
	PanelChatRecord,
	PanelChatStatus,
	PanelEvent,
	PanelMessage,
	PanelSearchResult,
	PanelStore,
	SearchOptions,
} from "./index.js";

/**
 * the subset of `@yaebal/sklad`'s `StorageAdapter<T>` this bridge needs — typed structurally
 * (the same pattern `@yaebal/cron`'s `CronStoreAdapter` uses) so `@yaebal/panel` never depends
 * on `@yaebal/sklad` at runtime, keeping edge bundles clean. `MemoryStorage`, `redisStorage`,
 * `sqliteStorage`, `kvStorage` — or a custom adapter — all satisfy this shape as-is.
 */
export interface SkladLikeAdapter<T> {
	get(key: string): MaybePromise<T | undefined>;
	set(key: string, value: T): MaybePromise<unknown>;
	delete(key: string): MaybePromise<unknown>;
}

interface ChatIndexEntry {
	id: number;
	name: string;
	firstName?: string;
	lastName?: string;
	username?: string;
	lastText: string;
	lastDate: number;
	lastAttachmentType?: PanelChat["lastAttachmentType"];
	lastEventType?: PanelChat["lastEventType"];
	status: PanelChatStatus;
	unread: number;
	assignedTo?: string;
	pinned?: boolean;
}

type StoredMessage = PanelMessage & { seq: number };

export interface SkladPanelStoreOptions {
	/** keep at most this many messages per chat. default 1000. */
	maxHistory?: number;
	/** key prefix, in case the adapter's keyspace is shared with other yaebal state. default `"panel:"`. */
	prefix?: string;
}

function toPanelChat(entry: ChatIndexEntry): PanelChat {
	const chat: PanelChat = {
		id: entry.id,
		name: entry.name,
		lastText: entry.lastText,
		lastDate: entry.lastDate,
		status: entry.status,
		unread: entry.unread,
	};
	if (entry.firstName) chat.firstName = entry.firstName;
	if (entry.lastName) chat.lastName = entry.lastName;
	if (entry.username) chat.username = entry.username;
	if (entry.lastAttachmentType) chat.lastAttachmentType = entry.lastAttachmentType;
	if (entry.lastEventType) chat.lastEventType = entry.lastEventType;
	if (entry.assignedTo) chat.assignedTo = entry.assignedTo;
	if (entry.pinned) chat.pinned = entry.pinned;
	return chat;
}

/**
 * a {@link PanelStore} backed by any `@yaebal/sklad` `StorageAdapter` — Redis, Cloudflare KV,
 * a flat file, or `MemoryStorage` itself. gives the panel persistence anywhere `node:sqlite`
 * isn't available (edge runtimes, Node < 22.5), at the cost of read-modify-write semantics on
 * every write. that's fine for a single bot process — the model every other yaebal plugin's
 * sklad integration already uses — but a multi-process deployment sharing one store wants
 * `SqlitePanelStore` (or a store backed by a database with real transactions) instead.
 *
 * ```ts
 * import { MemoryStorage } from "@yaebal/sklad"; // or redisStorage/kvStorage/sqliteStorage
 * import { skladPanelStore } from "@yaebal/panel/sklad";
 *
 * const store = skladPanelStore(new MemoryStorage());
 * ```
 */
export function skladPanelStore(
	adapter: SkladLikeAdapter<unknown>,
	options: SkladPanelStoreOptions = {},
): PanelStore {
	const maxHistory = options.maxHistory ?? 1000;
	const prefix = options.prefix ?? "panel:";
	const indexKey = `${prefix}index`;
	const historyKey = (chatId: number) => `${prefix}history:${chatId}`;

	const listeners = new Set<(event: PanelEvent) => void>();
	let seq = 0;

	async function readIndex(): Promise<Map<number, ChatIndexEntry>> {
		const raw = (await adapter.get(indexKey)) as ChatIndexEntry[] | undefined;
		return new Map((raw ?? []).map((entry) => [entry.id, entry]));
	}

	async function writeIndex(index: Map<number, ChatIndexEntry>): Promise<void> {
		await adapter.set(indexKey, [...index.values()]);
	}

	async function readHistory(chatId: number): Promise<StoredMessage[]> {
		return ((await adapter.get(historyKey(chatId))) as StoredMessage[] | undefined) ?? [];
	}

	async function writeHistory(chatId: number, list: StoredMessage[]): Promise<void> {
		await adapter.set(historyKey(chatId), list);
	}

	function emit(event: PanelEvent): void {
		for (const fn of listeners) fn(event);
	}

	return {
		async record(chat: PanelChatRecord, message: PanelMessage) {
			seq += 1;
			const stored: StoredMessage = { ...message, seq };

			const list = await readHistory(chat.id);
			list.push(stored);
			if (list.length > maxHistory) list.shift();
			await writeHistory(chat.id, list);

			const index = await readIndex();
			const prev = index.get(chat.id);
			const next: ChatIndexEntry = {
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

			if (firstName) next.firstName = firstName;
			if (lastName) next.lastName = lastName;
			if (username) next.username = username;
			if (lastAttachmentType) next.lastAttachmentType = lastAttachmentType;
			if (message.event?.type) next.lastEventType = message.event.type;
			if (prev?.assignedTo) next.assignedTo = prev.assignedTo;
			if (prev?.pinned) next.pinned = prev.pinned;

			index.set(chat.id, next);
			await writeIndex(index);

			emit({ type: "record", chatId: chat.id, direction: message.direction });
		},

		async chats(chatsOptions: ChatsOptions = {}) {
			const index = await readIndex();
			let list = [...index.values()];

			if (chatsOptions.status) list = list.filter((c) => c.status === chatsOptions.status);
			list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastDate - a.lastDate);
			if (chatsOptions.offset) list = list.slice(chatsOptions.offset);
			if (chatsOptions.limit !== undefined) list = list.slice(0, chatsOptions.limit);

			return list.map(toPanelChat);
		},

		async history(chatId: number, historyOptions: HistoryOptions = {}) {
			let list = await readHistory(chatId);

			if (historyOptions.before !== undefined) {
				const before = historyOptions.before;
				const beforeSeq = historyOptions.beforeSeq;
				list = list.filter((m) =>
					beforeSeq !== undefined
						? m.date < before || (m.date === before && m.seq < beforeSeq)
						: m.date < before,
				);
			}
			if (historyOptions.limit !== undefined) list = list.slice(-historyOptions.limit);

			return list.map((m) => ({ ...m }));
		},

		async status(chatId: number) {
			return (await readIndex()).get(chatId)?.status;
		},

		async setStatus(chatId: number, status: PanelChatStatus) {
			const index = await readIndex();
			const chat = index.get(chatId);
			if (!chat) return;

			chat.status = status;
			await writeIndex(index);
			emit({ type: "status", chatId, status });
		},

		async assign(chatId: number, operator: string | null) {
			const index = await readIndex();
			const chat = index.get(chatId);
			if (!chat) return;

			chat.assignedTo = operator ?? undefined;
			await writeIndex(index);
			emit({ type: "chat", chatId });
		},

		async pin(chatId: number, pinned: boolean) {
			const index = await readIndex();
			const chat = index.get(chatId);
			if (!chat) return;

			chat.pinned = pinned;
			await writeIndex(index);
			emit({ type: "chat", chatId });
		},

		async markRead(chatId: number) {
			const index = await readIndex();
			const chat = index.get(chatId);
			// only emit on a real transition — see MemoryPanelStore.markRead for why an
			// unconditional emit here creates a client/server feedback loop.
			if (!chat || chat.unread === 0) return;

			chat.unread = 0;
			await writeIndex(index);
			emit({ type: "read", chatId });
		},

		async updateMessage(chatId: number, messageId: number, patch: MessagePatch) {
			const list = await readHistory(chatId);
			const message = list.find((m) => m.id === messageId);
			if (!message) return;

			if (patch.text !== undefined) message.text = patch.text;
			if (patch.edited !== undefined) message.edited = patch.edited;
			if (patch.deleted !== undefined) message.deleted = patch.deleted;

			await writeHistory(chatId, list);
			emit({ type: "chat", chatId });
		},

		async deleteChat(chatId: number) {
			const index = await readIndex();
			index.delete(chatId);
			await writeIndex(index);
			await adapter.delete(historyKey(chatId));
			emit({ type: "deleted", chatId });
		},

		async search(query: string, searchOptions: SearchOptions = {}) {
			const q = query.trim().toLowerCase();
			if (!q) return [];

			const limit = searchOptions.limit ?? 50;
			const out: PanelSearchResult[] = [];
			const chatIds =
				searchOptions.chatId !== undefined
					? [searchOptions.chatId]
					: [...(await readIndex()).keys()];

			for (const chatId of chatIds) {
				for (const message of await readHistory(chatId)) {
					if (!message.text.toLowerCase().includes(q)) continue;

					out.push({ chatId, message: { ...message } });
					if (out.length >= limit) return out;
				}
			}

			return out;
		},

		subscribe(listener: (event: PanelEvent) => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
