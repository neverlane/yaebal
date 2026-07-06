import assert from "node:assert/strict";
import test from "node:test";
import type { Filter } from "./index.js";
import { Composer, Context } from "./index.js";
import type { Update } from "./telegram-types.js";

/** minimal no-op api stub — composer tests never make real api calls. */
const stubApi = null as unknown as InstanceType<typeof Context>["api"];

function makeCtx(update: Update): Context {
	const keys = Object.keys(update).filter((k) => k !== "update_id") as (keyof Update)[];
	const updateType = keys[0] as Context["updateType"];

	return new Context({ api: stubApi, update, updateType });
}

function makeMessageCtx(text?: string): Context {
	return makeCtx({
		update_id: 1,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 1, type: "private" as const },
			...(text !== undefined ? { text } : {}),
		},
	} as Update);
}

function makeCallbackCtx(data = "btn"): Context {
	return makeCtx({
		update_id: 2,
		callback_query: {
			id: "q1",
			from: { id: 99, is_bot: false, first_name: "U" },
			chat_instance: "ci",
			data,
		},
	} as unknown as Update);
}

/** run `composer.toMiddleware()` against ctx and resolve when the chain ends. */
async function run(composer: Composer, ctx: Context): Promise<void> {
	await composer.toMiddleware()(ctx, async () => {});
}

test("filter: runs handlers when filter.test returns true", async () => {
	const alwaysTrue: Filter = {
		test(_ctx): _ctx is Context {
			return true;
		},
	};

	let called = false;
	const composer = new Composer().filter(alwaysTrue, (_ctx) => {
		called = true;
	});

	await run(composer, makeMessageCtx("hi"));
	assert.ok(called, "handler should have been called");
});

test("filter: skips handlers and calls next when filter.test returns false", async () => {
	const alwaysFalse: Filter = {
		test(_ctx): _ctx is Context {
			return false;
		},
	};

	let handlerCalled = false;
	let nextCalled = false;

	const composer = new Composer()
		.filter(alwaysFalse, (_ctx) => {
			handlerCalled = true;
		})
		.use((_ctx, next) => {
			nextCalled = true;
			return next();
		});

	await run(composer, makeMessageCtx());
	assert.equal(handlerCalled, false, "handler must not run when filter rejects");
	assert.ok(nextCalled, "next middleware must still be reached");
});

test("filter: handler sees data attached by filter.test via Object.assign", async () => {
	interface WithMatch {
		match: RegExpMatchArray;
	}

	const regexFilter: Filter<Context, WithMatch> = {
		test(ctx): ctx is Context & WithMatch {
			const m = ctx.text?.match(/hello (\w+)/);
			if (!m) return false;

			Object.assign(ctx as object, { match: m });
			return true;
		},
	};

	let captured: RegExpMatchArray | undefined;
	const composer = new Composer().filter(regexFilter, (ctx) => {
		captured = (ctx as Context & WithMatch).match;
	});

	await run(composer, makeMessageCtx("hello world"));
	assert.ok(captured, "match should be set on ctx");
	assert.equal(captured[1], "world");
});

test("filter: filter.test that attaches data is not called for non-matching ctx", async () => {
	interface WithMatch {
		match: RegExpMatchArray;
	}

	const regexFilter: Filter<Context, WithMatch> = {
		test(ctx): ctx is Context & WithMatch {
			const m = ctx.text?.match(/hello (\w+)/);
			if (!m) return false;

			Object.assign(ctx as object, { match: m });
			return true;
		},
	};

	let handlerCalled = false;
	const composer = new Composer().filter(regexFilter, (_ctx) => {
		handlerCalled = true;
	});

	// callback_query ctx has no text — regex won't match
	await run(composer, makeCallbackCtx());
	assert.equal(handlerCalled, false);
});

test("filter: type guard narrows — handler sees ctx.tag added by filter", async () => {
	const tagFilter: Filter<Context, { tag: number }> = {
		test(ctx): ctx is Context & { tag: number } {
			Object.assign(ctx as object, { tag: 42 });
			return true;
		},
	};

	let seenTag: number | undefined;
	const composer = new Composer().filter(tagFilter, (ctx) => {
		// typescript sees ctx.tag as number here (narrowed by the Filter type)
		seenTag = (ctx as Context & { tag: number }).tag;
	});

	await run(composer, makeMessageCtx());
	assert.equal(seenTag, 42);
});

test("derive scoped: fn runs for the listed update type and field is present", async () => {
	const composer = new Composer().derive("message", (_ctx) => ({ enriched: true }));

	const msgCtx = makeMessageCtx("test");
	await run(composer, msgCtx);
	assert.equal((msgCtx as unknown as { enriched?: boolean }).enriched, true);
});

