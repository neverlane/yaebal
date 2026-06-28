import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { MemoryStorage, session } from "./index.js";

const api = {} as never;
const noop = async () => {};

// the entry ctx is a bare Context; the session middleware adds `session` itself.
// mirror Bot.start()'s cast so the runnable type matches the runtime reality.
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

function mkCtx(chatId: number): Context {
	return new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
				from: { id: chatId, is_bot: false, first_name: "u" },
				text: "hi",
			},
		} as never,
		updateType: "message",
	});
}

test("MemoryStorage round-trips values", () => {
	const s = new MemoryStorage<number>();

	s.set("a", 1);
	assert.equal(s.get("a"), 1);

	s.delete("a");
	assert.equal(s.get("a"), undefined);
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

test("session falls back to initial when nothing stored", async () => {
	const storage = new MemoryStorage<{ count: number }>();
	let seen = -1;

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 7 }), storage }))
		.use((ctx, next) => {
			seen = ctx.session.count;
			return next();
		});

	await entry(c)(mkCtx(1), noop);
	assert.equal(seen, 7);
});

test("a custom getKey switches the partition", async () => {
	const storage = new MemoryStorage<{ n: number }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ n: 0 }), storage, getKey: () => "global" }))
		.use((ctx, next) => {
			ctx.session.n++;
			return next();
		});

	const mw = entry(c);

	await mw(mkCtx(1), noop);
	await mw(mkCtx(2), noop);

	assert.equal((await storage.get("global"))?.n, 2);
});

test("keyless update gets a working, non-persisted session", async () => {
	const storage = new MemoryStorage<{ count: number }>();
	let seen = -1;

	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 3 }), storage }))
		.use((ctx, next) => {
			ctx.session.count++;
			seen = ctx.session.count;
			return next();
		});

	// an update with no chat (e.g. a poll) → no key
	const keyless = new Context({
		api,
		update: { update_id: 1 } as never,
		updateType: "poll",
	});

	await entry(c)(keyless, noop);
	assert.equal(seen, 4); // session was usable
	assert.equal(await storage.get("0"), undefined); // nothing persisted
});

test("a throwing handler leaves storage untouched", async () => {
	const storage = new MemoryStorage<{ count: number }>();
	const c = new Composer<Context>()
		.install(session({ initial: () => ({ count: 0 }), storage }))
		.use((ctx) => {
			ctx.session.count++;
			throw new Error("boom");
		});

	await assert.rejects(async () => {
		await entry(c)(mkCtx(5), noop);
	}, /boom/);
	
	assert.equal(await storage.get("5"), undefined);
});
