import assert from "node:assert/strict";
import test from "node:test";
import type { Filter, MediaField } from "./index.js";
import { Composer, Context, matchQuery } from "./index.js";
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

test("ctx.senderChat reads sender_chat off a message, undefined when absent", () => {
	const anon = makeCtx({
		update_id: 3,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: -1, type: "supergroup" as const },
			sender_chat: { id: -1, type: "supergroup" as const },
		},
	} as unknown as Update);
	assert.equal(anon.senderChat?.id, -1);

	assert.equal(makeMessageCtx("hi").senderChat, undefined);
});

test("ctx.senderChat reads sender_chat off a callback_query's message", () => {
	const ctx = makeCtx({
		update_id: 4,
		callback_query: {
			id: "q1",
			from: { id: 99, is_bot: false, first_name: "U" },
			chat_instance: "ci",
			message: {
				message_id: 1,
				date: 0,
				chat: { id: -1, type: "supergroup" as const },
				sender_chat: { id: -2, type: "channel" as const },
			},
		},
	} as unknown as Update);

	assert.equal(ctx.senderChat?.id, -2);
});

test("ctx.entities reads message.entities, falls back to caption_entities, undefined when neither", () => {
	const entity = { type: "bold" as const, offset: 0, length: 2 };

	const fromText = makeCtx({
		update_id: 5,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 1, type: "private" as const },
			text: "hi",
			entities: [entity],
		},
	} as Update);
	assert.deepEqual(fromText.entities, [entity]);

	const fromCaption = makeCtx({
		update_id: 6,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 1, type: "private" as const },
			caption: "pic",
			caption_entities: [entity],
		},
	} as Update);
	assert.deepEqual(fromCaption.entities, [entity]);

	assert.equal(makeMessageCtx("hi").entities, undefined);
});

test("filter: runs handlers when the filter returns true", async () => {
	let called = false;
	const composer = new Composer().filter(
		() => true,
		(_ctx) => {
			called = true;
		},
	);

	await run(composer, makeMessageCtx("hi"));
	assert.ok(called, "handler should have been called");
});

test("filter: skips handlers and calls next when the filter returns false", async () => {
	let handlerCalled = false;
	let nextCalled = false;

	const composer = new Composer()
		.filter(
			() => false,
			(_ctx) => {
				handlerCalled = true;
			},
		)
		.use((_ctx, next) => {
			nextCalled = true;
			return next();
		});

	await run(composer, makeMessageCtx());
	assert.equal(handlerCalled, false, "handler must not run when filter rejects");
	assert.ok(nextCalled, "next middleware must still be reached");
});

test("filter: staged bag fields are committed onto the context on match", async () => {
	interface WithMatch {
		match: RegExpMatchArray;
	}

	const regexFilter: Filter<Context, WithMatch> = (ctx, bag) => {
		const m = ctx.text?.match(/hello (\w+)/);
		if (!m) return false;

		bag.match = m;
		return true;
	};

	let captured: RegExpMatchArray | undefined;
	const composer = new Composer().filter(regexFilter, (ctx) => {
		captured = ctx.match;
	});

	await run(composer, makeMessageCtx("hello world"));
	assert.ok(captured, "match should be committed onto ctx");
	assert.equal(captured[1], "world");
});

test("filter: a rejecting filter leaves the context untouched, even if it staged data", async () => {
	const staging: Filter<Context, { tag: number }> = (_ctx, bag) => {
		bag.tag = 42; // staged, then rejected — must never land on ctx
		return false;
	};

	const ctx = makeMessageCtx("hi");
	await run(
		new Composer().filter(staging, () => {}),
		ctx,
	);

	assert.equal((ctx as Context & { tag?: number }).tag, undefined);
});