test("derive scoped: fn does NOT run for a different update type", async () => {
	const composer = new Composer().derive("message", (_ctx) => ({ enriched: true }));

	const cbCtx = makeCallbackCtx();
	await run(composer, cbCtx);
	assert.equal((cbCtx as unknown as { enriched?: boolean }).enriched, undefined);
});

test("derive scoped: both updateTypes work when given an array", async () => {
	const composer = new Composer().derive(["message", "callback_query"], (_ctx) => ({
		enriched: true,
	}));

	const msgCtx = makeMessageCtx();
	const cbCtx = makeCallbackCtx();

	await run(composer, msgCtx);
	await run(composer, cbCtx);

	assert.equal((msgCtx as unknown as { enriched?: boolean }).enriched, true);
	assert.equal((cbCtx as unknown as { enriched?: boolean }).enriched, true);
});

test("derive scoped: unscoped array — non-listed type is not enriched", async () => {
	const composer = new Composer().derive("message", (_ctx) => ({ enriched: true }));

	const cbCtx = makeCallbackCtx();
	await run(composer, cbCtx);

	assert.equal((cbCtx as unknown as { enriched?: boolean }).enriched, undefined);
});

test("derive scoped: fn receives the context for async enrichment", async () => {
	const composer = new Composer().derive("message", async (ctx) => ({
		textLen: ctx.text?.length ?? 0,
	}));

	const msgCtx = makeMessageCtx("hello");
	await run(composer, msgCtx);
	assert.equal((msgCtx as unknown as { textLen?: number }).textLen, 5);
});

test("filter query: :text and :caption are distinct predicates", async () => {
	const { matchQuery } = await import("./composer.js");

	const captionOnly = makeCtx({
		update_id: 3,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 1, type: "private" as const },
			caption: "pic",
		},
	} as Update);
	const textOnly = makeMessageCtx("hi");

	assert.equal(matchQuery(captionOnly, "message:caption"), true);
	assert.equal(matchQuery(captionOnly, "message:text"), false); // captions are not text
	assert.equal(matchQuery(textOnly, "message:text"), true);
	assert.equal(matchQuery(textOnly, "message:caption"), false);
});

test("command: skips edited messages and captions, matches fresh text", async () => {
	const hits: string[] = [];
	const composer = new Composer().command("start", (ctx) => {
		hits.push((ctx as Context & { command: string }).command);
	});

	await run(composer, makeMessageCtx("/start now"));
	assert.deepEqual(hits, ["start"]);

	// an edited `/start` must not re-fire the handler
	hits.length = 0;
	await run(
		composer,
		makeCtx({
			update_id: 4,
			edited_message: {
				message_id: 1,
				date: 0,
				chat: { id: 1, type: "private" as const },
				text: "/start now",
			},
		} as Update),
	);
	assert.deepEqual(hits, []);

	// a `/start` caption is not a command
	await run(
		composer,
		makeCtx({
			update_id: 5,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: 1, type: "private" as const },
				caption: "/start now",
			},
		} as Update),
	);
	assert.deepEqual(hits, []);
});

test("command: /cmd@botname is checked against ctx.me when known", async () => {
	const me = { id: 1, is_bot: true, first_name: "b", username: "MyBot" };
	const withMe = (text: string) =>
		new Context({
			api: stubApi,
			updateType: "message",
			me: me as never,
			update: {
				update_id: 6,
				message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text },
			} as never,
		});

	let hits = 0;
	const composer = new Composer().command("start", () => {
		hits++;
	});

	await run(composer, withMe("/start@mybot")); // case-insensitive match
	assert.equal(hits, 1);

	await run(composer, withMe("/start@other_bot")); // addressed to someone else
	assert.equal(hits, 1);

	// without getMe info (webhook mode) a mention is accepted, as before
	await run(composer, makeMessageCtx("/start@whoever"));
	assert.equal(hits, 2);
});

test("hears: a callback update never triggers text handlers, even with a grafted message", async () => {
	let fired = false;
	const composer = new Composer().hears(/hello/, () => {
		fired = true;
	});

	const ctx = makeCallbackCtx();
	// simulate the rich context factory grafting the button's message onto the ctx
	Object.defineProperty(ctx, "message", {
		value: { message_id: 9, date: 0, chat: { id: 1, type: "private" }, text: "hello world" },
		enumerable: true,
		configurable: true,
	});

	await run(composer, ctx);
	assert.equal(fired, false);
});
