import type { Context, Plugin } from "@yaebal/core";

export type MaybePromise<T> = T | Promise<T>;

/** a single tracked event, after `userId`/`chatId` have been resolved from `ctx`. */
export interface AnalyticsEvent {
	name: string;
	properties?: Record<string, unknown>;
	userId?: number;
	chatId?: number;
	timestamp: number;
}

/** what callers pass to {@link Analytics.track} — `timestamp` is filled in for them. */
export interface TrackInput {
	name: string;
	properties?: Record<string, unknown>;
	userId?: number;
	chatId?: number;
}

/**
 * a sink events are forwarded to. adapters take an already-constructed client and type it
 * structurally (see {@link postHogAdapter}, {@link sqliteAdapter}) so this package never
 * dictates a driver version or adds one as a dependency.
 */
export interface AnalyticsAdapter {
	track(event: AnalyticsEvent): MaybePromise<unknown>;
	/** drain any buffered events. called on `bot.onStop` and by {@link Analytics.flush}. */
	flush?(): MaybePromise<unknown>;
}

export interface AnalyticsOptions {
	adapters: AnalyticsAdapter[];
	/** an adapter throwing (or rejecting) never breaks tracking — observe failures here. */
	onError?: (error: unknown, event: AnalyticsEvent) => unknown;
	/** clock override, mainly for tests. */
	now?: () => number;
}

/** a standalone collection point: fan out `track()` calls to every configured adapter. */
export interface Analytics {
	track(input: TrackInput): void;
	/** await every adapter's {@link AnalyticsAdapter.flush}. */
	flush(): Promise<void>;
}

/**
 * build a standalone {@link Analytics} client, independent of any bot or `ctx`. this is the
 * unified collection point other plugins' event streams can feed into — e.g. bridge
 * `@yaebal/broadcast`'s `onEvent` with {@link fromEvent}, so a broadcast job's lifecycle lands
 * in the same adapters as `ctx.track` calls.
 */
export function createAnalytics(options: AnalyticsOptions): Analytics {
	const { adapters, onError, now = Date.now } = options;

	return {
		track(input) {
			const event: AnalyticsEvent = { ...input, timestamp: now() };
			for (const adapter of adapters) {
				try {
					void Promise.resolve(adapter.track(event)).catch((error: unknown) => {
						onError?.(error, event);
					});
				} catch (error) {
					onError?.(error, event);
				}
			}
		},
		async flush() {
			await Promise.all(adapters.map((adapter) => adapter.flush?.()));
		},
	};
}

/** shape a foreign event stream (a `{ type }` discriminated union, e.g. `BroadcastEvent`) into
 * a {@link TrackInput}, prefixing the event name so sources stay distinguishable downstream. */
export function fromEvent(
	prefix: string,
	event: { type: string } & Record<string, unknown>,
): TrackInput {
	const { type, ...properties } = event;
	return { name: `${prefix}.${type}`, properties };
}

/** what `analytics()` adds to `ctx`. */
export interface AnalyticsControl {
	track(name: string, properties?: Record<string, unknown>): void;
}

/** the plugin function plus adapter controls. */
export type AnalyticsPlugin<In extends Context = Context> = Plugin<In, AnalyticsControl> & {
	/**
	 * drain every adapter's buffer now — call it before shutdown (e.g. from `bot.onStop`) so a
	 * partial batch (e.g. {@link clickhouseAdapter}) isn't lost.
	 */
	flush(): Promise<void>;
};

/**
 * install `ctx.track(name, properties)` on the bot, backed by `source` (an `AnalyticsOptions`
 * config, or a client already built with {@link createAnalytics}).
 */
export function analytics<In extends Context = Context>(
	source: AnalyticsOptions | Analytics,
): AnalyticsPlugin<In> {
	const client = isAnalytics(source) ? source : createAnalytics(source);

	const plugin = ((composer) =>
		composer.derive((ctx) => ({
			track(name: string, properties?: Record<string, unknown>) {
				client.track({ name, properties, userId: ctx.from?.id, chatId: ctx.chat?.id });
			},
		}))) as AnalyticsPlugin<In>;

	plugin.flush = () => client.flush();

	return plugin;
}

function isAnalytics(source: AnalyticsOptions | Analytics): source is Analytics {
	return typeof (source as Partial<Analytics>).track === "function";
}

// ── adapters ──────────────────────────────────────────────────────────────────────────────

/** a sink for local development: pretty-prints every event to `console.log`. */
export function consoleAdapter(): AnalyticsAdapter {
	return {
		track(event) {
			console.log(`[analytics] ${event.name}`, {
				userId: event.userId,
				chatId: event.chatId,
				properties: event.properties,
			});
		},
	};
}

/** the subset of a posthog client the adapter needs — `posthog-node`'s `PostHog` satisfies it
 * structurally, no driver dependency required. */
export interface PostHogLike {
	capture(payload: {
		distinctId: string;
		event: string;
		properties?: Record<string, unknown>;
	}): unknown;
	flush?(): Promise<unknown>;
}

