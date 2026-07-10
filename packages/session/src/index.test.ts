import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import {
	clearSession,
	keyBy,
	lazySession,
	MemoryStorage,
	normalizeSessionKey,
	SessionError,
	type StorageAdapter,
	saveSession,
	session,
	type TtlValue,
	ttl,
	unwrapTtl,
} from "./index.js";

const api = {} as never;
const noop = async () => {};

// the entry ctx is a bare Context; the session middleware adds `session` itself.
// mirror Bot.start()'s cast so the runnable type matches the runtime reality.
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

function mkCtx(chatId: number, userId = chatId): Context {
	return new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
				from: { id: userId, is_bot: false, first_name: "u" },
				text: "hi",
			},
		} as never,
		updateType: "message",
	});
}

// an update with no chat (a poll) — the default per-chat key resolves to undefined
function keylessCtx(): Context {
	return new Context({ api, update: { update_id: 1 } as never, updateType: "poll" });
}

// an inline query: carries a user but no chat
function inlineCtx(userId: number): Context {
	return new Context({
		api,
		update: {
			update_id: 1,
			inline_query: {
				id: "1",
				from: { id: userId, is_bot: false, first_name: "u" },
				query: "",
				offset: "",
			},
		} as never,
		updateType: "inline_query",
	});
}

function countingStorage<T>() {
	const inner = new Map<string, T>();
	const counts = { get: 0, set: 0, delete: 0 };

	const adapter: StorageAdapter<T> = {
		get(key) {
			counts.get++;
			return inner.get(key);
		},
		set(key, value) {
			counts.set++;
			inner.set(key, value);
		},
		delete(key) {
			counts.delete++;
			inner.delete(key);
		},
	};

	return { adapter, counts, inner };
}

test("MemoryStorage is still exported from @yaebal/session (compat)", () => {
	const s = new MemoryStorage<number>();
	s.set("a", 1);
	assert.equal(s.get("a"), 1);
});

test("session persists per chat across updates", async () => {
	const storage = new MemoryStorage<{ count: number }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage }))
		.use((ctx, next) => {
			ctx.session.count++;
			return next();
		});

	const mw = entry(c);

	await mw(mkCtx(42), noop);
	await mw(mkCtx(42), noop);
	await mw(mkCtx(99), noop);

	assert.equal((await storage.get("42"))?.count, 2);
	assert.equal((await storage.get("99"))?.count, 1);
});

test("initial receives the context", async () => {
	const storage = new MemoryStorage<{ name: string }>();
	let seen = "";

	const c = new Composer<Context>()
		.install(session({ initial: (ctx) => ({ name: ctx.from?.first_name ?? "?" }), storage }))
		.use((ctx, next) => {
			seen = ctx.session.name;
			return next();
		});

	await entry(c)(mkCtx(1), noop);
	assert.equal(seen, "u");
});

test("an unchanged session is never written — fresh or stored", async () => {
	const { adapter, counts, inner } = countingStorage<{ count: number }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage: adapter }))
		.use((ctx, next) => {
			void ctx.session.count; // read, don't change
			return next();
		});

	const mw = entry(c);

	// fresh session, untouched → no initial() junk lands in storage
	await mw(mkCtx(1), noop);
	assert.equal(counts.set, 0);
	assert.equal(inner.has("1"), false);

	// stored session, untouched → not rewritten either
	inner.set("2", { count: 5 });
	await mw(mkCtx(2), noop);
	assert.equal(counts.set, 0);
});

test("deep mutations are detected without proxies", async () => {
	const storage = new MemoryStorage<{ nested: { items: number[] } }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ nested: { items: [] as number[] } }), storage }))
		.use((ctx, next) => {
			ctx.session.nested.items.push(7);
			return next();
		});

	await entry(c)(mkCtx(1), noop);
	assert.deepEqual((await storage.get("1"))?.nested.items, [7]);
});

test("reassigning ctx.session persists the new value", async () => {
	const storage = new MemoryStorage<{ count: number }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage }))
		.use((ctx, next) => {
			ctx.session = { count: 99 };
			return next();
		});

	await entry(c)(mkCtx(1), noop);
	assert.equal((await storage.get("1"))?.count, 99);
});

