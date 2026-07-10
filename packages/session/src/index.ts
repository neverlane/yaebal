import type { Composer, Context, Middleware, Plugin } from "@yaebal/core";
import { type MaybePromise, MemoryStorage, type StorageAdapter } from "@yaebal/sklad";

export type { MaybePromise, MemoryStorageOptions, StorageAdapter } from "@yaebal/sklad";
// the storage contract lives in @yaebal/sklad; re-exported here so existing
// `import { StorageAdapter } from "@yaebal/session"` code keeps working.
export { MemoryStorage } from "@yaebal/sklad";

/** every failure mode of this plugin throws this, so callers can `catch (e instanceof SessionError)`. */
export class SessionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SessionError";
	}
}

/**
 * a composite storage key. segments are prefixed and joined in a fixed order
 * (`user:` → `chat:` → `thread:` → `key:`), so keys are self-describing:
 * `{ chat: 42, user: 7 }` → `"user:7:chat:42"`.
 */
export interface SessionKey {
	user?: number | string | undefined;
	chat?: number | string | undefined;
	thread?: number | string | undefined;
	key?: number | string | undefined;
}

/** how a storage key is derived per update. `undefined` means "no session for this update". */
export type SessionKeyResolver = (ctx: Context) => MaybePromise<string | SessionKey | undefined>;

/** collapse a resolver result to the final storage key (`undefined` → keyless update). */
export function normalizeSessionKey(raw: string | SessionKey | undefined): string | undefined {
	if (raw === undefined) return undefined;
	if (typeof raw === "string") return raw.length > 0 ? raw : undefined;

	const parts: string[] = [];
	if (raw.user !== undefined) parts.push(`user:${raw.user}`);
	if (raw.chat !== undefined) parts.push(`chat:${raw.chat}`);
	if (raw.thread !== undefined) parts.push(`thread:${raw.thread}`);
	if (raw.key !== undefined) parts.push(`key:${raw.key}`);

	return parts.length > 0 ? parts.join(":") : undefined;
}

/** ready-made partitioning strategies for `getKey`. */
export const keyBy = {
	/** one session per chat — the default. note: updates without a chat (inline queries) are keyless. */
	chat: (ctx: Context) => ctx.chat?.id.toString(),
	/** one session per user, wherever they write from — covers inline queries, which have no chat. */
	user: (ctx: Context) => ctx.from?.id.toString(),
	/** one session per user per chat — each member of a group gets their own state. */
	chatUser: (ctx: Context) =>
		ctx.chat !== undefined && ctx.from !== undefined
			? { chat: ctx.chat.id, user: ctx.from.id }
			: undefined,
	/** one session per forum topic (falls back to plain per-chat when the update has no thread). */
	chatThread: (ctx: Context) =>
		ctx.chat !== undefined ? { chat: ctx.chat.id, thread: ctx.messageThreadId } : undefined,
} satisfies Record<string, SessionKeyResolver>;

/**
 * schema migrations, keyed by version: `{ 1: (old) => …, 2: (v1) => … }`. versions start at 1
 * and must be gapless. raw pre-migration records count as version 0, so adding `1` upgrades
 * data written before migrations were introduced. when migrations are configured the stored
 * shape becomes a `{ __yaebal: "session", v, data }` envelope carrying the version.
 */
export type SessionMigrations = Record<number, (data: unknown) => unknown>;

/** a value stored via {@link ttl} — carries its own expiry timestamp. */
export interface TtlValue<T> {
	readonly $ttl: true;
	readonly value: T;
	readonly until: number;
}

/**
 * wrap a session field so it expires `ms` from now: `ctx.session.otp = ttl("1234", 60_000)`.
 * expired fields are deleted when the session is next loaded; use {@link unwrapTtl} to read
 * one safely within the current update. explicit by design — the envelope is visible in your
 * session type (`otp?: TtlValue<string>`), no proxy magic involved.
 */
export function ttl<T>(value: T, ms: number): TtlValue<T> {
	if (ms <= 0) throw new SessionError(`ttl(): ms must be positive, got ${ms}`);
	return { $ttl: true, value, until: Date.now() + ms };
}

/** read a {@link ttl}-wrapped field: the value while it's alive, `undefined` once expired. */
export function unwrapTtl<T>(wrapped: TtlValue<T> | undefined): T | undefined {
	if (wrapped === undefined || wrapped.until <= Date.now()) return undefined;
	return wrapped.value;
}