export interface PostHogAdapterOptions {
	/** derive posthog's `distinctId`. defaults to `userId`, falling back to `chatId`, then `"anonymous"`. */
	distinctId?: (event: AnalyticsEvent) => string;
}

/** forward events to an existing `posthog-node` client (or anything shaped like one). */
export function postHogAdapter(
	client: PostHogLike,
	options: PostHogAdapterOptions = {},
): AnalyticsAdapter {
	const distinctId =
		options.distinctId ??
		((event: AnalyticsEvent) => String(event.userId ?? event.chatId ?? "anonymous"));

	return {
		track(event) {
			return client.capture({
				distinctId: distinctId(event),
				event: event.name,
				properties: { ...event.properties, chatId: event.chatId },
			});
		},
		flush: client.flush ? () => client.flush?.() : undefined,
	};
}

export interface PlausibleAdapterOptions {
	/** the site domain plausible tracks this bot under, e.g. `"mybot.example"`. */
	domain: string;
	/** self-hosted plausible instance. defaults to `https://plausible.io`. */
	apiHost?: string;
	/** plausible's events api scores by (fake) page url — override how one is built per event. */
	url?: (event: AnalyticsEvent) => string;
	/** injectable for tests; defaults to the global `fetch`. */
	fetch?: typeof fetch;
}

/** forward events to plausible's events api (`POST /api/event`) — no client library needed. */
export function plausibleAdapter(options: PlausibleAdapterOptions): AnalyticsAdapter {
	const apiHost = options.apiHost ?? "https://plausible.io";
	const doFetch = options.fetch ?? fetch;
	const buildUrl =
		options.url ?? ((event: AnalyticsEvent) => `app://${options.domain}/${event.name}`);

	return {
		async track(event) {
			const res = await doFetch(`${apiHost}/api/event`, {
				method: "POST",
				headers: { "content-type": "application/json", "user-agent": "yaebal-analytics" },
				body: JSON.stringify({
					name: event.name,
					url: buildUrl(event),
					domain: options.domain,
					props: event.properties,
				}),
			});

			if (!res.ok) throw new Error(`plausibleAdapter: ${res.status} ${res.statusText}`);
		},
	};
}

/** the subset of a synchronous sqlite handle the adapter needs — `node:sqlite`'s `DatabaseSync`
 * and `better-sqlite3` both satisfy it structurally. */
export interface SqliteLike {
	exec(sql: string): unknown;
	prepare(sql: string): { run(...params: unknown[]): unknown };
}

export interface SqliteAdapterOptions {
	/** table name (created on first use if missing). defaults to `"yaebal_analytics_events"`. */
	table?: string;
}

/** append events as rows to a sqlite database (`node:sqlite`'s `DatabaseSync`, `better-sqlite3`,
 * or anything `SqliteLike`). */
export function sqliteAdapter(
	db: SqliteLike,
	options: SqliteAdapterOptions = {},
): AnalyticsAdapter {
	const table = options.table ?? "yaebal_analytics_events";
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
		throw new Error(`sqliteAdapter: invalid table name ${JSON.stringify(table)}`);
	}

	db.exec(
		`CREATE TABLE IF NOT EXISTS ${table} (` +
			`"id" INTEGER PRIMARY KEY AUTOINCREMENT, ` +
			`"name" TEXT NOT NULL, ` +
			`"user_id" INTEGER, ` +
			`"chat_id" INTEGER, ` +
			`"properties" TEXT, ` +
			`"created_at" INTEGER NOT NULL)`,
	);

	const insert = db.prepare(
		`INSERT INTO ${table} ("name", "user_id", "chat_id", "properties", "created_at") VALUES (?, ?, ?, ?, ?)`,
	);

	return {
		track(event) {
			insert.run(
				event.name,
				event.userId ?? null,
				event.chatId ?? null,
				event.properties ? JSON.stringify(event.properties) : null,
				event.timestamp,
			);
		},
	};
}

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
}

/** buffer events and batch-insert them into clickhouse. call {@link AnalyticsAdapter.flush}
 * (or let `analytics()`'s `bot.onStop` do it) to drain a partial batch. */
export function clickhouseAdapter(
	client: ClickHouseLike,
	options: ClickHouseAdapterOptions = {},
): AnalyticsAdapter {
	const table = options.table ?? "yaebal_analytics_events";
	const batchSize = options.batchSize ?? 20;
	let buffer: Record<string, unknown>[] = [];

	const send = async () => {
		if (buffer.length === 0) return;
		const values = buffer;
		buffer = [];
		await client.insert({ table, values, format: "JSONEachRow" });
	};

	return {
		async track(event) {
			buffer.push({
				name: event.name,
				user_id: event.userId ?? null,
				chat_id: event.chatId ?? null,
				properties: event.properties ? JSON.stringify(event.properties) : null,
				created_at: Math.floor(event.timestamp / 1000),
			});

			if (buffer.length >= batchSize) await send();
		},
		flush: send,
	};
}
