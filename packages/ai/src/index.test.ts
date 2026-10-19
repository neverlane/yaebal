import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { apiError, createTestEnv } from "@yaebal/test";
import {
	AiLimitError,
	type AiMessage,
	type AiStreamResult,
	ai,
	anthropicModel,
	collectStream,
	createMemory,
	createRateLimiter,
	customModel,
	openaiCompatible,
	parseRate,
	resolveModel,
} from "./index.js";
import { sseData } from "./sse.js";

const TIMEOUT = { timeout: 10_000 };

function chunked(...pieces: string[]) {
	return customModel(async function* () {
		yield* pieces;
	});
}

function fakeCtx(chatId = 1, userId = 2): Context {
	return { chat: { id: chatId, type: "private" }, from: { id: userId } } as unknown as Context;
}

// --- pure units -------------------------------------------------------------------------

test("parseRate: parses and rejects", () => {
	assert.deepEqual(parseRate("20/h"), { count: 20, windowMs: 3_600_000 });
	assert.deepEqual(parseRate("1/s"), { count: 1, windowMs: 1_000 });
	assert.throws(() => parseRate("0/h" as never));
	assert.throws(() => parseRate("nope" as never));
});

test("rate limiter: sliding window frees up", () => {
	let at = 0;
	const limiter = createRateLimiter("2/m", () => at);
	limiter.take(1);
	limiter.take(1);
	assert.throws(() => limiter.take(1), AiLimitError);
	limiter.take(2); // other users unaffected
	at = 61_000;
	limiter.take(1); // window slid
});

test("sseData: splits events, joins multi-line data", async () => {
	const body = new Blob(['data: {"a":1}\n\ndata: line1\ndata: line2\n\ndata: [DONE]\n\n']).stream();
	const events: string[] = [];
	for await (const data of sseData(body)) events.push(data);
	assert.deepEqual(events, ['{"a":1}', "line1\nline2", "[DONE]"]);
});

test("memory: windowed append and clear", async () => {
	const memory = createMemory({ window: 3 });
	const ctx = fakeCtx();
	await memory.append(ctx, [
		{ role: "user", content: "1" },
		{ role: "assistant", content: "2" },
		{ role: "user", content: "3" },
		{ role: "assistant", content: "4" },
	]);
	assert.deepEqual(
		(await memory.load(ctx)).map((m) => m.content),
		["2", "3", "4"],
	);
	// separate users in the same chat do not share a thread
	assert.deepEqual(await memory.load(fakeCtx(1, 99)), []);
	await memory.clear(ctx);
	assert.deepEqual(await memory.load(ctx), []);
});

test("resolveModel: passes AiModel through, detects ai sdk models", () => {
	const model = chunked("x");
	assert.equal(resolveModel(model), model);
	assert.equal(resolveModel({ specificationVersion: "v2", modelId: "gpt" }).id, "ai-sdk:gpt");
	assert.throws(() => resolveModel({} as never));
});

// --- fetch adapters ---------------------------------------------------------------------

test("openaiCompatible: streams deltas and generates", TIMEOUT, async () => {
	const requests: { url: string; body: Record<string, unknown> }[] = [];
	const sse = [
		'data: {"choices":[{"delta":{"content":"he"}}]}',
		"",
		'data: {"choices":[{"delta":{"content":"llo"}}]}',
		"",
		"data: [DONE]",
		"",
	].join("\n");
	const fetchFn: typeof fetch = async (url, init) => {
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
		requests.push({ url: String(url), body });
		return body.stream === true
			? new Response(sse, { status: 200 })
			: Response.json({
					choices: [{ message: { content: "hello" } }],
					usage: { prompt_tokens: 3, completion_tokens: 5 },
				});
	};

	const model = openaiCompatible({ model: "gpt-test", apiKey: "k", fetch: fetchFn });
	const streamed = await collectStream(model, { messages: [{ role: "user", content: "hi" }] });
	assert.equal(streamed.text, "hello");

	const reply = await model.generate?.({ messages: [{ role: "user", content: "hi" }] });
	assert.equal(reply?.text, "hello");
	assert.deepEqual(reply?.usage, { inputTokens: 3, outputTokens: 5 });
	assert.equal(requests[0]?.url, "https://api.openai.com/v1/chat/completions");
});

