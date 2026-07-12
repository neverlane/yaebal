import type { AnalyticsAdapter, AnalyticsQuery, AnalyticsReport } from "../types.js";

/** the subset of a synchronous sqlite handle the adapter needs — `node:sqlite`'s `DatabaseSync`
 * and `better-sqlite3` both satisfy it structurally. `.all()` is only needed for `query()`
 * (powers `analyticsAdmin()`); omit it and `sqliteAdapter` still works for plain event storage. */
export interface SqliteLike {
	exec(sql: string): unknown;
	prepare(sql: string): {
		run(...params: unknown[]): unknown;
		all?(...params: unknown[]): unknown[];
	};
}

export interface SqliteAdapterOptions {
	/** table name (created on first use if missing). defaults to `"yaebal_analytics_events"`. */
	table?: string;
}

function assertValidTable(table: string): void {
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
		throw new Error(`sqliteAdapter: invalid table name ${JSON.stringify(table)}`);
	}
}

/** the DDL `sqliteAdapter` runs on first use, exported so it can be run explicitly (a migration
 * tool, inspecting the schema, `db.exec(sqliteSchema())` before handing `db` to the adapter)
 * instead of relying on the adapter's lazy `CREATE TABLE IF NOT EXISTS`. `user_id`/`chat_id` are
 * `TEXT` (not `INTEGER`) because `AnalyticsOptions.anonymize` can replace them with a hashed
 * string — a plain telegram id and an anonymized one share the column either way. for
 * write-heavy bots, open `db` with `PRAGMA journal_mode = WAL` yourself; the adapter doesn't set
 * pragmas on a connection it doesn't own. */
export function sqliteSchema(table = "yaebal_analytics_events"): string {
	assertValidTable(table);
	return (
		`CREATE TABLE IF NOT EXISTS "${table}" (` +
		`"id" INTEGER PRIMARY KEY, ` +
		`"name" TEXT NOT NULL, ` +
		`"user_id" TEXT, ` +
		`"chat_id" TEXT, ` +
		`"properties" TEXT, ` +
		`"created_at" INTEGER NOT NULL); ` +
		`CREATE INDEX IF NOT EXISTS "${table}_name_created_at_idx" ON "${table}" ("name", "created_at")`
	);
}

/** append events as rows to a sqlite database (`node:sqlite`'s `DatabaseSync`, `better-sqlite3`,
 * or anything `SqliteLike`) — see {@link sqliteSchema} for the table it creates. */
export function sqliteAdapter(
	db: SqliteLike,
	options: SqliteAdapterOptions = {},
): AnalyticsAdapter {
	const table = options.table ?? "yaebal_analytics_events";
	assertValidTable(table);

	db.exec(sqliteSchema(table));

	const insert = db.prepare(
		`INSERT INTO "${table}" ("name", "user_id", "chat_id", "properties", "created_at") VALUES (?, ?, ?, ?, ?)`,
	);

	return {
		track(event) {
			insert.run(
				event.name,
				event.userId !== undefined ? String(event.userId) : null,
				event.chatId !== undefined ? String(event.chatId) : null,
				event.properties ? JSON.stringify(event.properties) : null,
				event.timestamp,
			);
		},
		query({ since, limit = 10 }: AnalyticsQuery): Promise<AnalyticsReport> {
			const topStmt = db.prepare(
				`SELECT "name" AS name, COUNT(*) AS count FROM "${table}" WHERE "created_at" >= ? GROUP BY "name" ORDER BY count DESC LIMIT ?`,
			);
			const totalStmt = db.prepare(
				`SELECT COUNT(*) AS total FROM "${table}" WHERE "created_at" >= ?`,
			);

			if (!topStmt.all || !totalStmt.all) {
				throw new Error(
					"sqliteAdapter: query() needs a `db.prepare(...).all()` method — node:sqlite's " +
						"DatabaseSync and better-sqlite3 both provide one",
				);
			}

			// node:sqlite's .all() returns null-prototype row objects — normalize to plain objects so
			// callers get an ordinary AnalyticsReport, not a shape that surprises deepEqual/spread/etc.
			const topEvents = (topStmt.all(since, limit) as { name: string; count: number }[]).map(
				(row) => ({ name: row.name, count: row.count }),
			);
			const total = (totalStmt.all(since)[0] as { total: number } | undefined)?.total ?? 0;

			return Promise.resolve({ total, topEvents });
		},
	};
}