function isTtlValue(value: unknown): value is TtlValue<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as TtlValue<unknown>).$ttl === true &&
		typeof (value as TtlValue<unknown>).until === "number"
	);
}

/** drop expired ttl fields (top level only). returns whether anything was removed. */
function sweepExpiredTtl(value: unknown): boolean {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

	const record = value as Record<string, unknown>;
	const now = Date.now();
	let removed = false;

	for (const key of Object.keys(record)) {
		const field = record[key];
		if (isTtlValue(field) && field.until <= now) {
			delete record[key];
			removed = true;
		}
	}

	return removed;
}

export interface SessionOptions<S, K extends string = "session"> {
	/**
	 * build a fresh session when none is stored. required so the type is honest — `ctx.session`
	 * is always `S`, never `S | undefined`. receives the context, so defaults can be personal:
	 * `initial: (ctx) => ({ name: ctx.from?.first_name ?? "" })`.
	 */
	initial: (ctx: Context) => S;
	/** where to persist sessions. defaults to an in-memory store (lost on restart). */
	storage?: StorageAdapter<S>;
	/**
	 * session key for an update — a string, a composite {@link SessionKey} descriptor, or
	 * `undefined` for "no session". may be async. defaults to {@link keyBy.chat}.
	 */
	getKey?: SessionKeyResolver;
	/**
	 * the context field the session lives under (default `"session"`). give two installs
	 * distinct names to run independent sessions side by side, e.g. per-chat + per-user.
	 */
	key?: K;
	/**
	 * persist even when nothing changed. by default a save is skipped when the state is
	 * byte-identical to what was loaded (and untouched fresh sessions are never written at
	 * all, so lurkers don't fill your storage with `initial()` records).
	 */
	alwaysSave?: boolean;
	/**
	 * what to do when `getKey` yields no key (e.g. a `poll` update, or an inline query under
	 * the default per-chat key):
	 * - `"throwaway"` (default) — the handler gets a working session that is silently dropped;
	 * - `"skip"` — the field is not set at all for this update;
	 * - `"error"` — throw a {@link SessionError}, making the gap impossible to miss.
	 */
	onMissingKey?: "throwaway" | "skip" | "error";
	/** versioned schema migrations — see {@link SessionMigrations}. */
	migrations?: SessionMigrations;
}

interface VersionEnvelope {
	__yaebal: "session";
	v: number;
	data: unknown;
}

function isVersionEnvelope(raw: unknown): raw is VersionEnvelope {
	return (
		typeof raw === "object" &&
		raw !== null &&
		(raw as VersionEnvelope).__yaebal === "session" &&
		typeof (raw as VersionEnvelope).v === "number"
	);
}

/** validate the migration map and return its target version. */
function versionOf(migrations: SessionMigrations): number {
	let max = 0;
	for (const key of Object.keys(migrations)) {
		const v = Number(key);
		if (!Number.isInteger(v) || v <= 0) {
			throw new SessionError(
				`migrations: version ${JSON.stringify(key)} must be a positive integer`,
			);
		}
		if (v > max) max = v;
	}

	if (max === 0)
		throw new SessionError("migrations: provide at least one step, e.g. { 1: (old) => … }");
	for (let v = 1; v <= max; v++) {
		if (typeof migrations[v] !== "function") {
			throw new SessionError(`migrations: missing step ${v} — versions must be gapless from 1`);
		}
	}

	return max;
}

// JSON.stringify(undefined) is undefined, not a string — normalize so snapshots always compare
const snapshotOf = (value: unknown): string => JSON.stringify(value) ?? "undefined";

/**
 * per-update session lifecycle: one instance per (context, field). loads lazily or eagerly,
 * tracks dirtiness via a serialized snapshot (no proxies — mutations of any depth count), and
 * flushes once after the handler chain finishes.
 */
class SessionController<S> {
	readonly key: string | undefined;
	#ctx: Context;
	#storage: StorageAdapter<S>;
	#initial: (ctx: Context) => S;
	#migrations: SessionMigrations | undefined;
	#version: number;

	#loaded = false;
	#loadPromise: Promise<S> | undefined;
	#value!: S;
	#snapshot = "";
	#forceDirty = false;
	#stored = false;

