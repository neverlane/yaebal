import assert from "node:assert/strict";
import test from "node:test";
import { bold, Composer, type Context, format, italic } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import {
	MAX_CAPTION_LENGTH,
	MAX_MESSAGE_LENGTH,
	SplitSendError,
	split,
	splitCaption,
	splitParts,
	splitSend,
	splitText,
	splitter,
} from "./index.js";

// ─── pure splitters ──────────────────────────────────────────────────────────

test("short text is a single part; exactly at the limit does not split", () => {
	assert.deepEqual(split("hello"), ["hello"]);
	assert.deepEqual(split("a".repeat(100), 100), ["a".repeat(100)]);
});

test("empty and whitespace-only texts yield no parts (telegram rejects them)", () => {
	assert.deepEqual(split(""), []);
	assert.deepEqual(split("   \n \n\t "), []);
	assert.deepEqual(splitText(""), []);
});

test("prefers newline boundaries; clean text reconstructs by joining with newline", () => {
	const lines = Array.from({ length: 10 }, (_, i) => `line ${i} ${"x".repeat(40)}`);
	const text = lines.join("\n");
	const chunks = split(text, 100);

	for (const c of chunks) assert.ok(c.length <= 100, `chunk len ${c.length}`);
	assert.equal(chunks.join("\n"), text);
});

test("prefers space boundaries when the window has no newline", () => {
	const text = `${"a".repeat(60)} ${"b".repeat(60)}`;
	assert.deepEqual(split(text, 100), ["a".repeat(60), "b".repeat(60)]);
});

test("hard-splits a single overlong word", () => {
	assert.deepEqual(split("a".repeat(250), 100), ["a".repeat(100), "a".repeat(100), "a".repeat(50)]);
});

test("never cuts a surrogate pair in half", () => {
	const parts = split("😀".repeat(3000), MAX_MESSAGE_LENGTH); // 6000 UTF-16 units

	assert.ok(parts.length >= 2);
	for (const part of parts) {
		assert.ok(part.length <= MAX_MESSAGE_LENGTH);
		// a well-formed part round-trips through code points without replacement chars
		assert.equal([...part].join(""), part);
		const first = part.charCodeAt(0);
		const last = part.charCodeAt(part.length - 1);
		assert.ok(!(first >= 0xdc00 && first <= 0xdfff), "part starts with a lone low surrogate");
		assert.ok(!(last >= 0xd800 && last <= 0xdbff), "part ends with a lone high surrogate");
	}
});

test("whitespace-only middle chunks are dropped, boundary whitespace is trimmed", () => {
	const text = `${"x".repeat(100)}\n \n${"y".repeat(100)}`;
	assert.deepEqual(split(text, 100), ["x".repeat(100), "y".repeat(100)]);
});

test("invalid max throws early instead of hanging", () => {
	for (const bad of [0, -1, 1.5, Number.NaN]) {
		assert.throws(() => split("abc", bad), TypeError);
		assert.throws(() => splitter(bad), TypeError);
	}
});

test("an entity spanning the boundary is clipped and re-based (gramio parity)", () => {
	const text = {
		text: "a".repeat(MAX_MESSAGE_LENGTH + 100),
		entities: [boldAt(0, MAX_MESSAGE_LENGTH + 100)],
	};
	const parts = splitText(text);

	assert.equal(parts.length, 2);
	assert.deepEqual(parts[0]?.entities, [boldAt(0, MAX_MESSAGE_LENGTH)]);
	assert.deepEqual(parts[1]?.entities, [boldAt(0, 100)]);
});

test("overlapping entities are each clipped independently (gramio parity)", () => {
	const parts = splitText(
		{
			text: "a".repeat(300),
			entities: [boldAt(0, 100), { type: "italic", offset: 50, length: 150 }],
		},
		150,
	);

	assert.equal(parts.length, 2);
	assert.deepEqual(parts[0]?.entities, [
		boldAt(0, 100),
		{ type: "italic", offset: 50, length: 100 },
	]);
	assert.deepEqual(parts[1]?.entities, [{ type: "italic", offset: 0, length: 50 }]);
});

test("an entity that lives entirely in a later part just shifts", () => {
	const text = `${"a".repeat(90)}\n${"b".repeat(90)}`;
	const parts = splitText({ text, entities: [boldAt(95, 10)] }, 100);

	assert.equal(parts.length, 2);
	assert.deepEqual(parts[0]?.entities, []);
	assert.deepEqual(parts[1]?.entities, [boldAt(4, 10)]);
});

test("splits real format`` results, nesting included", () => {
	const long = format`${bold("a".repeat(150))} then ${italic("b".repeat(150))}`;
	const parts = splitText(long, 200);

	assert.ok(parts.length >= 2);
	const rebuilt = parts.map((p) => p.text).join(" ");
	assert.equal(rebuilt.replaceAll(" ", ""), long.text.replaceAll(" ", ""));
	assert.ok(parts[0]?.entities.some((e) => e.type === "bold"));
	assert.ok(parts.at(-1)?.entities.some((e) => e.type === "italic"));
});

