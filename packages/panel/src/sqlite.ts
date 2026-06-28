import { DatabaseSync } from "node:sqlite";
import type {
	HistoryOptions,
	PanelAttachment,
	PanelChat,
	PanelEvent,
	PanelMessage,
	PanelStore,
} from "./index.js";

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
				id   INTEGER PRIMARY KEY,
				name TEXT,
				last_text TEXT NOT NULL,
				last_date INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS panel_messages (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				chat_id     INTEGER NOT NULL,
				direction   TEXT NOT NULL,
				text        TEXT NOT NULL,
				date        INTEGER NOT NULL,
				attachments TEXT,
				media_group TEXT
			);
			CREATE INDEX IF NOT EXISTS panel_messages_chat ON panel_messages (chat_id, date);
		`);
	}

	record(chat: { id: number; name?: string }, message: PanelMessage): void {
		this.#db
			.prepare(
				"INSERT INTO panel_messages (chat_id, direction, text, date, attachments, media_group) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				chat.id,
				message.direction,
				message.text,
				message.date,
				message.attachments ? JSON.stringify(message.attachments) : null,
				message.mediaGroupId ?? null,
			);

		// keep the name when an outgoing message omits it; COALESCE the existing row's value
		this.#db
			.prepare(`
				INSERT INTO panel_chats (id, name, last_text, last_date) VALUES (:id, :name, :text, :date)
				ON CONFLICT(id) DO UPDATE SET
					name = COALESCE(:name, panel_chats.name),
					last_text = :text,
					last_date = :date
			`)
			.run({ id: chat.id, name: chat.name ?? null, text: message.text, date: message.date });

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
			.prepare("SELECT id, name, last_text, last_date FROM panel_chats ORDER BY last_date DESC")
			.all() as Array<{ id: number; name: string | null; last_text: string; last_date: number }>;

		return rows.map((r) => ({
			id: r.id,
			name: r.name ?? `chat ${r.id}`,
			lastText: r.last_text,
			lastDate: r.last_date,
		}));
	}

	history(chatId: number, options?: HistoryOptions): PanelMessage[] {
		const before = options?.before ?? Number.MAX_SAFE_INTEGER;
		const limit = options?.limit ?? -1; // sqlite: negative LIMIT = no limit

		// grab the most recent `limit` rows older than `before`, then return ascending
		const rows = this.#db
			.prepare(`
				SELECT direction, text, date, attachments, media_group FROM panel_messages
				WHERE chat_id = ? AND date < ?
				ORDER BY date DESC, id DESC LIMIT ?
			`)
			.all(chatId, before, limit) as Array<{
			direction: "in" | "out";
			text: string;
			date: number;
			attachments: string | null;
			media_group: string | null;
		}>;

		return rows.reverse().map((r) => {
			const msg: PanelMessage = { direction: r.direction, text: r.text, date: r.date };
			
			if (r.attachments) msg.attachments = JSON.parse(r.attachments) as PanelAttachment[];
			if (r.media_group) msg.mediaGroupId = r.media_group;

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