test("alwaysSave writes even when nothing changed", async () => {
	const { adapter, counts } = countingStorage<{ count: number }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage: adapter, alwaysSave: true }))
		.use((_ctx, next) => next());

	await entry(c)(mkCtx(1), noop);
	assert.equal(counts.set, 1);
});

test("a fully async adapter works", async () => {
	const inner = new Map<string, { n: number }>();
	const adapter: StorageAdapter<{ n: number }> = {
		async get(key) {
			return inner.get(key);
		},
		async set(key, value) {
			inner.set(key, value);
		},
		async delete(key) {
			inner.delete(key);
		},
	};

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ n: 0 }), storage: adapter }))
		.use((ctx, next) => {
			ctx.session.n++;
			return next();
		});

	const mw = entry(c);
	await mw(mkCtx(3), noop);
	await mw(mkCtx(3), noop);

	assert.equal(inner.get("3")?.n, 2);
});

test("getKey may be async and switches the partition", async () => {
	const storage = new MemoryStorage<{ n: number }>();
	const c = new Composer<Context>()
		.install(
			session({
				initial: () => ({ n: 0 }),
				storage,
				getKey: async () => "global",
			}),
		)
		.use((ctx, next) => {
			ctx.session.n++;
			return next();
		});

	const mw = entry(c);
	await mw(mkCtx(1), noop);
	await mw(mkCtx(2), noop);

	assert.equal((await storage.get("global"))?.n, 2);
});

test("keyBy.user gives inline queries a session; keyBy.chat would not", async () => {
	const storage = new MemoryStorage<{ n: number }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ n: 0 }), storage, getKey: keyBy.user }))
		.use((ctx, next) => {
			ctx.session.n++;
			return next();
		});

	await entry(c)(inlineCtx(7), noop);
	assert.equal((await storage.get("7"))?.n, 1);
});

test("composite key descriptors normalize with stable prefixes", () => {
	assert.equal(normalizeSessionKey(undefined), undefined);
	assert.equal(normalizeSessionKey(""), undefined);
	assert.equal(normalizeSessionKey({}), undefined);
	assert.equal(normalizeSessionKey("plain"), "plain");
	assert.equal(normalizeSessionKey({ chat: 42, user: 7 }), "user:7:chat:42");
	assert.equal(normalizeSessionKey({ chat: 1, thread: 5 }), "chat:1:thread:5");
	assert.equal(normalizeSessionKey({ key: "global" }), "key:global");
});

test("keyBy.chatUser partitions group members separately", async () => {
	const storage = new MemoryStorage<{ n: number }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ n: 0 }), storage, getKey: keyBy.chatUser }))
		.use((ctx, next) => {
			ctx.session.n++;
			return next();
		});

	const mw = entry(c);
	await mw(mkCtx(10, 7), noop);
	await mw(mkCtx(10, 8), noop);

	assert.equal((await storage.get("user:7:chat:10"))?.n, 1);
	assert.equal((await storage.get("user:8:chat:10"))?.n, 1);
});

test("keyless update gets a working, non-persisted session (throwaway default)", async () => {
	const { adapter, counts } = countingStorage<{ count: number }>();
	let seen = -1;

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 3 }), storage: adapter }))
		.use((ctx, next) => {
			ctx.session.count++;
			seen = ctx.session.count;
			return next();
		});

	await entry(c)(keylessCtx(), noop);
	assert.equal(seen, 4); // session was usable
	assert.equal(counts.set, 0); // nothing persisted, nothing even read
	assert.equal(counts.get, 0);
});

test('onMissingKey: "skip" leaves the field off the context', async () => {
	let present: boolean | undefined;

	const c = new Composer<Context>()
		.install(
			session({
				initial: () => ({ n: 0 }),
				storage: new MemoryStorage<{ n: number }>(),
				onMissingKey: "skip",
			}),
		)
		.use((ctx, next) => {
			present = "session" in ctx;
			return next();
		});

	await entry(c)(keylessCtx(), noop);
	assert.equal(present, false);
});