test("anthropicModel: system extracted, deltas streamed", TIMEOUT, async () => {
	let sent: Record<string, unknown> = {};
	const sse = [
		'data: {"type":"message_start"}',
		"",
		'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"привет"}}',
		"",
		'data: {"type":"message_stop"}',
		"",
	].join("\n");
	const fetchFn: typeof fetch = async (_url, init) => {
		sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
		return new Response(sse, { status: 200 });
	};

	const model = anthropicModel({ model: "claude-test", apiKey: "k", fetch: fetchFn });
	const reply = await collectStream(model, {
		messages: [
			{ role: "system", content: "be nice" },
			{ role: "user", content: "hi" },
		],
	});
	assert.equal(reply.text, "привет");
	assert.equal(sent.system, "be nice");
	assert.deepEqual(sent.messages, [{ role: "user", content: "hi" }]);
	assert.equal(sent.max_tokens, 4096);
});

// --- the plugin, actor-driven ------------------------------------------------------------

function aiBot(options: Parameters<typeof ai>[0]) {
	let result: AiStreamResult | undefined;
	const bot = new Composer<Context>().install(ai(options)).on("message:text", async (ctx) => {
		result = await ctx.ai.replyStream(ctx.text);
	});
	return { bot, result: () => result };
}

test("replyStream in private: thinking draft, ticks, final sendMessage", TIMEOUT, async () => {
	let at = 0;
	const { bot, result } = aiBot({
		model: chunked("hello ", "world"),
		memory: false,
		streaming: { now: () => (at += 600) },
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	const drafts = env.callsTo("sendMessageDraft");
	assert.equal(drafts[0]?.params?.text, ""); // native "Thinking…" placeholder
	assert.deepEqual(
		drafts.slice(1).map((c) => c.params?.text),
		["hello ", "hello world"],
	);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "hello world");
	assert.equal(result()?.mode, "draft");
	assert.equal(result()?.text, "hello world");
	assert.equal(result()?.aborted, false);
});

test("replyStream in a group: cursor previews via edits, clean finalization", TIMEOUT, async () => {
	let at = 0;
	const { bot, result } = aiBot({
		model: chunked("hello ", "world"),
		memory: false,
		streaming: { now: () => (at += 2000) },
	});
	const env = createTestEnv(bot);
	const group = env.createChat({ type: "supergroup", title: "girls" });

	await env.createUser().in(group).sendMessage("hi");

	assert.equal(env.callsTo("sendMessageDraft").length, 0);
	assert.ok(env.callsTo("sendChatAction").length >= 1); // covers pre-first-token silence
	const sends = env.callsTo("sendMessage");
	assert.equal(sends[0]?.params?.text, "hello ▍");
	const edits = env.callsTo("editMessageText");
	assert.equal(edits.at(-1)?.params?.text, "hello world");
	assert.equal(result()?.mode, "edit");
});

test("replyStream: long answers finalize part-by-part via split", TIMEOUT, async () => {
	const { bot, result } = aiBot({
		model: chunked("aaaa bbbb ", "cccc dddd ", "eeee"),
		memory: false,
		streaming: { maxLength: 12 },
	});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	const texts = env.callsTo("sendMessage").map((c) => c.params?.text);
	assert.deepEqual(texts, ["aaaa bbbb", "cccc dddd", "eeee"]);
	assert.equal(result()?.messages.length, 3);
});

test("parseMode: rejected entities fall back to plain text", TIMEOUT, async () => {
	const { bot } = aiBot({
		model: chunked("**broken"),
		memory: false,
		parseMode: "MarkdownV2",
	});
	const env = createTestEnv(bot);
	env.onApi("sendMessage", apiError(400, "Bad Request: can't parse entities: something"), {
		times: 1,
	});

	await env.createUser().sendMessage("hi");

	const sends = env.callsTo("sendMessage");
	assert.equal(sends.length, 2);
	assert.equal(sends[0]?.params?.parse_mode, "MarkdownV2");
	assert.equal(sends[1]?.params?.parse_mode, undefined);
	assert.equal(sends[1]?.params?.text, "**broken");
});

test("memory: history accumulates across turns, reset forgets", TIMEOUT, async () => {
	const seen: AiMessage[][] = [];
	const model = customModel(async function* (request) {
		seen.push(request.messages);
		yield `answer ${seen.length}`;
	});

	let history: AiMessage[] = [];
	const bot = new Composer<Context>()
		.install(ai({ model, system: "be brief" }))
		.command("reset", async (ctx) => {
			await ctx.ai.reset();
			history = await ctx.ai.history();
		})
		.on("message:text", async (ctx) => {
			await ctx.ai.replyStream(ctx.text);
			history = await ctx.ai.history();
		});
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendMessage("one");
	assert.deepEqual(
		seen[0]?.map((m) => m.role),
		["system", "user"],
	);
	assert.equal(history.length, 2); // user + assistant

	await user.sendMessage("two");
	assert.deepEqual(
		seen[1]?.map((m) => `${m.role}:${m.content}`),
		["system:be brief", "user:one", "assistant:answer 1", "user:two"],
	);
	assert.equal(history.length, 4);

	await user.sendCommand("reset");
	assert.equal(history.length, 0);
});

test("limits: second call throws AiLimitError with retryAfterMs", TIMEOUT, async () => {
	let caught: AiLimitError | undefined;
	const bot = new Composer<Context>()
		.install(ai({ model: chunked("ok"), memory: false, limits: { perUser: "1/h" } }))
		.on("message:text", async (ctx) => {
			try {
				await ctx.ai.replyStream(ctx.text);
			} catch (error) {
				caught = error as AiLimitError;
				await ctx.send("slow down");
			}
		});
	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendMessage("one");
	assert.equal(typeof caught, "undefined");

	await user.sendMessage("two");
	assert.equal(caught?.name, "AiLimitError");
	assert.ok((caught?.retryAfterMs ?? 0) > 0);
	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "slow down");
});

