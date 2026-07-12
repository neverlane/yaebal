import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import type {
	ChatsOptions,
	HistoryOptions,
	MessagePatch,
	PanelAttachment,
	PanelChat,
	PanelChatRecord,
	PanelChatStatus,
	PanelEvent,
	PanelKeyboard,
	PanelMessage,
	PanelSearchResult,
	PanelStore,
	SearchOptions,
} from "./index.js";

function addColumn(db: DatabaseSync, table: string, definition: string): void {
	try {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
	} catch {
		// Existing sqlite stores from older panel versions simply already have the column.
	}
}

/** escape sqlite `LIKE` wildcards so a fallback substring search matches its input literally. */
function likePattern(text: string): string {
	return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

interface MessageRow {
	id: number;
	direction: "in" | "out";
	text: string;
	date: number;
	attachments: string | null;
	media_group: string | null;
	keyboard: string | null;
	event: string | null;
	message_id: number | null;
	reply_to_id: number | null;
	operator: string | null;
	edited: number | null;
	deleted: number | null;
}

function rowToMessage(row: MessageRow): PanelMessage {
	const msg: PanelMessage = {
		direction: row.direction,
		text: row.text,
		date: row.date,
		seq: row.id,
	};

	if (row.attachments) msg.attachments = JSON.parse(row.attachments) as PanelAttachment[];
	if (row.media_group) msg.mediaGroupId = row.media_group;
	if (row.keyboard) msg.keyboard = JSON.parse(row.keyboard) as PanelKeyboard;
	if (row.event) msg.event = JSON.parse(row.event) as PanelMessage["event"];
	if (row.message_id !== null) msg.id = row.message_id;
	if (row.reply_to_id !== null) msg.replyToId = row.reply_to_id;
	if (row.operator !== null) msg.operator = row.operator;
	if (row.edited) msg.edited = true;
	if (row.deleted) msg.deleted = true;

	return msg;
}

/** options for {@link SqlitePanelStore}. */
export interface SqlitePanelStoreOptions {
	/** sqlite file path, or `":memory:"` (default). ignored when `db` is provided. */
	path?: string;
	/** bring your own `node:sqlite` database instead of opening one. */
	db?: DatabaseSync;
	/** keep at most this many messages per chat. default 1000. */
	maxHistory?: number;
}

/**
 * a persistent {@link PanelStore} backed by node's built-in `node:sqlite` (node 22.5+).
 * zero third-party deps. import from `@yaebal/panel/sqlite`. full-text `search()` is
 * FTS5-backed when the runtime's sqlite build supports it, falling back to `LIKE` otherwise.
 *
 * ```ts
 * import { SqlitePanelStore } from "@yaebal/panel/sqlite";
 * const store = new SqlitePanelStore({ path: "./panel.db" });
 * ```
 */
export class SqlitePanelStore implements PanelStore {
	#db: DatabaseSync;
	#listeners = new Set<(event: PanelEvent) => void>();
	#maxHistory: number;
	#fts: boolean;

	constructor(options: SqlitePanelStoreOptions = {}) {
		this.#db = options.db ?? new DatabaseSync(options.path ?? ":memory:");
		this.#maxHistory = options.maxHistory ?? 1000;

		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS panel_chats (
				id              INTEGER PRIMARY KEY,
				name            TEXT,
				first_name      TEXT,
				last_name       TEXT,
				username        TEXT,
				last_text       TEXT NOT NULL,
				last_date       INTEGER NOT NULL,
				last_attachment TEXT,
				last_event      TEXT
			);
			CREATE TABLE IF NOT EXISTS panel_messages (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				chat_id     INTEGER NOT NULL,
				direction   TEXT NOT NULL,
				text        TEXT NOT NULL,
				date        INTEGER NOT NULL,
				attachments TEXT,
				media_group TEXT,
				keyboard    TEXT,
				event       TEXT
			);
			CREATE INDEX IF NOT EXISTS panel_messages_chat ON panel_messages (chat_id, date, id);
		`);

		addColumn(this.#db, "panel_chats", "first_name TEXT");
		addColumn(this.#db, "panel_chats", "last_name TEXT");
		addColumn(this.#db, "panel_chats", "username TEXT");
		addColumn(this.#db, "panel_chats", "last_attachment TEXT");
		addColumn(this.#db, "panel_chats", "last_event TEXT");
		addColumn(this.#db, "panel_chats", "status TEXT NOT NULL DEFAULT 'open'");
		addColumn(this.#db, "panel_chats", "unread INTEGER NOT NULL DEFAULT 0");
		addColumn(this.#db, "panel_chats", "assigned_to TEXT");
		addColumn(this.#db, "panel_chats", "pinned INTEGER NOT NULL DEFAULT 0");
		addColumn(this.#db, "panel_messages", "keyboard TEXT");
		addColumn(this.#db, "panel_messages", "event TEXT");
		addColumn(this.#db, "panel_messages", "message_id INTEGER");
		addColumn(this.#db, "panel_messages", "reply_to_id INTEGER");
		addColumn(this.#db, "panel_messages", "operator TEXT");
		addColumn(this.#db, "panel_messages", "edited INTEGER NOT NULL DEFAULT 0");
		addColumn(this.#db, "panel_messages", "deleted INTEGER NOT NULL DEFAULT 0");

		try {
			this.#db.exec(
				"CREATE VIRTUAL TABLE IF NOT EXISTS panel_search USING fts5(text, chat_id UNINDEXED)",
			);
			this.#fts = true;
		} catch {
			// the runtime's bundled sqlite wasn't built with FTS5 — search() falls back to LIKE.
			this.#fts = false;
		}
	}

	#emit(event: PanelEvent): void {
		for (const fn of this.#listeners) fn(event);
	}

	#pruneHistory(chatId: number): void {
		const excess = this.#db
			.prepare("SELECT id FROM panel_messages WHERE chat_id = ? ORDER BY id DESC LIMIT -1 OFFSET ?")
			.all(chatId, this.#maxHistory) as Array<{ id: number }>;
		if (excess.length === 0) return;

		const ids = excess.map((r) => r.id);
		const placeholders = ids.map(() => "?").join(",");
		this.#db.prepare(`DELETE FROM panel_messages WHERE id IN (${placeholders})`).run(...ids);
		if (this.#fts) {
			this.#db.prepare(`DELETE FROM panel_search WHERE rowid IN (${placeholders})`).run(...ids);
		}
	}

	record(chat: PanelChatRecord, message: PanelMessage): void {
		const result = this.#db
			.prepare(
				"INSERT INTO panel_messages (chat_id, direction, text, date, attachments, media_group, keyboard, event, message_id, reply_to_id, operator, edited, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				chat.id,
				message.direction,
				message.text,
				message.date,
				message.attachments ? JSON.stringify(message.attachments) : null,
				message.mediaGroupId ?? null,
				message.keyboard ? JSON.stringify(message.keyboard) : null,
				message.event ? JSON.stringify(message.event) : null,
				message.id ?? null,
				message.replyToId ?? null,
				message.operator ?? null,
				message.edited ? 1 : 0,
				message.deleted ? 1 : 0,
			);

		const rowId = Number(result.lastInsertRowid);
		if (this.#fts) {
			this.#db
				.prepare("INSERT INTO panel_search (rowid, text, chat_id) VALUES (?, ?, ?)")
				.run(rowId, message.text, chat.id);
		}

		// keep the name when an outgoing message omits it; COALESCE the existing row's value.
		// unread only bumps for incoming messages, and only via `unread = unread + 1` — an
		// UPSERT can't reference the pre-conflict row directly, so this reads it back after.
		this.#db
			.prepare(`
				INSERT INTO panel_chats (
					id, name, first_name, last_name, username, last_text, last_date, last_attachment, last_event
				) VALUES (
					:id, :name, :firstName, :lastName, :username, :text, :date, :lastAttachment, :lastEvent
				)
				ON CONFLICT(id) DO UPDATE SET
					name = COALESCE(:name, panel_chats.name),
					first_name = COALESCE(:firstName, panel_chats.first_name),
					last_name = COALESCE(:lastName, panel_chats.last_name),
					username = COALESCE(:username, panel_chats.username),
					last_text = :text,
					last_date = :date,
					last_attachment = :lastAttachment,
					last_event = :lastEvent
			`)
			.run({
				id: chat.id,
				name: chat.name ?? null,
				firstName: chat.firstName ?? null,
				lastName: chat.lastName ?? null,
				username: chat.username ?? null,
				text: message.text,
				date: message.date,
				lastAttachment: message.attachments?.[0]?.type ?? null,
				lastEvent: message.event?.type ?? null,
			});

		if (message.direction === "in") {
			this.#db.prepare("UPDATE panel_chats SET unread = unread + 1 WHERE id = ?").run(chat.id);
		}

		// brand-new chat with no name → give it a stable fallback label
		this.#db
			.prepare("UPDATE panel_chats SET name = ? WHERE id = ? AND name IS NULL")
			.run(`chat ${chat.id}`, chat.id);

		this.#pruneHistory(chat.id);
		this.#emit({ type: "record", chatId: chat.id, direction: message.direction });
	}

	chats(options: ChatsOptions = {}): PanelChat[] {
		const clauses: string[] = [];
		const params: SQLInputValue[] = [];
		if (options.status) {
			clauses.push("status = ?");
			params.push(options.status);
		}
		const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

		let sql = `SELECT id, name, first_name, last_name, username, last_text, last_date, last_attachment, last_event, status, unread, assigned_to, pinned FROM panel_chats ${where} ORDER BY pinned DESC, last_date DESC`;
		if (options.limit !== undefined) sql += " LIMIT ?";
		if (options.offset !== undefined)
			sql += options.limit !== undefined ? " OFFSET ?" : " LIMIT -1 OFFSET ?";
		if (options.limit !== undefined) params.push(options.limit);
		if (options.offset !== undefined) params.push(options.offset);

		const rows = this.#db.prepare(sql).all(...params) as unknown as Array<{
			id: number;
			name: string | null;
			first_name: string | null;
			last_name: string | null;
			username: string | null;
			last_text: string;
			last_date: number;
			last_attachment: PanelChat["lastAttachmentType"] | null;
			last_event: PanelChat["lastEventType"] | null;
			status: PanelChatStatus;
			unread: number;
			assigned_to: string | null;
			pinned: number;
		}>;

		return rows.map((r) => {
			const chat: PanelChat = {
				id: r.id,
				name: r.name ?? `chat ${r.id}`,
				lastText: r.last_text,
				lastDate: r.last_date,
				status: r.status,
				unread: r.unread,
			};

			if (r.first_name) chat.firstName = r.first_name;
			if (r.last_name) chat.lastName = r.last_name;
			if (r.username) chat.username = r.username;
			if (r.last_attachment) chat.lastAttachmentType = r.last_attachment;
			if (r.last_event) chat.lastEventType = r.last_event;
			if (r.assigned_to) chat.assignedTo = r.assigned_to;
			if (r.pinned) chat.pinned = true;

			return chat;
		});
	}

	history(chatId: number, options: HistoryOptions = {}): PanelMessage[] {
		const limit = options.limit ?? -1; // sqlite: negative LIMIT = no limit
		const columns =
			"direction, text, date, id, attachments, media_group, keyboard, event, message_id, reply_to_id, operator, edited, deleted";

		let rows: MessageRow[];
		if (options.before !== undefined && options.beforeSeq !== undefined) {
			// composite (date, seq) cursor — doesn't drop messages sharing the exact same second
			rows = this.#db
				.prepare(`
					SELECT ${columns} FROM panel_messages
					WHERE chat_id = ? AND (date < ? OR (date = ? AND id < ?))
					ORDER BY date DESC, id DESC LIMIT ?
				`)
				.all(
					chatId,
					options.before,
					options.before,
					options.beforeSeq,
					limit,
				) as unknown as MessageRow[];
		} else if (options.before !== undefined) {
			rows = this.#db
				.prepare(`
					SELECT ${columns} FROM panel_messages
					WHERE chat_id = ? AND date < ?
					ORDER BY date DESC, id DESC LIMIT ?
				`)
				.all(chatId, options.before, limit) as unknown as MessageRow[];
		} else {
			rows = this.#db
				.prepare(`
					SELECT ${columns} FROM panel_messages
					WHERE chat_id = ?
					ORDER BY date DESC, id DESC LIMIT ?
				`)
				.all(chatId, limit) as unknown as MessageRow[];
		}

		return rows.reverse().map(rowToMessage);
	}

	status(chatId: number): PanelChatStatus | undefined {
		const row = this.#db.prepare("SELECT status FROM panel_chats WHERE id = ?").get(chatId) as
			| { status: PanelChatStatus }
			| undefined;
		return row?.status;
	}

	setStatus(chatId: number, status: PanelChatStatus): void {
		const result = this.#db
			.prepare("UPDATE panel_chats SET status = ? WHERE id = ?")
			.run(status, chatId);
		if (Number(result.changes) > 0) this.#emit({ type: "status", chatId, status });
	}

	assign(chatId: number, operator: string | null): void {
		this.#db.prepare("UPDATE panel_chats SET assigned_to = ? WHERE id = ?").run(operator, chatId);
		this.#emit({ type: "chat", chatId });
	}

	pin(chatId: number, pinned: boolean): void {
		this.#db.prepare("UPDATE panel_chats SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, chatId);
		this.#emit({ type: "chat", chatId });
	}

	markRead(chatId: number): void {
		// only emit on a real transition (`unread <> 0` guards the update) — see
		// MemoryPanelStore.markRead for why an unconditional emit here creates a
		// client/server feedback loop.
		const result = this.#db
			.prepare("UPDATE panel_chats SET unread = 0 WHERE id = ? AND unread <> 0")
			.run(chatId);
		if (Number(result.changes) > 0) this.#emit({ type: "read", chatId });
	}

	updateMessage(chatId: number, messageId: number, patch: MessagePatch): void {
		const sets: string[] = [];
		const params: SQLInputValue[] = [];
		if (patch.text !== undefined) {
			sets.push("text = ?");
			params.push(patch.text);
		}
		if (patch.edited !== undefined) {
			sets.push("edited = ?");
			params.push(patch.edited ? 1 : 0);
		}
		if (patch.deleted !== undefined) {
			sets.push("deleted = ?");
			params.push(patch.deleted ? 1 : 0);
		}
		if (sets.length === 0) return;

		params.push(chatId, messageId);
		this.#db
			.prepare(`UPDATE panel_messages SET ${sets.join(", ")} WHERE chat_id = ? AND message_id = ?`)
			.run(...params);

		if (this.#fts && patch.text !== undefined) {
			const row = this.#db
				.prepare("SELECT id FROM panel_messages WHERE chat_id = ? AND message_id = ?")
				.get(chatId, messageId) as { id: number } | undefined;
			if (row) {
				this.#db
					.prepare("UPDATE panel_search SET text = ? WHERE rowid = ?")
					.run(patch.text, row.id);
			}
		}

		this.#emit({ type: "chat", chatId });
	}

	deleteChat(chatId: number): void {
		this.#db.prepare("DELETE FROM panel_chats WHERE id = ?").run(chatId);
		if (this.#fts) {
			this.#db
				.prepare(
					"DELETE FROM panel_search WHERE rowid IN (SELECT id FROM panel_messages WHERE chat_id = ?)",
				)
				.run(chatId);
		}
		this.#db.prepare("DELETE FROM panel_messages WHERE chat_id = ?").run(chatId);
		this.#emit({ type: "deleted", chatId });
	}

	search(query: string, options: SearchOptions = {}): PanelSearchResult[] {
		const q = query.trim();
		if (!q) return [];
		const limit = options.limit ?? 50;

		const columns =
			"direction, text, date, id, attachments, media_group, keyboard, event, message_id, reply_to_id, operator, edited, deleted";

		if (this.#fts) {
			try {
				const phrase = `"${q.replace(/"/g, '""')}"`;
				const rows =
					options.chatId !== undefined
						? (this.#db
								.prepare(`
									SELECT pm.${columns.replaceAll(", ", ", pm.")}, pm.chat_id as chat_id FROM panel_search ps
									JOIN panel_messages pm ON pm.id = ps.rowid
									WHERE panel_search MATCH ? AND ps.chat_id = ?
									ORDER BY pm.date DESC LIMIT ?
								`)
								.all(phrase, options.chatId, limit) as unknown as Array<
								MessageRow & { chat_id: number }
							>)
						: (this.#db
								.prepare(`
									SELECT pm.${columns.replaceAll(", ", ", pm.")}, pm.chat_id as chat_id FROM panel_search ps
									JOIN panel_messages pm ON pm.id = ps.rowid
									WHERE panel_search MATCH ?
									ORDER BY pm.date DESC LIMIT ?
								`)
								.all(phrase, limit) as unknown as Array<MessageRow & { chat_id: number }>);

				return rows.map((r) => ({ chatId: r.chat_id, message: rowToMessage(r) }));
			} catch {
				// malformed FTS5 query syntax slipped through the phrase-quoting — fall back to LIKE
			}
		}

		const pattern = likePattern(q);
		const rows =
			options.chatId !== undefined
				? (this.#db
						.prepare(`
							SELECT ${columns}, chat_id FROM panel_messages
							WHERE chat_id = ? AND text LIKE ? ESCAPE '\\'
							ORDER BY date DESC LIMIT ?
						`)
						.all(options.chatId, pattern, limit) as unknown as Array<
						MessageRow & { chat_id: number }
					>)
				: (this.#db
						.prepare(`
							SELECT ${columns}, chat_id FROM panel_messages
							WHERE text LIKE ? ESCAPE '\\'
							ORDER BY date DESC LIMIT ?
						`)
						.all(pattern, limit) as unknown as Array<MessageRow & { chat_id: number }>);

		return rows.map((r) => ({ chatId: r.chat_id, message: rowToMessage(r) }));
	}

	subscribe(listener: (event: PanelEvent) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** close the underlying database (no-op if you passed your own `db`). */
	close(): void {
		this.#db.close();
	}
}
