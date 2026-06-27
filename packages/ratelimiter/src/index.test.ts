import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { decide, ratelimiter } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

const api = {} as never;
const ctxFrom = (userId: number) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: userId, type: "private" },
				from: { id: userId, is_bot: false, first_name: "u" },
				text: "spam",
			},
		} as never,
		updateType: "message",
	});

test("decide allows up to the limit, then blocks within the window", () => {
	const a = decide(undefined, 1000, 2, 1000);
	assert.deepEqual(a, { allowed: true, window: { count: 1, resetAt: 2000 } });
	const b = decide(a.window, 1000, 2, 1000);
	assert.equal(b.allowed, true); // count 2
	const c = decide(b.window, 1000, 2, 1000);
	assert.equal(c.allowed, false); // count 3 > 2
});

test("decide resets after the window elapses", () => {
	const over = { count: 9, resetAt: 1500 };
	const r = decide(over, 2000, 2, 1000); // now >= resetAt
	assert.deepEqual(r, { allowed: true, window: { count: 1, resetAt: 3000 } });
});

test("ratelimiter drops updates over the limit and fires onLimit", async () => {
	let handled = 0;
	let limited = 0;
	const mw = entry(
		new Composer<Context>()
			.install(ratelimiter({ limit: 2, windowMs: 10_000, onLimit: () => limited++ }))
			.use((_ctx, next) => {
				handled++;
				return next();
			}),
	);

	await mw(ctxFrom(1), noop);
	await mw(ctxFrom(1), noop);
	await mw(ctxFrom(1), noop); // third → dropped
	assert.equal(handled, 2);
	assert.equal(limited, 1);

	await mw(ctxFrom(2), noop); // different user → allowed
	assert.equal(handled, 3);
});