test("reply(): typing action kept alive, long text split across messages", TIMEOUT, async () => {
	const bot = new Composer<Context>()
		.install(ai({ model: chunked("aaaa bbbb cccc"), memory: false, streaming: { maxLength: 9 } }))
		.on("message:text", async (ctx) => {
			const { text, messages } = await ctx.ai.reply(ctx.text);
			assert.equal(text, "aaaa bbbb cccc");
			assert.equal(messages.length, 2);
		});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	assert.ok(env.callsTo("sendChatAction").length >= 1);
	assert.deepEqual(
		env.callsTo("sendMessage").map((c) => c.params?.text),
		["aaaa bbbb", "cccc"],
	);
});

test("generate(): returns text without sending anything", TIMEOUT, async () => {
	const bot = new Composer<Context>()
		.install(ai({ model: chunked("just text"), memory: false }))
		.on("message:text", async (ctx) => {
			const reply = await ctx.ai.generate(ctx.text);
			assert.equal(reply.text, "just text");
		});
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	assert.equal(env.callsTo("sendMessage").length, 0);
	assert.equal(env.callsTo("sendMessageDraft").length, 0);
});

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

for (const keepOnStop of [false, true]) {
	test(
		`native stop cancels an idle provider and ${keepOnStop ? "preserves" : "discards"} partial output`,
		TIMEOUT,
		async () => {
			const idle = deferred();
			const release = deferred();
			let signal: AbortSignal | undefined;
			const closed = deferred();
			const model = customModel(async function* (request) {
				signal = request.signal;
				try {
					yield "partial";
					idle.resolve();
					await release.promise;
					yield "late";
				} finally {
					closed.resolve();
				}
			});
			let result!: AiStreamResult;
			let history: AiMessage[] = [];
			const bot = new Composer<Context>()
				.install(ai({ model, streaming: { canStop: true, keepOnStop } }))
				.command("history", async (ctx) => {
					history = await ctx.ai.history();
				})
				.on("message:text", async (ctx) => {
					result = await ctx.ai.replyStream(ctx.text);
				});
			const env = createTestEnv(bot);
			const user = env.createUser({ id: 7 });
			const running = user.sendMessage("hello");
			try {
				await idle.promise;
				const params = env.lastApiCall("sendMessageDraft")?.params;
				assert.equal(params?.can_stop, true);
				assert.equal(params?.keep_on_stop, keepOnStop);
				const draftId = Number(params?.draft_id);
				const stop = (chatId: number, id: number, thread?: number) =>
					env.dispatch({
						update_id: 900,
						stopped_message_generation: {
							chat: { id: chatId, type: "private" },
							draft_id: id,
							...(thread === undefined ? {} : { message_thread_id: thread }),
						},
					});
				await stop(8, draftId);
				await stop(7, draftId + 1);
				await stop(7, draftId, 99);
				assert.equal(signal?.aborted, false);
				await stop(7, draftId);
				await running;
				assert.equal(signal?.aborted, true);
				assert.equal(result.stopped, true);
				assert.equal(result.aborted, true);
				assert.equal(result.text, "partial");
				assert.deepEqual(
					env.callsTo("sendMessage").map((call) => call.params?.text),
					keepOnStop ? ["partial"] : [],
				);
				await user.sendCommand("history");
				assert.deepEqual(
					history.map((turn) => turn.content),
					keepOnStop ? ["hello", "partial"] : [],
				);
			} finally {
				release.resolve();
				await running;
			}
			await Promise.resolve();
			await closed.promise;
		},
	);
}

