import assert from "node:assert/strict";
import test from "node:test";
import { field } from "@yaebal/callback-data";
import { bold, Composer, type Context, format } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";
import { apiError, buildUser, createTestEnv, createUpdate } from "@yaebal/test";
import { type PageQuery, type Pagination, pagination } from "./index.js";

const NUMBERS = Array.from({ length: 12 }, (_, i) => i);

const numberList = (overrides: Record<string, unknown> = {}) =>
	pagination<number>({
		id: "nums",
		pageSize: 5,
		source: () => NUMBERS,
		line: (n, i) => `${i}: ${n}`,
		...overrides,
	});

/** a bot with the list installed and a /list command that sends it. */
const setup = (list: Pagination<number> = numberList()) => {
	const bot = new Composer<Context>()
		.install(list.plugin())
		.command("list", (ctx) => list.send(ctx));
	const env = createTestEnv(bot);
	const user = env.createUser({ firstName: "u" });

	return { env, user, list };
};

const buttonTexts = (markup: unknown): string[] =>
	((markup as { inline_keyboard: { text: string }[][] }).inline_keyboard ?? [])
		.flat()
		.map((b) => b.text);

// ── rendering & navigation ────────────────────────────────────────────────────

test("send renders the first page with a next button only", async () => {
	const { env, user } = setup();
	await user.sendCommand("list");

	const sent = env.lastApiCall("sendMessage");
	assert.match(String(sent?.params?.text), /^page 1\/3/);
	assert.match(String(sent?.params?.text), /0: 0/);
	assert.match(String(sent?.params?.text), /4: 4/);
	assert.doesNotMatch(String(sent?.params?.text), /5: 5/);
	assert.deepEqual(buttonTexts(sent?.params?.reply_markup), ["▶"]);
});

test("pressing next edits the message in place and answers the query", async () => {
	const { env, user } = setup();
	await user.sendCommand("list");

	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);
	await user.on(bubble).clickByText("▶");

	const edit = env.lastApiCall("editMessageText");
	assert.match(String(edit?.params?.text), /^page 2\/3/);
	assert.match(String(edit?.params?.text), /5: 5/);
	assert.deepEqual(buttonTexts(edit?.params?.reply_markup), ["◀", "▶"]);
	assert.equal(edit?.params?.chat_id, bubble.chat.id);
	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("the last page shows a prev button only; prev walks back", async () => {
	const { env, user } = setup();
	await user.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	await user.on(bubble).clickByText("▶");
	await user.on(bubble).clickByText("▶");
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 3\/3/);
	assert.deepEqual(buttonTexts(env.lastApiCall("editMessageText")?.params?.reply_markup), ["◀"]);

	await user.on(bubble).clickByText("◀");
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 2\/3/);
});

