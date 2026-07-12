import { batched, type DropReason } from "../batched.js";
import type { AnalyticsAdapter, AnalyticsEvent } from "../types.js";

/** the subset of a clickhouse client the adapter needs — `@clickhouse/client`'s `.insert()`
 * satisfies it structurally. */
export interface ClickHouseLike {
	insert(params: { table: string; values: unknown[]; format: string }): Promise<unknown>;
}

export interface ClickHouseAdapterOptions {
	/** table name inserted into. defaults to `"yaebal_analytics_events"`. */
	table?: string;
	/** flush once this many events are buffered. defaults to `20`. */
	batchSize?: number;
	/** also flush this long after the first buffered event, even under `batchSize` traffic —
	 * without this a low-traffic bot could hold events in memory for hours. defaults to `5000`ms. */
	intervalMs?: number;
	/** retry a failed insert this many times (exponential backoff) before giving up on that
	 * batch — a transient clickhouse outage no longer silently drops every buffered event.
	 * defaults to `3`. */
	maxRetries?: number;
	/** base backoff delay in ms between retries (doubles each attempt). defaults to `500`. */
	retryDelayMs?: number;
	/** hard cap on buffered-but-unsent rows. defaults to `10_000`. */
	maxBuffered?: number;
	/** called for rows dropped by backpressure or exhausted retries — without this, both failure
	 * modes are silent. wire it up the same way you'd wire `AnalyticsOptions.onError`. */
	onDrop?: (rows: Record<string, unknown>[], reason: DropReason) => unknown;
}

function toRow(event: AnalyticsEvent): Record<string, unknown> {
	return {
		name: event.name,
		user_id: event.userId !== undefined ? String(event.userId) : null,
		chat_id: event.chatId !== undefined ? String(event.chatId) : null,
		properties: event.properties ? JSON.stringify(event.properties) : null,
		// clickhouse's DateTime column is second-resolution; AnalyticsEvent.timestamp is epoch ms
		// (the canonical unit every other adapter stores), converted here at the boundary.
		created_at: Math.floor(event.timestamp / 1000),
	};
}

/** the `CREATE TABLE` `clickhouseAdapter` expects. clickhouse has no equivalent of sqlite's lazy
 * `CREATE TABLE IF NOT EXISTS` on first use, so run this yourself once — a migration, the
 * `clickhouse-client` CLI, whatever you already use — rather than have the adapter guess at
 * engine/partitioning choices on your behalf. */
export function clickhouseSchema(table = "yaebal_analytics_events"): string {
	return (
		`CREATE TABLE IF NOT EXISTS ${table} (` +
		"name String, " +
		"user_id Nullable(String), " +
		"chat_id Nullable(String), " +
		"properties Nullable(String), " +
		"created_at DateTime" +
		") ENGINE = MergeTree ORDER BY (name, created_at)"
	);
}

/**
 * buffer events and batch-insert them into clickhouse, via {@link batched} — a failed insert
 * retries (with backoff) instead of silently discarding the batch, which is what the original
 * implementation of this adapter did (it cleared its buffer before awaiting `insert()`, so an
 * outage during that window lost every buffered event with no trace). `flush()` — wired to
 * `bot.onStop` automatically by `analytics()` — drains a partial batch before shutdown.
 */
export function clickhouseAdapter(
	client: ClickHouseLike,
	options: ClickHouseAdapterOptions = {},
): AnalyticsAdapter {
	const table = options.table ?? "yaebal_analytics_events";

	const buffer = batched<Record<string, unknown>>(
		(values) => client.insert({ table, values, format: "JSONEachRow" }),
		{
			size: options.batchSize ?? 20,
			intervalMs: options.intervalMs ?? 5000,
			maxRetries: options.maxRetries ?? 3,
			retryDelayMs: options.retryDelayMs,
			maxBuffered: options.maxBuffered ?? 10_000,
			onDrop: options.onDrop,
		},
	);

	return {
		track(event) {
			buffer.push(toRow(event));
		},
		flush: () => buffer.flush(),
	};
}