	constructor(
		ctx: Context,
		key: string | undefined,
		storage: StorageAdapter<S>,
		initial: (ctx: Context) => S,
		migrations: SessionMigrations | undefined,
		version: number,
	) {
		this.#ctx = ctx;
		this.key = key;
		this.#storage = storage;
		this.#initial = initial;
		this.#migrations = migrations;
		this.#version = version;
	}

	get value(): S {
		if (!this.#loaded) {
			throw new SessionError("session read before load — this is a bug in @yaebal/session");
		}
		return this.#value;
	}

	/** replace the whole session (`ctx.session = …`). marked dirty unconditionally. */
	assign(value: S): void {
		this.#value = value;
		this.#loaded = true;
		this.#forceDirty = true;
	}

	load(): Promise<S> {
		this.#loadPromise ??= this.#doLoad();
		return this.#loadPromise;
	}

	async #doLoad(): Promise<S> {
		if (this.#loaded) return this.#value;

		let value: S | undefined;
		if (this.key !== undefined) {
			const raw = await this.#storage.get(this.key);
			// an assign() may have landed while the read was in flight — it wins
			if (this.#loaded) return this.#value;

			if (raw !== undefined && raw !== null) {
				this.#stored = true;
				value = this.#migrate(raw);
			}
		}

		this.#value = value !== undefined ? value : this.#initial(this.#ctx);
		// removing expired ttl fields must reach storage even if the handler changes nothing
		if (sweepExpiredTtl(this.#value)) this.#forceDirty = true;
		this.#snapshot = snapshotOf(this.#value);
		this.#loaded = true;

		return this.#value;
	}

	#migrate(raw: unknown): S {
		if (this.#migrations === undefined) return raw as S;

		let from = 0;
		let data: unknown = raw;
		if (isVersionEnvelope(raw)) {
			from = raw.v;
			data = raw.data;
		}

		for (let v = from + 1; v <= this.#version; v++) {
			data = this.#migrations[v]?.(data);
		}

		// persist the upgraded shape even if the handler doesn't touch the session
		if (from !== this.#version) this.#forceDirty = true;

		return data as S;
	}

	/** post-handlers flush: write when dirty (or forced), otherwise refresh a sliding ttl. */
	async flush(alwaysSave: boolean): Promise<void> {
		if (this.key === undefined || !this.#loaded) return;

		const current = snapshotOf(this.#value);
		if (alwaysSave || this.#forceDirty || current !== this.#snapshot) {
			await this.#persist(current);
			return;
		}

		if (this.#stored) await this.#storage.touch?.(this.key);
	}

	/** immediate write, snapshot refreshed — the flush after the handlers won't repeat it. */
	async save(): Promise<void> {
		if (this.key === undefined) return;
		await this.load();
		await this.#persist(snapshotOf(this.#value));
	}

	/** delete from storage and start over from `initial()`. only re-persisted if touched after. */
	async clear(): Promise<void> {
		if (this.key !== undefined) await this.#storage.delete(this.key);

		this.#value = this.#initial(this.#ctx);
		this.#snapshot = snapshotOf(this.#value);
		this.#forceDirty = false;
		this.#stored = false;
		this.#loaded = true;
		// a concurrent in-flight load must not resurrect the deleted record
		this.#loadPromise = Promise.resolve(this.#value);
	}

	async #persist(snapshot: string): Promise<void> {
		if (this.key === undefined) return;

		const stored =
			this.#migrations === undefined
				? this.#value
				: ({ __yaebal: "session", v: this.#version, data: this.#value } as unknown as S);

		await this.#storage.set(this.key, stored);
		this.#snapshot = snapshot;
		this.#forceDirty = false;
		this.#stored = true;
	}
}

// per-context registry so clearSession/saveSession can find their controller.
// a WeakMap (not a ctx property) keeps the context clean and the types honest.
const registries = new WeakMap<Context, Map<string, SessionController<unknown>>>();

function registryOf(ctx: Context): Map<string, SessionController<unknown>> {
	let registry = registries.get(ctx);
	if (registry === undefined) {
		registry = new Map();
		registries.set(ctx, registry);
	}
	return registry;
}

function controllerOf(ctx: Context, field: string): SessionController<unknown> {
	const controller = registries.get(ctx)?.get(field);
	if (controller === undefined) {
		throw new SessionError(
			`no session under ctx.${field} — is session() installed, and the field name right?`,
		);
	}
	return controller;
}

/**
 * delete the session from storage and reset `ctx.<key>` to a fresh `initial()`. the fresh
 * state is only re-persisted if a handler changes it afterwards.
 *
 * ```ts
 * bot.command("reset", async (ctx) => { await clearSession(ctx); });
 * ```
 */
export async function clearSession<K extends string = "session">(
	// NoInfer: K comes from the `key` argument (or the default), never from ctx's other fields
	ctx: Context & Record<NoInfer<K>, unknown>,
	key?: K,
): Promise<void> {
	return controllerOf(ctx, key ?? "session").clear();
}

/**
 * flush the session to storage right now instead of waiting for the handlers to finish —
 * useful before a long-running call that might crash, or inside long conversations.
 */
export async function saveSession<K extends string = "session">(
	ctx: Context & Record<NoInfer<K>, unknown>,
	key?: K,
): Promise<void> {
	return controllerOf(ctx, key ?? "session").save();
}

function buildSessionMiddleware<S>(
	options: SessionOptions<S, string>,
	lazy: boolean,
): Middleware<Context> {
	const { initial, migrations } = options;
	const storage = options.storage ?? new MemoryStorage<S>();
	const getKey: SessionKeyResolver = options.getKey ?? keyBy.chat;
	const field = options.key ?? "session";
	const alwaysSave = options.alwaysSave ?? false;
	const onMissingKey = options.onMissingKey ?? "throwaway";
	const version = migrations === undefined ? 0 : versionOf(migrations);

	return async (ctx, next) => {
		const key = normalizeSessionKey(await getKey(ctx));

		if (key === undefined && onMissingKey !== "throwaway") {
			if (onMissingKey === "error") {
				throw new SessionError(
					`no session key for this ${ctx.updateType} update (onMissingKey: "error")`,
				);
			}
			return next(); // "skip": the field is simply absent for this update
		}

		const registry = registryOf(ctx);
		if (registry.has(field)) {
			throw new SessionError(
				`two session() installs share ctx.${field} — give one of them a distinct \`key\` option`,
			);
		}

		const controller = new SessionController<S>(ctx, key, storage, initial, migrations, version);
		registry.set(field, controller as SessionController<unknown>);

		if (!lazy) await controller.load();

		Object.defineProperty(ctx, field, {
			configurable: true,
			enumerable: true,
			get: lazy ? () => controller.load() : () => controller.value,
			set: (value: S) => controller.assign(value),
		});

		await next();

		// a throwing handler skips the flush on purpose: half-applied state is not persisted.
		// (with the default cloning MemoryStorage that guarantee holds by construction; a
		// reference-sharing store — clone: false — can't provide it.)
		await controller.flush(alwaysSave);
	};
}

/**
 * session plugin: loads `ctx.session` before handlers run and persists it after — but only
 * when it actually changed (deep changes count; no proxies, dirtiness is a serialized-snapshot
 * comparison). per-chat by default; see {@link keyBy} for other partitions and
 * {@link SessionOptions} for storage, ttl fields, migrations and multi-session setups.
 *
 * ```ts
 * bot.install(session({ initial: () => ({ count: 0 }) }));
 * bot.on("message", (ctx) => ctx.send(`#${++ctx.session.count}`));
 * ```
 */
export function session<S, K extends string = "session">(
	options: SessionOptions<S, K>,
): Plugin<Context, Record<K, S>> {
	const middleware = buildSessionMiddleware<S>(options, false);

	return ((composer: Composer<Context>) => composer.use(middleware)) as unknown as Plugin<
		Context,
		Record<K, S>
	>;
}

/**
 * like {@link session}, but storage isn't read until the first `await ctx.session` — handlers
 * that never touch the session cost zero storage round-trips. mutations after the `await` are
 * tracked exactly like the eager variant; the flush after the handlers is skipped entirely if
 * the session was never loaded.
 *
 * ```ts
 * bot.install(lazySession({ initial: () => ({ count: 0 }) }));
 * bot.on("message", async (ctx) => {
 *   const session = await ctx.session; // ← the only storage read, and only here
 *   session.count++;
 * });
 * ```
 */
export function lazySession<S, K extends string = "session">(
	options: SessionOptions<S, K>,
): Plugin<Context, Record<K, Promise<S>>> {
	const middleware = buildSessionMiddleware<S>(options, true);

	return ((composer: Composer<Context>) => composer.use(middleware)) as unknown as Plugin<
		Context,
		Record<K, Promise<S>>
	>;
}