test("custom header, empty text, and labels are honored", async () => {
	const list = pagination<number>({
		id: "custom",
		pageSize: 5,
		source: () => NUMBERS,
		line: (n) => `#${n}`,
		header: (info) => `items — ${info.page + 1} of ${info.pages}`,
		labels: { prev: "«", next: "»" },
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	const sent = env.lastApiCall("sendMessage");
	assert.match(String(sent?.params?.text), /^items — 1 of 3/);
	assert.deepEqual(buttonTexts(sent?.params?.reply_markup), ["»"]);
});

test("an empty source renders the empty text with no navigation", async () => {
	const list = pagination<number>({
		id: "none",
		source: () => [],
		line: (n) => `${n}`,
		empty: "the list is empty",
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	const sent = env.lastApiCall("sendMessage");
	assert.equal(sent?.params?.text, "the list is empty");
	assert.deepEqual(buttonTexts(sent?.params?.reply_markup), []);
});

// ── failure model ─────────────────────────────────────────────────────────────

test("a double-tap ('message is not modified') is swallowed and still answered", async () => {
	const { env, user } = setup();
	await user.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	env.onApi("editMessageText", apiError(400, "Bad Request: message is not modified"), {
		times: 1,
	});

	await user.on(bubble).clickByText("▶"); // must not throw
	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("an uneditable (48h-old) message falls back to sending the page fresh", async () => {
	const { env, user } = setup();
	await user.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);
	env.clearApiCalls();

	env.onApi("editMessageText", apiError(400, "Bad Request: message can't be edited"), {
		times: 1,
	});
	await user.on(bubble).clickByText("▶");

	const sent = env.lastApiCall("sendMessage");
	assert.match(String(sent?.params?.text), /^page 2\/3/);
	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("a failing answerCallbackQuery never masks a successful edit", async () => {
	const { env, user } = setup();
	await user.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	env.onApi("answerCallbackQuery", apiError(400, "Bad Request: query is too old"), { times: 1 });
	await user.on(bubble).clickByText("▶"); // must not throw

	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 2\/3/);
});

test("forged callback data (fractions, negatives, overshoot) clamps instead of crashing", async () => {
	const { env, user } = setup();
	await user.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	await user.on(bubble).click("pg_nums:1.5");
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 1\/3/);

	await user.on(bubble).click("pg_nums:-4");
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 1\/3/);

	await user.on(bubble).click("pg_nums:zz"); // page 1295 → clamped to the last page
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 3\/3/);
});

test("page text is clamped to 4096 chars and entities are clipped to the cut", async () => {
	const list = pagination<number>({
		id: "big",
		pageSize: 3,
		source: () => [0, 1, 2],
		line: (n) => format`${bold(`item ${n}`)} ${"x".repeat(2000)}`,
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	const sent = env.lastApiCall("sendMessage");
	const text = String(sent?.params?.text);
	assert.equal(text.length, 4096);
	assert.ok(text.endsWith("…"));

	const entities = sent?.params?.entities as { offset: number; length: number }[];
	assert.ok(entities.length > 0);
	for (const e of entities) assert.ok(e.offset + e.length <= 4095);
});

// ── lazy sources ──────────────────────────────────────────────────────────────

test("a lazy source without count probes limit+1 and never over-renders", async () => {
	const queries: { offset: number; limit: number }[] = [];
	const list = pagination<number>({
		id: "lazy",
		pageSize: 5,
		source: {
			fetch: ({ offset, limit }: PageQuery) => {
				queries.push({ offset, limit });
				return NUMBERS.slice(offset, offset + limit);
			},
		},
		line: (n, i) => `${i}: ${n}`,
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	// probe asked for one extra row to learn whether a next page exists
	assert.deepEqual(queries.at(-1), { offset: 0, limit: 6 });
	const sent = env.lastApiCall("sendMessage");
	assert.match(String(sent?.params?.text), /^page 1\n/); // total unknown → no "/M"
	assert.doesNotMatch(String(sent?.params?.text), /5: 5/); // the probe row is not rendered
	assert.deepEqual(buttonTexts(sent?.params?.reply_markup), ["▶"]);

	// walking to the last page reveals the real total
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);
	await user.on(bubble).clickByText("▶");
	await user.on(bubble).clickByText("▶");
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 3\/3/);
});

test("a stale button beyond the end of a shrunken lazy list retreats to the first page", async () => {
	let data = NUMBERS;
	const list = pagination<number>({
		id: "shrink",
		pageSize: 5,
		source: { fetch: ({ offset, limit }: PageQuery) => data.slice(offset, offset + limit) },
		line: (n, i) => `${i}: ${n}`,
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	data = [0, 1]; // the list shrank while the buttons were live
	await user.on(bubble).click("pg_shrink:2");

	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 1\/1/);
});

test("a lazy source with count fetches in parallel and clamps stale pages exactly", async () => {
	const queries: number[] = [];
	const list = pagination<number>({
		id: "counted",
		pageSize: 5,
		source: {
			fetch: ({ offset, limit }: PageQuery) => {
				queries.push(offset);
				return NUMBERS.slice(offset, offset + limit);
			},
			count: () => NUMBERS.length,
		},
		line: (n, i) => `${i}: ${n}`,
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	assert.match(String(env.lastApiCall("sendMessage")?.params?.text), /^page 1\/3/);
	// exactly pageSize rows were asked for — no probe row in count mode
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	await user.on(bubble).click("pg_counted:99"); // stale/forged → refetched at the real last page
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 3\/3/);
	assert.equal(queries.at(-1), 10);
});

// ── payload ───────────────────────────────────────────────────────────────────

test("a typed payload rides every button and comes back on navigation", async () => {
	const seen: unknown[] = [];
	const list = pagination({
		id: "cat",
		pageSize: 5,
		payload: { cat: Number, tag: field.string().default("all") },
		source: {
			fetch: ({ offset, limit, payload }) => {
				seen.push(payload);
				const cat: number = payload.cat; // payload is typed from the schema
				assert.equal(typeof cat, "number");
				return NUMBERS.slice(offset, offset + limit);
			},
		},
		line: (n: number, i: number) => `${i}: ${n}`,
		header: (info) => `cat ${info.payload.cat} — page ${info.page + 1}`,
	});

	const bot = new Composer<Context>()
		.install(list.plugin())
		.command("list", (ctx) => list.send(ctx, { payload: { cat: 7 } }));
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("list");
	assert.match(String(env.lastApiCall("sendMessage")?.params?.text), /^cat 7 — page 1/);
	// the default materialized without being passed explicitly
	assert.deepEqual(seen.at(-1), { cat: 7, tag: "all" });

	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);
	await user.on(bubble).clickByText("▶");

	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^cat 7 — page 2/);
	assert.deepEqual(seen.at(-1), { cat: 7, tag: "all" });
});

// ── items as buttons ──────────────────────────────────────────────────────────

test("item buttons render in columns and onSelect receives the id with its type intact", async () => {
	const picked: { id: string | number; page: number }[] = [];
	const products = [
		{ id: "sku-1", name: "tea" },
		{ id: "sku-2", name: "coffee" },
		{ id: 33, name: "water" },
		{ id: "sku-4", name: "juice" },
	];
	const list = pagination<(typeof products)[number]>({
		id: "shop",
		pageSize: 4,
		columns: 2,
		source: () => products,
		item: (p) => ({ label: p.name, id: p.id }),
		onSelect: (_ctx, sel) => {
			picked.push({ id: sel.id, page: sel.page });
		},
	});
	const { env, user } = setup(list as unknown as Pagination<number>);
	await user.sendCommand("list");

	const markup = env.lastApiCall("sendMessage")?.params?.reply_markup as {
		inline_keyboard: { text: string }[][];
	};
	assert.deepEqual(
		markup.inline_keyboard.map((row) => row.map((b) => b.text)),
		[
			["tea", "coffee"],
			["water", "juice"],
		],
	);

	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);
	await user.on(bubble).clickByText("coffee");
	await user.on(bubble).clickByText("water");

	assert.deepEqual(picked, [
		{ id: "sku-2", page: 0 },
		{ id: 33, page: 0 }, // the numeric id stayed a number
	]);
	assert.equal(env.callsTo("answerCallbackQuery").length, 2);
});

test("string items select by global index; raw buttons pass through verbatim", async () => {
	const picked: (string | number)[] = [];
	const list = pagination<number>({
		id: "mix",
		pageSize: 3,
		source: () => NUMBERS,
		item: (n) => (n === 1 ? { text: "docs", url: "https://example.com" } : `pick ${n}`),
		onSelect: (_ctx, sel) => {
			picked.push(sel.id);
		},
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	const markup = env.lastApiCall("sendMessage")?.params?.reply_markup as {
		inline_keyboard: { text: string; url?: string }[][];
	};
	const urlButton = markup.inline_keyboard.flat().find((b) => b.text === "docs");
	assert.equal(urlButton?.url, "https://example.com");

	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);
	await user.on(bubble).clickByText("pick 2");
	assert.deepEqual(picked, [2]); // global index as the id
});

test("item buttons without onSelect are still answered, so the spinner never hangs", async () => {
	const list = pagination<number>({
		id: "mute",
		pageSize: 3,
		source: () => NUMBERS,
		item: (n) => `item ${n}`,
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);
	env.clearApiCalls();
	await user.on(bubble).clickByText("item 0");

	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
	assert.equal(env.callsTo("editMessageText").length, 0);
});

// ── keyboard extras ───────────────────────────────────────────────────────────

test("counter and first/last buttons appear on middle pages; counter refreshes in place", async () => {
	const list = numberList({ pageSize: 3, counter: true, firstLast: true });
	const { env, user } = setup(list);
	await user.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	await user.on(bubble).clickByText("▶");
	assert.deepEqual(buttonTexts(env.lastApiCall("editMessageText")?.params?.reply_markup), [
		"⏮",
		"◀",
		"2/4",
		"▶",
		"⏭",
	]);

	// the counter packs the current page — pressing it re-renders (a refresh)
	env.onApi("editMessageText", apiError(400, "Bad Request: message is not modified"), {
		times: 1,
	});
	await user.on(bubble).clickByText("2/4"); // must not throw
	assert.equal(env.callsTo("answerCallbackQuery").length, 2);
});

test("the keyboard hook appends custom rows below the navigation", async () => {
	const list = numberList({
		keyboard: (kb: InlineKeyboard) => kb.row().text("✖ close", "close"),
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	assert.deepEqual(buttonTexts(env.lastApiCall("sendMessage")?.params?.reply_markup), [
		"▶",
		"✖ close",
	]);
});

test("filter gates presses from other users and answers with the denied toast", async () => {
	const list = numberList({
		filter: (ctx: Context) => ctx.from?.id === 1,
		denied: "not your list",
	});
	const bot = new Composer<Context>()
		.install(list.plugin())
		.command("list", (ctx) => list.send(ctx));
	const env = createTestEnv(bot);
	const owner = env.createUser({ id: 1 });
	const stranger = env.createUser({ id: 2 });

	await owner.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	env.clearApiCalls();
	await stranger.on(bubble).clickByText("▶");
	assert.equal(env.callsTo("editMessageText").length, 0);
	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "not your list");

	await owner.on(bubble).clickByText("▶");
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 2\/3/);
});

test("filter receives the button's payload, so ownership rides the buttons", async () => {
	const list = pagination({
		id: "own",
		source: () => NUMBERS,
		line: (n: number) => `${n}`,
		payload: { owner: Number },
		filter: (ctx, payload) => ctx.from?.id === payload.owner,
		denied: "not yours",
	});
	const bot = new Composer<Context>()
		.install(list.plugin())
		.command("list", (ctx) => list.send(ctx, { payload: { owner: ctx.from?.id ?? 0 } }));
	const env = createTestEnv(bot);
	const owner = env.createUser({ id: 7 });
	const stranger = env.createUser({ id: 8 });

	await owner.sendCommand("list");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);

	env.clearApiCalls();
	await stranger.on(bubble).clickByText("▶");
	assert.equal(env.callsTo("editMessageText").length, 0);
	assert.equal(env.lastApiCall("answerCallbackQuery")?.params?.text, "not yours");

	await owner.on(bubble).clickByText("▶");
	assert.match(String(env.lastApiCall("editMessageText")?.params?.text), /^page 2\/3/);
});

// ── fmt integration ───────────────────────────────────────────────────────────

test("format results in header and lines merge into one entity set with shifted offsets", async () => {
	const list = pagination<number>({
		id: "fmt",
		pageSize: 2,
		source: () => [10, 20],
		header: () => format`${bold("catalog")}`,
		line: (n) => format`price: ${bold(String(n))}`,
	});
	const { env, user } = setup(list);
	await user.sendCommand("list");

	const sent = env.lastApiCall("sendMessage");
	assert.equal(sent?.params?.text, "catalog\n\nprice: 10\nprice: 20");

	const entities = sent?.params?.entities as {
		type: string;
		offset: number;
		length: number;
	}[];
	assert.deepEqual(entities, [
		{ type: "bold", offset: 0, length: 7 },
		{ type: "bold", offset: 16, length: 2 },
		{ type: "bold", offset: 26, length: 2 },
	]);
});

// ── embedding: view(), edit(), button() ───────────────────────────────────────

test("view() returns the rendered page for embedding without sending", async () => {
	const list = numberList();
	const bot = new Composer<Context>().command("peek", async (ctx) => {
		const v = await list.view(ctx, 1);
		await ctx.send(`custom: ${v.text.split("\n")[0]} of ${v.pages} (${v.items.length} items)`);
	});
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("peek");
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "custom: page 2/3 of 3 (5 items)");
});

test("button() embeds a jump-to-list button into any keyboard", async () => {
	const list = numberList();
	const bot = new Composer<Context>().install(list.plugin()).command("menu", (ctx) =>
		ctx.send("menu", {
			reply_markup: new InlineKeyboard().text("open", "noop").add(list.button("list →", 1)),
		}),
	);
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("menu");
	const bubble = env.lastBotMessage({ withReplyMarkup: true });
	assert.ok(bubble);
	await user.on(bubble).clickByText("list →");

	// the menu message was edited into page 2 of the list
	const edit = env.lastApiCall("editMessageText");
	assert.equal(edit?.params?.message_id, bubble.message_id);
	assert.match(String(edit?.params?.text), /^page 2\/3/);
});

test("edit() re-renders into an explicit target and reports a no-op edit as true", async () => {
	const list = numberList();
	let result: unknown;
	const bot = new Composer<Context>().command("redraw", async (ctx) => {
		result = await list.edit(ctx, { page: 2, chatId: 77, messageId: 5 });
	});
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendCommand("redraw");
	const edit = env.lastApiCall("editMessageText");
	assert.equal(edit?.params?.chat_id, 77);
	assert.equal(edit?.params?.message_id, 5);
	assert.match(String(edit?.params?.text), /^page 3\/3/);
	assert.ok(result); // the edited Message stub

	env.onApi("editMessageText", apiError(400, "Bad Request: message is not modified"), {
		times: 1,
	});
	await user.sendCommand("redraw");
	assert.equal(result, true);
});

test("edit() without a target rejects with a clear error", async () => {
	const list = numberList();
	let error: unknown;
	const bot = new Composer<Context>().command("redraw", async (ctx) => {
		await list.edit(ctx).catch((e: unknown) => {
			error = e;
		});
	});
	const env = createTestEnv(bot);

	await env.createUser().sendCommand("redraw");
	assert.match(String(error), /no message to edit/);
});

// ── routing edge cases ────────────────────────────────────────────────────────

test("navigation on an inline-mode message edits via inline_message_id", async () => {
	const list = numberList();
	const bot = new Composer<Context>().install(list.plugin());
	const env = createTestEnv(bot);

	await env.dispatch(
		createUpdate({
			callback_query: {
				id: "cb-inline",
				chat_instance: "0",
				from: buildUser({ id: 1 }),
				inline_message_id: "IM-1",
				data: String(list.button("x", 1).callback_data),
			},
		}),
	);

	const edit = env.lastApiCall("editMessageText");
	assert.equal(edit?.params?.inline_message_id, "IM-1");
	assert.equal(edit?.params?.chat_id, undefined);
	assert.match(String(edit?.params?.text), /^page 2\/3/);
	assert.equal(env.callsTo("answerCallbackQuery").length, 1);
});

test("a business-chat edit routes through the business connection", async () => {
	const list = numberList();
	const bot = new Composer<Context>().install(list.plugin());
	const env = createTestEnv(bot);

	await env.dispatch(
		createUpdate({
			callback_query: {
				id: "cb-biz",
				chat_instance: "0",
				from: buildUser({ id: 1 }),
				message: {
					message_id: 100,
					date: 0,
					chat: { id: 1, type: "private" },
					business_connection_id: "bc1",
				},
				data: String(list.button("x", 1).callback_data),
			},
		}),
	);

	assert.equal(env.lastApiCall("editMessageText")?.params?.business_connection_id, "bc1");
});

// ── construction guards ───────────────────────────────────────────────────────

test("type-level contracts hold (checked at compile time)", () => {
	const ctx = null as unknown as Context;
	const withPayload = pagination({
		id: "t1",
		source: () => NUMBERS,
		line: (n) => `${n}`,
		payload: { cat: Number },
	});

	const calls = [
		// @ts-expect-error a schema with required fields makes the payload argument required
		() => withPayload.send(ctx),
		// @ts-expect-error the payload itself must carry the required fields
		() => withPayload.send(ctx, { payload: {} }),
		() => withPayload.send(ctx, { payload: { cat: 1 } }),
		() => numberList().send(ctx, 2),
		() => numberList().send(ctx, { page: 2 }),
		// @ts-expect-error unknown options are rejected
		() => numberList().send(ctx, { pge: 2 }),
	];
	assert.equal(calls.length, 6); // never invoked — these exist for the compiler
});

test("misconfiguration fails loudly at construction time", () => {
	const base = { source: () => NUMBERS, line: (n: number) => `${n}` };

	assert.throws(() => pagination({ ...base, id: "a:b" }), /must not contain/);
	assert.throws(() => pagination({ ...base, id: "" }), /must not be empty/);
	assert.throws(() => pagination({ ...base, id: "x", pageSize: 0 }), /positive integer/);
	assert.throws(() => pagination({ ...base, id: "x", columns: 1.5 }), /positive integer/);
	assert.throws(() => pagination({ id: "x", source: () => NUMBERS }), /line .* item/);
	assert.throws(() => pagination({ ...base, id: "x", payload: { $page: Number } }), /reserved/);
});