test("splitCaption: first part fits the caption limit, the rest fit messages", () => {
	const text = "c".repeat(MAX_CAPTION_LENGTH + MAX_MESSAGE_LENGTH + 100);
	const parts = splitCaption(text);

	assert.equal(parts.length, 3);
	assert.equal(parts[0]?.text.length, MAX_CAPTION_LENGTH);
	assert.equal(parts[1]?.text.length, MAX_MESSAGE_LENGTH);
	assert.equal(parts[2]?.text.length, 100);
});

test("splitCaption: a short caption stays a single part; entities carry over the seam", () => {
	assert.deepEqual(splitCaption("short"), [{ text: "short", entities: [] }]);

	const parts = splitCaption(
		{ text: "a".repeat(150), entities: [boldAt(0, 150)] },
		{ captionMax: 100, max: 100 },
	);
	assert.deepEqual(parts, [
		{ text: "a".repeat(100), entities: [boldAt(0, 100)] },
		{ text: "a".repeat(50), entities: [boldAt(0, 50)] },
	]);
});

test("splitParts is lazy — pulling one part does not compute the rest", () => {
	const iterator = splitParts("a".repeat(1000), 100);
	const first = iterator.next();

	assert.equal(first.done, false);
	assert.equal(first.value?.text, "a".repeat(100));
});

// ─── splitSend ───────────────────────────────────────────────────────────────

test("splitSend delivers parts in order and reports part info", async () => {
	const seen: Array<{ text: string; index: number; first: boolean; last: boolean }> = [];
	const results = await splitSend(
		"a".repeat(250),
		(part, info) => {
			seen.push({ text: part.text, index: info.index, first: info.first, last: info.last });
			return info.index;
		},
		{ max: 100 },
	);

	assert.deepEqual(results, [0, 1, 2]);
	assert.deepEqual(
		seen.map((s) => [s.index, s.first, s.last]),
		[
			[0, true, false],
			[1, false, false],
			[2, false, true],
		],
	);
});

test("splitSend wraps a mid-chain failure into SplitSendError with the delivered results", async () => {
	const error = await splitSend(
		"a".repeat(250),
		(_part, info) => {
			if (info.index === 1) throw new Error("boom");
			return `ok ${info.index}`;
		},
		{ max: 100 },
	).then(
		() => assert.fail("expected a throw"),
		(e: unknown) => e,
	);

	assert.ok(error instanceof SplitSendError);
	assert.deepEqual(error.sent, ["ok 0"]);
	assert.equal(error.part, 1);
	assert.equal(error.parts, 3);
	assert.equal((error.cause as Error).message, "boom");
});

test("splitSend stops on an aborted signal and reports what went out", async () => {
	const controller = new AbortController();
	const error = await splitSend(
		"a".repeat(250),
		(_part, info) => {
			if (info.index === 0) controller.abort(new Error("enough"));
			return info.index;
		},
		{ max: 100, signal: controller.signal },
	).then(
		() => assert.fail("expected a throw"),
		(e: unknown) => e,
	);

	assert.ok(error instanceof SplitSendError);
	assert.deepEqual(error.sent, [0]);
	assert.equal(error.part, 1);
});

test("splitSend honors delayMs between parts", async () => {
	const results = await splitSend("a".repeat(250), (_part, info) => info.index, {
		max: 100,
		delayMs: 1,
	});
	assert.deepEqual(results, [0, 1, 2]);
});

// ─── the splitter() plugin ───────────────────────────────────────────────────

function boldAt(offset: number, length: number): { type: "bold"; offset: number; length: number } {
	return { type: "bold", offset, length };
}