test(
	"per-call stop options override defaults and stop follows the new draft after splitting",
	TIMEOUT,
	async () => {
		const idle = deferred();
		const release = deferred();
		let result!: AiStreamResult;
		const model = customModel(async function* () {
			yield "aaaa bbbb";
			idle.resolve();
			await release.promise;
		});
		const bot = new Composer<Context>()
			.install(ai({ model, memory: false, streaming: { canStop: false, maxLength: 5 } }))
			.on("message:text", async (ctx) => {
				result = await ctx.ai.replyStream(ctx.text, { canStop: true, keepOnStop: true });
			});
		const env = createTestEnv(bot);
		const running = env.createUser({ id: 7 }).sendMessage("hello");
		try {
			await idle.promise;
			const drafts = env.callsTo("sendMessageDraft");
			const first = Number(drafts[0]?.params?.draft_id);
			const current = Number(drafts.at(-1)?.params?.draft_id);
			assert.notEqual(first, current);
			await env.dispatch({
				update_id: 10,
				stopped_message_generation: { chat: { id: 7, type: "private" }, draft_id: first },
			});
			await env.dispatch({
				update_id: 11,
				stopped_message_generation: { chat: { id: 7, type: "private" }, draft_id: current },
			});
			await running;
			assert.equal(result.stopped, true);
			assert.deepEqual(
				env.callsTo("sendMessage").map((call) => call.params?.text),
				["aaaa", "bbbb"],
			);
		} finally {
			release.resolve();
			await running;
		}
	},
);

test(
	"provider abort errors return the partial result while unrelated provider failures propagate",
	TIMEOUT,
	async () => {
		const abort = new AbortController();
		const model = customModel(async function* () {
			yield "partial";
			abort.abort();
			throw abort.signal.reason;
		});
		let result!: AiStreamResult;
		const bot = new Composer<Context>()
			.install(ai({ model, memory: false }))
			.on("message:text", async (ctx) => {
				result = await ctx.ai.replyStream(ctx.text, { signal: abort.signal });
			});
		const env = createTestEnv(bot);
		await env.createUser().sendMessage("hello");
		assert.equal(result.aborted, true);
		assert.equal(result.stopped, false);
		assert.equal(env.lastApiCall("sendMessage")?.params?.text, "partial");
		const failure = new Error("provider failed");
		const broken = aiBot({
			model: customModel(async function* () {
				yield "before failure";
				throw failure;
			}),
			memory: false,
		});
		await assert.rejects(
			() => createTestEnv(broken.bot).createUser().sendMessage("hi"),
			(error) => error === failure,
		);
	},
);