test('onMissingKey: "error" fails loud', async () => {
	const c = new Composer<Context>().install(
		session({
			initial: () => ({ n: 0 }),
			storage: new MemoryStorage<{ n: number }>(),
			onMissingKey: "error",
		}),
	);

	await assert.rejects(async () => {
		await entry(c)(keylessCtx(), noop);
	}, SessionError);
});

test("a throwing handler leaves storage untouched — even for an existing session", async () => {
	const storage = new MemoryStorage<{ count: number }>(); // clones by default
	storage.set("5", { count: 1 });

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage }))
		.use((ctx) => {
			ctx.session.count = 100;
			throw new Error("boom");
		});

	await assert.rejects(async () => {
		await entry(c)(mkCtx(5), noop);
	}, /boom/);

	assert.equal(storage.get("5")?.count, 1);
});

test("two sessions live side by side under distinct keys", async () => {
	const perChat = new MemoryStorage<{ topic: string }>();
	const perUser = new MemoryStorage<{ visits: number }>();

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ topic: "" }), storage: perChat, key: "chatState" }))
		.install(
			session({
				initial: () => ({ visits: 0 }),
				storage: perUser,
				key: "userState",
				getKey: keyBy.user,
			}),
		)
		.use((ctx, next) => {
			ctx.chatState.topic = "pricing";
			ctx.userState.visits++;
			return next();
		});

	await entry(c)(mkCtx(10, 7), noop);

	assert.equal((await perChat.get("10"))?.topic, "pricing");
	assert.equal((await perUser.get("7"))?.visits, 1);
});

test("two installs sharing one field fail loud", async () => {
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ a: 0 }), storage: new MemoryStorage<{ a: number }>() }))
		.install(session({ initial: () => ({ b: 0 }), storage: new MemoryStorage<{ b: number }>() }));

	await assert.rejects(async () => {
		await entry(c)(mkCtx(1), noop);
	}, /share ctx\.session/);
});

test("clearSession deletes the record and resets to initial", async () => {
	const storage = new MemoryStorage<{ count: number }>();
	storage.set("42", { count: 9 });
	let afterClear = -1;

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage }))
		.use(async (ctx, next) => {
			assert.equal(ctx.session.count, 9);
			await clearSession(ctx);
			afterClear = ctx.session.count;
			return next();
		});

	await entry(c)(mkCtx(42), noop);

	assert.equal(afterClear, 0);
	// untouched after the clear → the fresh initial() is not re-persisted
	assert.equal(storage.get("42"), undefined);
});

test("mutating after clearSession persists the new state", async () => {
	const storage = new MemoryStorage<{ count: number }>();
	storage.set("42", { count: 9 });

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage }))
		.use(async (ctx, next) => {
			await clearSession(ctx);
			ctx.session.count = 1;
			return next();
		});

	await entry(c)(mkCtx(42), noop);
	assert.equal(storage.get("42")?.count, 1);
});

test("saveSession flushes immediately and the final flush doesn't repeat it", async () => {
	const { adapter, counts, inner } = countingStorage<{ count: number }>();
	let setsAtSave = -1;

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage: adapter }))
		.use(async (ctx, next) => {
			ctx.session.count = 5;
			await saveSession(ctx);
			setsAtSave = counts.set;
			return next();
		});

	await entry(c)(mkCtx(1), noop);

	assert.equal(setsAtSave, 1); // written inside the handler
	assert.equal(counts.set, 1); // …and not again afterwards
	assert.equal(inner.get("1")?.count, 5);
});

test("clearSession without the plugin installed throws a SessionError", async () => {
	const ctx = mkCtx(1) as Context & { session: unknown };
	await assert.rejects(() => clearSession(ctx), SessionError);
});

test("an unchanged stored session refreshes a sliding ttl via touch", async () => {
	const inner = new Map<string, { n: number }>();
	const touched: string[] = [];
	const adapter: StorageAdapter<{ n: number }> = {
		get: (key) => inner.get(key),
		set: (key, value) => void inner.set(key, value),
		delete: (key) => void inner.delete(key),
		touch: (key) => void touched.push(key),
	};
	inner.set("42", { n: 1 });

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ n: 0 }), storage: adapter }))
		.use((_ctx, next) => next());

	await entry(c)(mkCtx(42), noop);
	assert.deepEqual(touched, ["42"]);

	// a fresh (never stored) session must not be touched
	await entry(c)(mkCtx(7), noop);
	assert.deepEqual(touched, ["42"]);
});

