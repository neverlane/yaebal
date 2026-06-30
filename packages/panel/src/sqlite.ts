import { DatabaseSync } from "node:sqlite";
import type {
	HistoryOptions,
	PanelAttachment,
	PanelChat,
	PanelChatRecord,
	PanelEvent,
	PanelKeyboard,
	PanelMessage,
	PanelMessageEvent,
	PanelStore,
} from "./index.js";

function addColumn(db: DatabaseSync, table: string, definition: string): void {
	try {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
	} catch {
		// Existing sqlite stores from older panel versions simply already have the column.
	}
}

/** options for {@link SqlitePanelStore}. */
export interface SqlitePanelStoreOptions {
	/** sqlite file path, or `":memory:"` (default). ignored when `db` is provided. */
	path?: string;
	/** bring your own `node:sqlite` database instead of opening one. */
	db?: DatabaseSync;
}

/**
 * a persistent {@link PanelStore} backed by node's built-in `node:sqlite` (node 22.5+).
 * zero third-party deps. import from `@yaebal/panel/sqlite`.
 *
 * ```ts
 * import { SqlitePanelStore } from "@yaebal/panel/sqlite";
 * const store = new SqlitePanelStore({ path: "./panel.db" });
 * ```
 */
export class SqlitePanelStore implements PanelStore {
	#db: DatabaseSync;
	#listeners = new Set<(event: PanelEvent) => void>();

	constructor(options: SqlitePanelStoreOptions = {}) {
		this.#db = options.db ?? new DatabaseSync(options.path ?? ":memory:");
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
			CREATE INDEX IF NOT EXISTS panel_messages_chat ON panel_messages (chat_id, date);
		`);

		addColumn(this.#db, "panel_chats", "first_name TEXT");
		addColumn(this.#db, "panel_chats", "last_name TEXT");
		addColumn(this.#db, "panel_chats", "username TEXT");
		addColumn(this.#db, "panel_chats", "last_attachment TEXT");
		addColumn(this.#db, "panel_chats", "last_event TEXT");
		addColumn(this.#db, "panel_messages", "keyboard TEXT");
		addColumn(this.#db, "panel_messages", "event TEXT");
	}

	record(chat: PanelChatRecord, message: PanelMessage): void {
		this.#db
			.prepare(
				"INSERT INTO panel_messages (chat_id, direction, text, date, attachments, media_group, keyboard, event) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
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
			);

		// keep the name when an outgoing message omits it; COALESCE the existing row's value
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

		// brand-new chat with no name → give it a stable fallback label
		this.#db
			.prepare("UPDATE panel_chats SET name = ? WHERE id = ? AND name IS NULL")
			.run(`chat ${chat.id}`, chat.id);

		for (const fn of this.#listeners) {
			fn({ type: "record", chatId: chat.id, direction: message.direction });
		}
	}

	chats(): PanelChat[] {
		const rows = this.#db
			.prepare(
				"SELECT id, name, first_name, last_name, username, last_text, last_date, last_attachment, last_event FROM panel_chats ORDER BY last_date DESC",
			)
			.all() as Array<{
			id: number;
			name: string | null;
			first_name: string | null;
			last_name: string | null;
			username: string | null;
			last_text: string;
			last_date: number;
			last_attachment: PanelChat["lastAttachmentType"] | null;
			last_event: PanelChat["lastEventType"] | null;
		}>;

		return rows.map((r) => {
			const chat: PanelChat = {
				id: r.id,
				name: r.name ?? `chat ${r.id}`,
				lastText: r.last_text,
				lastDate: r.last_date,
			};

			if (r.first_name) chat.firstName = r.first_name;
			if (r.last_name) chat.lastName = r.last_name;
			if (r.username) chat.username = r.username;
			if (r.last_attachment) chat.lastAttachmentType = r.last_attachment;
			if (r.last_event) chat.lastEventType = r.last_event;

			return chat;
		});
	}

	history(chatId: number, options?: HistoryOptions): PanelMessage[] {
		const before = options?.before ?? Number.MAX_SAFE_INTEGER;
		const limit = options?.limit ?? -1; // sqlite: negative LIMIT = no limit

		// grab the most recent `limit` rows older than `before`, then return ascending
		const rows = this.#db
			.prepare(`
				SELECT direction, text, date, attachments, media_group, keyboard, event FROM panel_messages
				WHERE chat_id = ? AND date < ?
				ORDER BY date DESC, id DESC LIMIT ?
			`)
			.all(chatId, before, limit) as Array<{
			direction: "in" | "out";
			text: string;
			date: number;
			attachments: string | null;
			media_group: string | null;
			keyboard: string | null;
			event: string | null;
		}>;

		return rows.reverse().map((r) => {
			const msg: PanelMessage = { direction: r.direction, text: r.text, date: r.date };
			
			if (r.attachments) msg.attachments = JSON.parse(r.attachments) as PanelAttachment[];
			if (r.media_group) msg.mediaGroupId = r.media_group;
			if (r.keyboard) msg.keyboard = JSON.parse(r.keyboard) as PanelKeyboard;
			if (r.event) msg.event = JSON.parse(r.event) as PanelMessageEvent;

			return msg;
		});
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