test("an already aborted request never starts generation or sends a draft", TIMEOUT, async () => {
	const abort = new AbortController();
	abort.abort();
	let starts = 0;
	const bot = new Composer<Context>()
		.install(
			ai({
				model: customModel(async function* () {
					starts++;
					yield "unexpected";
				}),
				memory: false,
			}),
		)
		.on("message:text", (ctx) => ctx.ai.replyStream(ctx.text, { signal: abort.signal }));
	const env = createTestEnv(bot);
	await env.createUser().sendMessage("hello");
	assert.equal(starts, 0);
	assert.equal(env.apiCalls.length, 0);
});

test(
	"replyStream with rich: rich drafts, a thinking placeholder, a final rich message",
	TIMEOUT,
	async () => {
		let at = 0;
		const { bot, result } = aiBot({
			model: chunked("# hi\n", "**there**"),
			memory: false,
			rich: true,
			streaming: { now: () => (at += 600) },
		});
		const env = createTestEnv(bot);

		await env.createUser().sendMessage("hi");

		assert.equal(env.callsTo("sendMessageDraft").length, 0);
		const drafts = env.callsTo("sendRichMessageDraft");
		assert.deepEqual(drafts[0]?.params?.rich_message, {
			markdown: "<tg-thinking>Thinking…</tg-thinking>",
		});
		assert.deepEqual(drafts.at(-1)?.params?.rich_message, { markdown: "# hi\n**there**" });
		assert.deepEqual(env.lastApiCall("sendRichMessage")?.params?.rich_message, {
			markdown: "# hi\n**there**",
		});
		assert.equal(env.callsTo("sendMessage").length, 0);
		assert.equal(result()?.messages.length, 1);
	},
);

test(
	"replyStream with rich in a group: rich preview, rich final edit, reported message",
	TIMEOUT,
	async () => {
		let at = 0;
		const { bot, result } = aiBot({
			model: chunked("hello ", "world"),
			memory: false,
			rich: "html",
			streaming: { now: () => (at += 2000) },
		});
		const env = createTestEnv(bot);
		const group = env.createChat({ type: "supergroup", title: "girls" });

		await env.createUser().in(group).sendMessage("hi");

		assert.deepEqual(env.callsTo("sendRichMessage")[0]?.params?.rich_message, { html: "hello ▍" });
		const edits = env.callsTo("editMessageText");
		assert.deepEqual(edits.at(-1)?.params?.rich_message, { html: "hello world" });
		assert.equal(edits.at(-1)?.params?.text, undefined);
		assert.equal(result()?.messages.length, 1, "the finalized preview is a real message");
	},
);

test("plain replyStream in a group reports the finalized message too", TIMEOUT, async () => {
	let at = 0;
	const parts: unknown[] = [];
	const bot = new Composer<Context>()
		.install(
			ai({
				model: chunked("hello ", "world"),
				memory: false,
				streaming: { now: () => (at += 2000) },
			}),
		)
		.on("message:text", async (ctx) => {
			const res = await ctx.ai.replyStream(ctx.text, { onPart: (m) => parts.push(m) });
			parts.push(res.messages.length);
		});
	const env = createTestEnv(bot);
	const group = env.createChat({ type: "supergroup", title: "girls" });

	await env.createUser().in(group).sendMessage("hi");

	assert.equal(parts.length, 2, "onPart fired for the finalized preview");
	assert.equal(parts[1], 1);
});

test("rich markup telegram rejects is resent as plain text", TIMEOUT, async () => {
	const { bot, result } = aiBot({ model: chunked("<broken"), memory: false, rich: true });
	const env = createTestEnv(bot);
	env.onApi("sendRichMessage", apiError(400, "Bad Request: can't parse rich message"));

	await env.createUser().sendMessage("hi");

	assert.equal(env.lastApiCall("sendMessage")?.params?.text, "<broken");
	assert.equal(result()?.messages.length, 1);
});

test("reply() with rich sends one rich message", TIMEOUT, async () => {
	const bot = new Composer<Context>()
		.install(ai({ model: chunked("a ", "b"), memory: false, rich: true, typing: false }))
		.on("message:text", (ctx) => ctx.ai.reply(ctx.text));
	const env = createTestEnv(bot);

	await env.createUser().sendMessage("hi");

	assert.deepEqual(env.lastApiCall("sendRichMessage")?.params?.rich_message, { markdown: "a b" });
	assert.equal(env.callsTo("sendMessage").length, 0);
});
