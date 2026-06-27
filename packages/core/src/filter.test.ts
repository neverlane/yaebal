import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context } from "./index.js";
import type { Filter } from "./index.js";
import type { Update } from "./telegram-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal no-op API stub — composer tests never make real API calls. */
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

/** Run `composer.toMiddleware()` against ctx and resolve when the chain ends. */
async function run(composer: Composer, ctx: Context): Promise<void> {
	await composer.toMiddleware()(ctx, async () => {});
}

// ---------------------------------------------------------------------------
// filter() — basic pass/fail
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// filter() — data attachment via Object.assign in test()
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Filter type guard narrows — inline filter with tag: number
// ---------------------------------------------------------------------------

test("filter: type guard narrows — handler sees ctx.tag added by filter", async () => {
	const tagFilter: Filter<Context, { tag: number }> = {
		test(ctx): ctx is Context & { tag: number } {
			Object.assign(ctx as object, { tag: 42 });
			return true;
		},
	};

	let seenTag: number | undefined;
	const composer = new Composer().filter(tagFilter, (ctx) => {
		// TypeScript sees ctx.tag as number here (narrowed by the Filter type)
		seenTag = (ctx as Context & { tag: number }).tag;
	});

	await run(composer, makeMessageCtx());
	assert.equal(seenTag, 42);
});

// ---------------------------------------------------------------------------
// scoped derive(updates, fn) — runs only for matching updateType
// ---------------------------------------------------------------------------

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