test("lazySession skips storage entirely when untouched", async () => {
	const { adapter, counts } = countingStorage<{ count: number }>();
	const c = new Composer<Context>()
		.install(lazySession({ initial: () => ({ count: 0 }), storage: adapter }))
		.use((_ctx, next) => next());

	await entry(c)(mkCtx(1), noop);
	assert.equal(counts.get, 0);
	assert.equal(counts.set, 0);
});

test("lazySession loads once, tracks mutations, persists", async () => {
	const { adapter, counts, inner } = countingStorage<{ count: number }>();
	inner.set("1", { count: 10 });

	const c = new Composer<Context>()
		.install(lazySession({ initial: () => ({ count: 0 }), storage: adapter }))
		.use(async (ctx, next) => {
			const first = await ctx.session;
			const second = await ctx.session;
			assert.equal(first, second);
			first.count++;
			return next();
		});

	await entry(c)(mkCtx(1), noop);

	assert.equal(counts.get, 1); // both awaits share one read
	assert.equal(inner.get("1")?.count, 11);
});

test("migrations upgrade old records and persist the new shape once", async () => {
	const { adapter, counts, inner } = countingStorage<unknown>();
	// a record written before migrations existed — implicit version 0
	inner.set("42", { name: "bob" });

	interface V2 {
		fullName: string;
		visits: number;
	}

	const plugin = session<V2>({
		initial: () => ({ fullName: "", visits: 0 }),
		storage: adapter as StorageAdapter<V2>,
		migrations: {
			1: (old) => ({ fullName: (old as { name: string }).name }),
			2: (v1) => ({ ...(v1 as { fullName: string }), visits: 0 }),
		},
	});

	let seen: V2 | undefined;
	const c = new Composer<Context>().install(plugin).use((ctx, next) => {
		seen = { ...ctx.session };
		return next();
	});

	const mw = entry(c);
	await mw(mkCtx(42), noop);

	assert.deepEqual(seen, { fullName: "bob", visits: 0 });
	// the migrated shape was persisted (as a version envelope) even though handlers changed nothing
	assert.equal(counts.set, 1);
	assert.deepEqual(inner.get("42"), {
		__yaebal: "session",
		v: 2,
		data: { fullName: "bob", visits: 0 },
	});

	// second update: already at v2 — read, no rewrite
	await mw(mkCtx(42), noop);
	assert.equal(counts.set, 1);
});

test("gappy or invalid migration maps fail at construction time", () => {
	assert.throws(
		() => session({ initial: () => ({}), migrations: { 2: (d) => d } }),
		/missing step 1/,
	);
	assert.throws(
		() => session({ initial: () => ({}), migrations: { 0: (d) => d } }),
		/positive integer/,
	);
});

test("expired ttl fields are swept on load and the cleanup is persisted", async () => {
	interface OtpSession {
		otp?: TtlValue<string>;
		keep: number;
	}

	const storage = new MemoryStorage<OtpSession>();
	storage.set("42", {
		otp: { $ttl: true, value: "1234", until: Date.now() - 1_000 },
		keep: 7,
	});

	let seen: TtlValue<string> | undefined;
	const c = new Composer<Context>()
		.install(session({ initial: (): OtpSession => ({ keep: 0 }), storage }))
		.use((ctx, next) => {
			seen = ctx.session.otp;
			return next();
		});

	await entry(c)(mkCtx(42), noop);

	assert.equal(seen, undefined);
	const stored = storage.get("42");
	assert.equal(stored?.keep, 7);
	assert.equal(stored !== undefined && "otp" in stored, false);
});

test("ttl() wraps and unwrapTtl() respects expiry", () => {
	const alive = ttl("code", 60_000);
	assert.equal(unwrapTtl(alive), "code");

	const expired: TtlValue<string> = { $ttl: true, value: "code", until: Date.now() - 1 };
	assert.equal(unwrapTtl(expired), undefined);
	assert.equal(unwrapTtl(undefined), undefined);

	assert.throws(() => ttl("x", 0), SessionError);
});