test("sendLong sends every chunk as its own message, in order", async () => {
	const bot = new Composer<Context>().install(splitter(100)).on("message", async (ctx) => {
		const messages = await ctx.sendLong(`${"a".repeat(90)}\n${"b".repeat(90)}`);
		assert.equal(messages.length, 2);
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("go");
	const calls = env.callsTo("sendMessage");
	assert.deepEqual(
		calls.map((c) => c.params?.text),
		["a".repeat(90), "b".repeat(90)],
	);
});

test("sendLong splits format entities across messages", async () => {
	const bot = new Composer<Context>().install(splitter()).on("message", async (ctx) => {
		await ctx.sendLong(format`${bold("a".repeat(MAX_MESSAGE_LENGTH + 50))}`);
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("go");
	const calls = env.callsTo("sendMessage");
	assert.equal(calls.length, 2);
	assert.deepEqual(calls[0]?.params?.entities, [boldAt(0, MAX_MESSAGE_LENGTH)]);
	assert.deepEqual(calls[1]?.params?.entities, [boldAt(0, 50)]);
});

test("replyLong quotes the origin on the first part only; replyTo: 'all' quotes every part", async () => {
	for (const [replyTo, expected] of [
		["first", [true, false]],
		["all", [true, true]],
	] as const) {
		const bot = new Composer<Context>().install(splitter(100)).on("message", async (ctx) => {
			await ctx.replyLong(`${"a".repeat(90)}\n${"b".repeat(90)}`, {}, { replyTo });
		});
		const env = createTestEnv(bot);

		await env.createUser().sendMessage("go");
		assert.deepEqual(
			env.callsTo("sendMessage").map((c) => c.params?.reply_parameters !== undefined),
			expected,
			`replyTo: ${replyTo}`,
		);
	}
});

test("reply_markup lands on the last part by default; markup option moves it", async () => {
	const keyboard = { inline_keyboard: [[{ text: "ok", callback_data: "ok" }]] };

	for (const [markup, expected] of [
		[undefined, [false, true]],
		["first", [true, false]],
		["all", [true, true]],
	] as const) {
		const bot = new Composer<Context>().install(splitter(100)).on("message", async (ctx) => {
			await ctx.sendLong(
				`${"a".repeat(90)}\n${"b".repeat(90)}`,
				{ reply_markup: keyboard },
				markup ? { markup } : {},
			);
		});
		const env = createTestEnv(bot);

		await env.createUser().sendMessage("go");
		assert.deepEqual(
			env.callsTo("sendMessage").map((c) => c.params?.reply_markup !== undefined),
			expected,
			`markup: ${markup ?? "default"}`,
		);
	}
});

test("parse_mode with a multi-part text fails fast, before anything is sent", async () => {
	let caught: unknown;
	const bot = new Composer<Context>().install(splitter(100)).on("message", async (ctx) => {
		try {
			await ctx.sendLong("a".repeat(250), { parse_mode: "HTML" });
		} catch (error) {
			caught = error;
		}
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("go");
	assert.ok(caught instanceof TypeError);
	assert.match((caught as TypeError).message, /parse_mode/);
	assert.equal(env.callsTo("sendMessage").length, 0);
});

test("parse_mode is passed through untouched when the text fits one message", async () => {
	const bot = new Composer<Context>().install(splitter()).on("message", async (ctx) => {
		await ctx.sendLong("<b>fits</b>", { parse_mode: "HTML" });
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("go");
	assert.equal(env.lastApiCall("sendMessage")?.params?.parse_mode, "HTML");
});

test("whole-text extra.entities with a multi-part text fails fast", async () => {
	let caught: unknown;
	const bot = new Composer<Context>().install(splitter(100)).on("message", async (ctx) => {
		try {
			await ctx.sendLong("a".repeat(250), { entities: [boldAt(0, 250)] });
		} catch (error) {
			caught = error;
		}
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("go");
	assert.ok(caught instanceof TypeError);
	assert.equal(env.callsTo("sendMessage").length, 0);
});

test("sendPhotoLong sends the photo with the first part as caption, the rest as messages", async () => {
	const bot = new Composer<Context>().install(splitter()).on("message", async (ctx) => {
		await ctx.sendPhotoLong("file-id", format`${bold("c".repeat(MAX_CAPTION_LENGTH + 100))}`, {
			reply_markup: { inline_keyboard: [] },
		});
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("go");
	const photo = env.callsTo("sendPhoto");
	const texts = env.callsTo("sendMessage");

	assert.equal(photo.length, 1);
	assert.equal((photo[0]?.params?.caption as string).length, MAX_CAPTION_LENGTH);
	assert.deepEqual(photo[0]?.params?.caption_entities, [boldAt(0, MAX_CAPTION_LENGTH)]);
	assert.equal(photo[0]?.params?.reply_markup, undefined);

	assert.equal(texts.length, 1);
	assert.equal((texts[0]?.params?.text as string).length, 100);
	assert.deepEqual(texts[0]?.params?.entities, [boldAt(0, 100)]);
	assert.notEqual(texts[0]?.params?.reply_markup, undefined);
});

test("sendPhotoLong with an empty caption still sends the photo", async () => {
	const bot = new Composer<Context>().install(splitter()).on("message", async (ctx) => {
		const messages = await ctx.sendPhotoLong("file-id", "");
		assert.equal(messages.length, 1);
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("go");
	assert.equal(env.callsTo("sendPhoto").length, 1);
	assert.equal(env.callsTo("sendMessage").length, 0);
});

test("a mid-chain api error surfaces as SplitSendError carrying the delivered messages", async () => {
	let caught: unknown;
	const bot = new Composer<Context>().install(splitter(100)).on("message", async (ctx) => {
		try {
			await ctx.sendLong(`${"a".repeat(90)}\n${"b".repeat(90)}\n${"c".repeat(90)}`);
		} catch (error) {
			caught = error;
		}
	});
	const env = createTestEnv(bot);
	env.onApi("sendMessage", (_params: Record<string, unknown> | undefined, attempt: number) => {
		if (attempt === 2) throw new Error("network down");
		return { message_id: attempt };
	});

	await env.createUser().sendMessage("go");
	assert.ok(caught instanceof SplitSendError);
	const failure = caught as SplitSendError;
	assert.equal(failure.sent.length, 1);
	assert.equal(failure.part, 1);
	assert.equal(failure.parts, 3);
});