test("filter: async filters are awaited and commit their bag", async () => {
	const asyncTag: Filter<Context, { tag: number }> = async (_ctx, bag) => {
		await Promise.resolve();
		bag.tag = 42;
		return true;
	};

	let seenTag: number | undefined;
	const composer = new Composer().filter(asyncTag, (ctx) => {
		seenTag = ctx.tag;
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

test("on: message:photo narrows ctx.message.photo to non-optional", async () => {
	let photoCount: number | undefined;

	const composer = new Composer().on("message:photo", (ctx) => {
		// no `?.` needed — `Filtered` narrows `ctx.message` to carry `photo`. if this
		// stops compiling, the type-level narrowing for media queries has regressed.
		photoCount = ctx.message.photo.length;
	});

	const ctx = makeCtx({
		update_id: 9,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 1, type: "private" as const },
			photo: [{ file_id: "f1", file_unique_id: "u1", width: 90, height: 90 }],
		},
	} as Update);

	await run(composer, ctx);
	assert.equal(photoCount, 1);
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

test("command: case-insensitive name, clean args, raw payload", async () => {
	const seen: Array<{ command: string; args: string[]; payload: string }> = [];
	const composer = new Composer().command("start", (ctx) => {
		const { command, args, payload } = ctx as Context & {
			command: string;
			args: string[];
			payload: string;
		};
		seen.push({ command, args, payload });
	});

	await run(composer, makeMessageCtx("/START ref_42"));
	await run(composer, makeMessageCtx("/start  ")); // trailing whitespace → no phantom "" arg
	assert.deepEqual(seen, [
		{ command: "START", args: ["ref_42"], payload: "ref_42" },
		{ command: "start", args: [], payload: "" },
	]);
});

test("hears: a shared sticky/global regex matches every update, not every other one", async () => {
	let hits = 0;
	const composer = new Composer().hears(/\d+/y, () => {
		hits++;
	});

	await run(composer, makeMessageCtx("123"));
	await run(composer, makeMessageCtx("123")); // stateful lastIndex would skip this one
	assert.equal(hits, 2);
});

test("context: from/chat cover non-message updates (inline query, chat member)", async () => {
	const inlineCtx = makeCtx({
		update_id: 7,
		inline_query: {
			id: "iq",
			from: { id: 7, is_bot: false, first_name: "u" },
			query: "q",
			offset: "",
		},
	} as unknown as Update);
	assert.equal(inlineCtx.from?.id, 7);

	const memberCtx = makeCtx({
		update_id: 8,
		my_chat_member: {
			chat: { id: 5, type: "group" as const, title: "g" },
			from: { id: 7, is_bot: false, first_name: "u" },
			date: 0,
			old_chat_member: { status: "member", user: { id: 1, is_bot: true, first_name: "b" } },
			new_chat_member: { status: "kicked", user: { id: 1, is_bot: true, first_name: "b" } },
		},
	} as unknown as Update);
	assert.equal(memberCtx.chat?.id, 5);
	assert.equal(memberCtx.from?.id, 7);
});

// ── filter-query parity: Filtered<C,Q> (type narrow) ↔ matchQuery/checkField (runtime gate) ──
//
// the type-level narrow and the runtime matcher are maintained independently
// (composer.ts Filtered vs checkField). if they drift, `on(q)` narrows a field the
// runtime never verified — an unsound narrow. these tests lock the two together:
//   1. runtime: matchQuery gates on exactly the field the query names (present → true, absent → false);
//   2. compile-time: `on(q)` handlers read the narrowed field with no `?.` — a Filtered regression stops compiling;
//   3. exhaustiveness: the media-field table must cover every key of MediaField (a new key won't compile until listed).

/** every `message:<key>` media field whose presence `on()` narrows. must mirror `MediaField`. */
const MEDIA_FIELDS = [
	"photo",
	"video",
	"sticker",
	"audio",
	"voice",
	"document",
	"animation",
	"contact",
	"location",
	"poll",
	"dice",
	"venue",
	"video_note",
	"game",
	"invoice",
	"successful_payment",
	"web_app_data",
] as const satisfies readonly (keyof MediaField)[];

// fails to compile if a key is added to MediaField without being listed above — forcing
// whoever extends the narrow to also confirm the runtime gate covers it.
type _MediaExhaustive = Exclude<keyof MediaField, (typeof MEDIA_FIELDS)[number]> extends never
	? true
	: ["MEDIA_FIELDS missing keys:", Exclude<keyof MediaField, (typeof MEDIA_FIELDS)[number]>];
const _mediaExhaustive: _MediaExhaustive = true;
void _mediaExhaustive;

test("filter parity: every media query gates on its field (present → match, absent → no match)", () => {
	const bare = makeMessageCtx("hi"); // has text, none of the media fields

	for (const field of MEDIA_FIELDS) {
		const value = field === "photo" ? [{ file_id: "f", file_unique_id: "u" }] : { _present: 1 };
		const withField = makeCtx({
			update_id: 100,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: 1, type: "private" as const },
				[field]: value,
			},
		} as unknown as Update);

		assert.equal(matchQuery(withField, `message:${field}`), true, `${field}: should match when present`);
		assert.equal(matchQuery(bare, `message:${field}`), false, `${field}: should not match when absent`);
	}
});

test("filter parity: text/caption/data/entities gate on their field", () => {
	const withEntities = makeCtx({
		update_id: 101,
		message: {
			message_id: 1,
			date: 0,
			chat: { id: 1, type: "private" as const },
			text: "hi",
			entities: [{ type: "bold" as const, offset: 0, length: 2 }],
		},
	} as Update);

	assert.equal(matchQuery(makeMessageCtx("hi"), "message:text"), true);
	assert.equal(matchQuery(makeMessageCtx(), "message:text"), false);
	assert.equal(matchQuery(withEntities, "message:entities"), true);
	assert.equal(matchQuery(makeMessageCtx("hi"), "message:entities"), false);
	assert.equal(matchQuery(makeCallbackCtx("payload"), "callback_query:data"), true);
	assert.equal(matchQuery(makeCallbackCtx("payload"), "callback_query"), true);
	assert.equal(matchQuery(makeMessageCtx("hi"), "callback_query:data"), false);
});

test("filter parity: on(q) narrows the field the runtime just matched (compile-time lock)", async () => {
	const read: string[] = [];

	// each handler reads the narrowed field WITHOUT `?.` — the whole point. if any of
	// these stops compiling, Filtered<C,Q> has drifted from what the query promises.
	const composer = new Composer()
		.on("message:text", (ctx) => {
			read.push(`text:${ctx.text.length}`);
		})
		.on("message:entities", (ctx) => {
			read.push(`entities:${ctx.entities.length}`);
		})
		.on("callback_query:data", (ctx) => {
			read.push(`data:${ctx.callbackQuery.data ?? ""}`);
		})
		.on("message:video", (ctx) => {
			read.push(`video:${ctx.message.video.file_id}`);
		});

	await run(
		composer,
		makeCtx({
			update_id: 102,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: 1, type: "private" as const },
				video: { file_id: "vf", file_unique_id: "vu", width: 1, height: 1, duration: 1 },
			},
		} as Update),
	);
	assert.deepEqual(read, ["video:vf"]);
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
