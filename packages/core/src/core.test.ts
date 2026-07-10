import assert from "node:assert/strict";
import test from "node:test";
import type { InputFile } from "@yaebal/types";
import { createApi, encodeRequest, HttpError, TelegramError } from "./api.js";
import { Bot, type BotPlugin } from "./bot.js";
import { Composer } from "./composer.js";
import type { Context } from "./context.js";
import { bold, format } from "./format.js";
import { isMediaSource, media } from "./media.js";
import { webhookCallback } from "./webhook.js";

test("media helpers are branded and discriminated", () => {
	assert.ok(isMediaSource(media.fileId("AgAC")));
	assert.ok(isMediaSource(media.url("https://yaebal.mom/y.png")));
	assert.equal(isMediaSource({ kind: "fileId", fileId: "x" }), false); // unbranded
});

test("encodeRequest sends JSON when there is no upload", async () => {
	const r = await encodeRequest({ chat_id: 1, photo: media.fileId("AgAC") });

	assert.equal(r.contentType, "application/json");
	assert.deepEqual(JSON.parse(r.body as string), { chat_id: 1, photo: "AgAC" });
});

test("encodeRequest inlines a url media to its string", async () => {
	const r = await encodeRequest({ photo: media.url("https://yaebal.mom/p.png") });

	assert.deepEqual(JSON.parse(r.body as string), { photo: "https://yaebal.mom/p.png" });
});

test("encodeRequest builds multipart for a buffer upload", async () => {
	const r = await encodeRequest({
		chat_id: 7,
		photo: media.buffer(new Uint8Array([1, 2, 3]), "pic.png"),
		reply_markup: { inline_keyboard: [] },
	});
	assert.ok(r.body instanceof FormData);

	const form = r.body as FormData;

	assert.equal(form.get("photo"), "attach://_file0");
	assert.ok(form.get("_file0") instanceof Blob);
	assert.equal(form.get("chat_id"), "7"); // non-string serialized
	assert.equal(form.get("reply_markup"), '{"inline_keyboard":[]}'); // object → JSON
});

test("encodeRequest handles no params", async () => {
	const r = await encodeRequest(undefined);
	assert.equal(r.body, undefined);
});

test("encodeRequest handles nested media (sendMediaGroup) — uploads become attach://", async () => {
	const r = await encodeRequest({
		chat_id: 5,
		media: [
			{ type: "photo", media: media.buffer(new Uint8Array([1]), "a.png"), caption: "one" },
			{ type: "photo", media: media.fileId("AgAC") },
			{
				type: "video",
				media: media.url("https://yaebal.mom/v.mp4"),
				thumbnail: media.buffer(new Uint8Array([2]), "t.jpg"),
			},
		],
	});

	assert.ok(r.body instanceof FormData);
	const form = r.body as FormData;

	assert.deepEqual(JSON.parse(form.get("media") as string), [
		{ type: "photo", media: "attach://_file0", caption: "one" },
		{ type: "photo", media: "AgAC" },
		{ type: "video", media: "https://yaebal.mom/v.mp4", thumbnail: "attach://_file1" },
	]);
	assert.equal((form.get("_file0") as File).name, "a.png");
	assert.equal((form.get("_file1") as File).name, "t.jpg");
});

test("encodeRequest inlines nested url/fileId media without going multipart", async () => {
	const r = await encodeRequest({
		media: [
			{ type: "photo", media: media.fileId("AgAC") },
			{ type: "photo", media: media.url("https://yaebal.mom/p.png") },
		],
	});

	assert.equal(r.contentType, "application/json");
	assert.deepEqual(JSON.parse(r.body as string), {
		media: [
			{ type: "photo", media: "AgAC" },
			{ type: "photo", media: "https://yaebal.mom/p.png" },
		],
	});
});

test("encodeRequest media walk passes exotic objects through untouched", async () => {
	const bytes = new Uint8Array([1, 2, 3]);
	const r = await encodeRequest({ chat_id: 1, blob: { raw: bytes } });

	// a typed array inside params must survive the walk, not be flattened to indices
	assert.equal(r.contentType, "application/json");
	assert.deepEqual(JSON.parse(r.body as string), {
		chat_id: 1,
		blob: { raw: { "0": 1, "1": 2, "2": 3 } },
	});
});

test("encodeRequest uploads media.stream() (web stream and async iterable)", async () => {
	const web = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array([1, 2]));
			controller.enqueue(new Uint8Array([3]));
			controller.close();
		},
	});

	const r = await encodeRequest({ document: media.stream(web, "web.bin") });
	const form = r.body as FormData;
	const file = form.get("_file0") as File;

	assert.equal(form.get("document"), "attach://_file0");
	assert.equal(file.name, "web.bin");
	assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1, 2, 3]));

	async function* chunks() {
		yield new Uint8Array([9]);
		yield new Uint8Array([8, 7]);
	}

	const r2 = await encodeRequest({ document: media.stream(chunks()) });
	const file2 = (r2.body as FormData).get("_file0") as File;

	assert.equal(file2.name, "file");
	assert.deepEqual(new Uint8Array(await file2.arrayBuffer()), new Uint8Array([9, 8, 7]));
});

test("encodeRequest uploads media.text() as a named text file", async () => {
	const r = await encodeRequest({ document: media.text("hello", "notes.txt") });
	const form = r.body as FormData;
	const file = form.get("_file0") as File;

	assert.equal(form.get("document"), "attach://_file0");
	assert.equal(file.name, "notes.txt");
	assert.equal(await file.text(), "hello");

	const r2 = await encodeRequest({ document: media.text("x") });
	assert.equal(((r2.body as FormData).get("_file0") as File).name, "text.txt");
});

test("encodeRequest throws a helpful error for media.path() without a readFile (edge)", async () => {
	await assert.rejects(() => encodeRequest({ photo: media.path("./a.jpg") }), /needs a filesystem/);
});

test("createApi exposes Telegram response parameters on TelegramError", async () => {
	const previousFetch = globalThis.fetch;

	globalThis.fetch = async () =>
		new Response(
			JSON.stringify({
				ok: false,
				error_code: 429,
				description: "Too Many Requests",
				parameters: { retry_after: 7 },
			}),
			{ headers: { "content-type": "application/json" } },
		);

	try {
		const api = createApi("123:abc", { apiRoot: "https://example.invalid" });

		await assert.rejects(api.call("sendMessage", { chat_id: 1 }), (error: unknown) => {
			assert.ok(error instanceof TelegramError);
			assert.equal(error.method, "sendMessage");
			assert.equal(error.code, 429);
			assert.equal(error.description, "Too Many Requests");
			assert.deepEqual(error.parameters, { retry_after: 7 });
			return true;
		});
	} finally {
		globalThis.fetch = previousFetch;
	}
});

test("encodeRequest uses an injected readFile for media.path() (runtime-agnostic)", async () => {
	const readFile = async (p: string) => {
		assert.equal(p, "./pics/cat.jpg"); // path forwarded verbatim
		return new Uint8Array([9, 8, 7]);
	};

	const r = await encodeRequest({ chat_id: 1, photo: media.path("./pics/cat.jpg") }, readFile);
	const form = r.body as FormData;

	assert.ok(form.get("_file0") instanceof Blob);
	assert.equal(form.get("photo"), "attach://_file0");
	assert.equal((form.get("_file0") as File).name, "cat.jpg"); // pure-js basename
});

test("webhookCallback dispatches a POSTed update and guards method/secret", async () => {
	const seen: number[] = [];
	const sink = { handleUpdate: async (u: { update_id: number }) => void seen.push(u.update_id) };
	const handler = webhookCallback(sink as never, { secretToken: "s3cret" });
	const body = JSON.stringify({ update_id: 7, message: { text: "hi" } });

	const ok = await handler(
		new Request("http://x/hook", {
			method: "POST",
			headers: { "x-telegram-bot-api-secret-token": "s3cret" },
			body,
		}),
	);

	assert.equal(ok.status, 200);
	assert.deepEqual(seen, [7]);

	const wrongMethod = await handler(new Request("http://x/hook"));
	assert.equal(wrongMethod.status, 405);

	const wrongSecret = await handler(
		new Request("http://x/hook", {
			method: "POST",
			headers: { "x-telegram-bot-api-secret-token": "nope" },
			body,
		}),
	);
	assert.equal(wrongSecret.status, 401);
});

test("webhookCallback enforces the body cap while streaming (spoofed/absent content-length)", async () => {
	const seen: number[] = [];
	const sink = { handleUpdate: async (u: { update_id: number }) => void seen.push(u.update_id) };
	const handler = webhookCallback(sink as never, { maxBodyBytes: 1024 });

	// 8 KiB body streamed with NO content-length header — must still be refused.
	const big = JSON.stringify({ update_id: 1, junk: "x".repeat(8 * 1024) });
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(big));
			controller.close();
		},
	});
	const oversize = await handler(
		new Request("http://x/hook", { method: "POST", body: stream, duplex: "half" } as RequestInit),
	);
	assert.equal(oversize.status, 413);
	assert.deepEqual(seen, []);

	// spoofed tiny content-length can't sneak a big body past the streaming cap.
	const spoofed = await handler(
		new Request("http://x/hook", {
			method: "POST",
			headers: { "content-length": "5" },
			body: big,
		}),
	);
	assert.equal(spoofed.status, 413);
	assert.deepEqual(seen, []);
});

test("webhookCallback rejects non-update JSON with 400", async () => {
	const seen: unknown[] = [];
	const sink = { handleUpdate: async (u: unknown) => void seen.push(u) };
	const handler = webhookCallback(sink as never);

	for (const bad of ["42", '"hi"', "null", "{}", "[]"]) {
		const res = await handler(new Request("http://x/hook", { method: "POST", body: bad }));
		assert.equal(res.status, 400, `body ${bad} should be 400`);
	}
	assert.deepEqual(seen, []);
});

test("webhookCallback honours path + fallback (health checks)", async () => {
	const sink = { handleUpdate: async () => {} };
	const handler = webhookCallback(sink as never, {
		path: "/hook",
		fallback: (req) =>
			new Response(new URL(req.url).pathname === "/health" ? "up" : "?", { status: 200 }),
	});

	const health = await handler(new Request("http://x/health", { method: "GET" }));
	assert.equal(health.status, 200);
	assert.equal(await health.text(), "up");

	const ok = await handler(
		new Request("http://x/hook", { method: "POST", body: JSON.stringify({ update_id: 1 }) }),
	);
	assert.equal(ok.status, 200);
});

test("webhookCallback error policy: fail → 500, ack → 200", async () => {
	const boom = {
		handleUpdate: async () =>
			void (() => {
				throw new Error("boom");
			})(),
	};
	const body = JSON.stringify({ update_id: 1 });

	const fail = webhookCallback(boom as never, { onError: "fail" });
	assert.equal((await fail(new Request("http://x/", { method: "POST", body }))).status, 500);

	const ack = webhookCallback(boom as never, { onError: "ack" });
	assert.equal((await ack(new Request("http://x/", { method: "POST", body }))).status, 200);
});

test("webhookCallback timeout policy acks a slow update and lets it finish via waitUntil", async () => {
	let finished = false;
	const slow = {
		handleUpdate: async () => {
			await new Promise((r) => setTimeout(r, 30));
			finished = true;
		},
	};
	const handler = webhookCallback(slow as never, { timeoutMs: 5 });

	const kept: Promise<unknown>[] = [];
	const res = await handler(
		new Request("http://x/", { method: "POST", body: JSON.stringify({ update_id: 1 }) }),
		{ waitUntil: (p) => kept.push(p) },
	);

	assert.equal(res.status, 200); // acked immediately
	assert.equal(finished, false);
	await Promise.all(kept);
	assert.equal(finished, true); // background work survived via waitUntil
});

test("webhookCallback answers with the claimed api call when reply is enabled", async () => {
	// botInfo skips init()'s getMe, so any fetch below is a leaked (unclaimed) reply.
	const bot = new Bot("123:abc", {
		botInfo: { id: 1, is_bot: true, first_name: "b" },
	}).on("message", (ctx) => ctx.api.call("sendMessage", { chat_id: 1, text: "hi" }));
	let networkCalls = 0;
	const realFetch = globalThis.fetch;
	// if the reply weren't claimed, the real client would try to fetch — count that.
	globalThis.fetch = (async () => {
		networkCalls++;
		return new Response(JSON.stringify({ ok: true, result: true }));
	}) as typeof fetch;

	try {
		const handler = webhookCallback(bot, { reply: true });
		const res = await handler(
			new Request("http://x/", {
				method: "POST",
				body: JSON.stringify({
					update_id: 1,
					message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "yo" },
				}),
			}),
		);

		assert.equal(res.headers.get("content-type"), "application/json");
		assert.deepEqual(await res.json(), { method: "sendMessage", chat_id: 1, text: "hi" });
		assert.equal(networkCalls, 0); // the call rode the response, not the network
	} finally {
		globalThis.fetch = realFetch;
	}
});

test("Bot.init() resolves getMe once and fills ctx.me under webhooks (/cmd@botname addressing)", async () => {
	const bot = new Bot("123:abc");
	let getMeCalls = 0;
	(bot.api as unknown as { getMe: () => Promise<unknown> }).getMe = async () => {
		getMeCalls++;
		return { id: 42, is_bot: true, first_name: "T", username: "realbot" };
	};

	let firedFor = "";
	let meUsername: string | undefined;
	bot.command("start", (ctx) => {
		firedFor = ctx.command;
		meUsername = ctx.me?.username;
	});

	const handler = webhookCallback(bot);
	const send = (text: string) => {
		const commandLength = (text.split(" ")[0] ?? text).length;
		return handler(
			new Request("http://x/", {
				method: "POST",
				body: JSON.stringify({
					update_id: Math.floor(Math.random() * 1e9),
					message: {
						message_id: 1,
						date: 0,
						chat: { id: 1, type: "group" },
						text,
						entities: [{ type: "bot_command", offset: 0, length: commandLength }],
					},
				}),
			}),
		);
	};

	await send("/start@realbot");
	assert.equal(firedFor, "start");
	assert.equal(meUsername, "realbot");

	// addressed to a different bot — must NOT fire now that ctx.me is known.
	firedFor = "";
	await send("/start@otherbot");
	assert.equal(firedFor, "");

	assert.equal(getMeCalls, 1); // init cached across updates
});

test("Bot.handleUpdate runs the middleware chain (webhook entry)", async () => {
	let seen = "";
	const bot = new Bot("123:abc").on("message:text", (ctx) => {
		seen = ctx.text;
	});

	await bot.handleUpdate({
		update_id: 1,
		message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "hi" },
	} as never);
	assert.equal(seen, "hi");
});

test("callbackQuery(callbackData) exposes typed queryData and skips on a failed unpack", async () => {
	// structural matcher — core routes on `unpack` without importing the plugin
	const matcher = {
		pattern: /^x(?::|$)/,
		unpack: (raw: string) => (raw === "x:ok" ? { v: 42 } : undefined),
	};

	const seen: { v: number }[] = [];
	let fellThrough = false;
	const bot = new Bot("123:abc")
		.callbackQuery(matcher, (ctx) => {
			seen.push(ctx.queryData);
		})
		.on("callback_query", () => {
			fellThrough = true;
		});

	const cbUpdate = (id: number, data: string) =>
		bot.handleUpdate({
			update_id: id,
			callback_query: {
				id: String(id),
				from: { id: 1, is_bot: false, first_name: "a" },
				data,
				chat_instance: "c",
			},
		} as never);

	await cbUpdate(1, "x:ok");
	assert.deepEqual(seen, [{ v: 42 }]);
	assert.equal(fellThrough, false); // handled — no fall-through

	await cbUpdate(2, "nope"); // unpack → undefined
	assert.deepEqual(seen, [{ v: 42 }]); // handler was skipped
	assert.equal(fellThrough, true); // fell through to on("callback_query")
});

test("Context routes business updates through the connection", async () => {
	const calls: { m: string; p: unknown }[] = [];
	const api = {
		call: (m: string, p: unknown) => {
			calls.push({ m, p });
			return Promise.resolve({});
		},
		sendMessage: (p: unknown) => {
			calls.push({ m: "sendMessage", p });
			return Promise.resolve({});
		},
	} as never;

	const { Context } = await import("./context.js");
	const ctx = new Context({
		api,
		updateType: "business_message",
		update: {
			update_id: 1,
			business_message: {
				message_id: 5,
				date: 0,
				chat: { id: 42, type: "private" },
				business_connection_id: "bc1",
				text: "hi",
			},
		} as never,
	});

	// business_message is visible through the message getter (chat/text/reply work)
	assert.equal(ctx.text, "hi");
	assert.equal(ctx.businessConnectionId, "bc1");

	await ctx.reply("yo");
	assert.deepEqual(calls[0], {
		m: "sendMessage",
		p: {
			chat_id: 42,
			business_connection_id: "bc1",
			reply_parameters: { message_id: 5 },
			text: "yo",
		},
	});

	// plain messages keep the exact same params shape as before (no undefined keys)
	calls.length = 0;
	const plain = new Context({
		api,
		updateType: "message",
		update: {
			update_id: 2,
			message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "hi" },
		} as never,
	});
	await plain.send("hello");
	assert.deepEqual(calls[0], { m: "sendMessage", p: { chat_id: 1, text: "hello" } });
});

test("Bot.install accepts bot plugins and keeps enriched context", async () => {
	let seen = "";
	const stamp: BotPlugin<Context, { stamp: string }> = (bot) => bot.decorate({ stamp: "ok" });

	const bot = new Bot("123:abc").install(stamp).on("message:text", (ctx) => {
		seen = ctx.stamp;
	});

	await bot.handleUpdate({
		update_id: 1,
		message: { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "hi" },
	} as never);

	assert.equal(seen, "ok");
});

test("Bot.onStop handlers run once per stop cycle", async () => {
	let stopped = 0;
	const bot = new Bot("123:abc").onStop(() => {
		stopped++;
	});

	await bot.stop();
	await bot.stop();

	assert.equal(stopped, 1);
});

test("Api before hooks run for every retry attempt", async () => {
	const previousFetch = globalThis.fetch;
	let attempts = 0;

	globalThis.fetch = async () => {
		attempts++;
		if (attempts === 1) {
			return new Response(
				JSON.stringify({ ok: false, error_code: 502, description: "Bad Gateway" }),
				{
					headers: { "content-type": "application/json" },
				},
			);
		}

		return new Response(JSON.stringify({ ok: true, result: true }), {
			headers: { "content-type": "application/json" },
		});
	};

	try {
		const api = createApi("123:abc", { apiRoot: "https://example.invalid" });
		let beforeRuns = 0;

		api.before((method, params) => ({ ...params, marker: ++beforeRuns, method }));
		api.onError((_method, _error, attempt) => (attempt === 1 ? { retry: true } : undefined));

		assert.equal(await api.call("sendMessage", { chat_id: 1 }), true);
		assert.equal(beforeRuns, 2);
	} finally {
		globalThis.fetch = previousFetch;
	}
});

test("api proxy is not thenable and ignores symbols — `await api` is safe", async () => {
	const api = createApi("123:abc");

	assert.equal((api as unknown as { then?: unknown }).then, undefined);
	assert.equal((api as unknown as Record<symbol, unknown>)[Symbol.iterator], undefined);

	// adopting the api object in the promise machinery must not fire a request or hang
	const resolved = await Promise.resolve(api);
	assert.equal(resolved, api);
});

test("non-JSON reply (proxy 502 page) surfaces an HttpError with method + status", async () => {
	const previousFetch = globalThis.fetch;
	globalThis.fetch = async () =>
		new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" });

	try {
		const api = createApi("123:abc", { apiRoot: "https://example.invalid" });

		await assert.rejects(api.call("sendMessage", { chat_id: 1 }), (error: unknown) => {
			assert.ok(error instanceof HttpError);
			assert.equal(error.method, "sendMessage");
			assert.equal(error.status, 502);
			return true;
		});
	} finally {
		globalThis.fetch = previousFetch;
	}
});

test("encodeRequest does not mutate the caller's params", async () => {
	const pending = Promise.resolve("ok");
	const params: Record<string, unknown> = { chat_id: 1, pending };

	const r = await encodeRequest(params);

	assert.equal(params.pending, pending); // caller's object untouched
	assert.deepEqual(JSON.parse(r.body as string), { chat_id: 1, pending: "ok" });
});

test("stop() aborts the in-flight long poll so start() resolves promptly", async () => {
	const previousFetch = globalThis.fetch;

	globalThis.fetch = (async (url: unknown, init?: { signal?: AbortSignal }) => {
		if (String(url).endsWith("/getMe")) {
			return new Response(
				JSON.stringify({
					ok: true,
					result: { id: 1, is_bot: true, first_name: "b", username: "mybot" },
				}),
			);
		}

		// getUpdates long poll: hang until the signal aborts
		return new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
		});
	}) as typeof fetch;

	try {
		const bot = new Bot("123:abc");
		const started = bot.start();

		await new Promise((r) => setTimeout(r, 50)); // let getMe + the first poll begin

		const t0 = Date.now();
		await bot.stop();
		await started;
		assert.ok(Date.now() - t0 < 1000, "start() must not wait out the 30s poll timeout");
	} finally {
		globalThis.fetch = previousFetch;
	}
});

test("Context.send/reply accept the params-object form without losing fields", async () => {
	const calls: unknown[] = [];
	const api = {
		call: (_method: string, p: unknown) => {
			calls.push(p);
			return Promise.resolve({});
		},
	} as never;

	const { Context } = await import("./context.js");
	const ctx = new Context({
		api,
		updateType: "message",
		update: {
			update_id: 1,
			message: { message_id: 5, date: 0, chat: { id: 42, type: "private" }, text: "hi" },
		} as never,
	});

	await ctx.send({ text: "yo", reply_markup: { inline_keyboard: [] } });
	assert.deepEqual(calls[0], {
		chat_id: 42,
		text: "yo",
		reply_markup: { inline_keyboard: [] },
	});

	// reply object form: default reply_parameters stays unless overridden
	calls.length = 0;
	await ctx.reply({ text: "yo", reply_markup: { inline_keyboard: [] } });
	assert.deepEqual(calls[0], {
		chat_id: 42,
		reply_parameters: { message_id: 5 },
		text: "yo",
		reply_markup: { inline_keyboard: [] },
	});

	// a pure format result is still the text form, not params
	const { format, bold } = await import("./format.js");
	calls.length = 0;
	await ctx.send(format`hey ${bold("you")}`);
	assert.deepEqual(calls[0], {
		chat_id: 42,
		text: "hey you",
		entities: [{ type: "bold", offset: 4, length: 3 }],
	});
});

test("typed api.* is wired (BotApiMethods) and format results flow through", async () => {
	const previousFetch = globalThis.fetch;
	let sent: Record<string, unknown> | undefined;

	globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
		sent = JSON.parse(init?.body ?? "{}");
		return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
	}) as typeof fetch;

	try {
		const api = createApi("123:abc", { apiRoot: "https://example.invalid" });

		// fully typed params + return (Message), format result accepted where the schema allows it
		const msg = await api.sendMessage({ chat_id: 1, text: format`hey ${bold("you")}` });
		assert.equal(msg.message_id, 1);
		assert.equal(sent?.text, "hey you"); // applyFormatFields split it on the wire
		assert.deepEqual(sent?.entities, [{ type: "bold", offset: 4, length: 3 }]);
	} finally {
		globalThis.fetch = previousFetch;
	}
});

test("MediaSource satisfies the generated InputFile type", () => {
	// compile-time proof: the branded media builders flow into typed InputFile params
	const url: InputFile = media.url("https://yaebal.mom/y.png");
	const buf: InputFile = media.buffer(new Uint8Array([1]), "a.bin");

	// @ts-expect-error junk objects no longer typecheck as InputFile
	const junk: InputFile = new Date();

	void url;
	void buf;
	void junk;
});

test("guard: type-guard predicate narrows the chain, boolean predicate still gates", async () => {
	interface Tagged {
		tag: number;
	}

	let seen: number | undefined;
	const composer = new Composer()
		.guard((ctx): ctx is Context & Tagged => {
			Object.assign(ctx as object, { tag: 7 });
			return true;
		})
		.use((ctx, next) => {
			seen = ctx.tag; // typed as number — the narrowing flows down the chain
			return next();
		});

	const { Context } = await import("./context.js");
	const ctx = new Context({
		api: null as never,
		updateType: "message",
		update: {
			update_id: 1,
			message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
		} as never,
	});

	await (composer as unknown as Composer).toMiddleware()(ctx, async () => {});
	assert.equal(seen, 7);
});

test("install rejects a plugin that returns a different composer (silent detach)", () => {
	const composer = new Composer();
	assert.throws(() => composer.install((() => new Composer()) as never), /must chain on/);

	const bot = new Bot("123:abc");
	assert.throws(() => bot.install((() => new Composer()) as never), /must chain on/);
});

test("onPollingError intercepts getUpdates failures and polling retries", async () => {
	const previousFetch = globalThis.fetch;
	let polls = 0;

	globalThis.fetch = (async (url: unknown, init?: { signal?: AbortSignal }) => {
		if (String(url).endsWith("/getMe")) {
			return new Response(
				JSON.stringify({
					ok: true,
					result: { id: 1, is_bot: true, first_name: "b", username: "mybot" },
				}),
			);
		}

		polls++;
		if (polls === 1) throw new TypeError("boom"); // first poll: network failure

		// later polls hang until aborted by stop()
		return new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
		});
	}) as typeof fetch;

	try {
		const errors: unknown[] = [];
		const bot = new Bot("123:abc").onPollingError((error) => {
			errors.push(error);
		});

		const started = bot.start();

		// the failure surfaces via the handler almost immediately
		for (let i = 0; i < 100 && errors.length === 0; i++) {
			await new Promise((r) => setTimeout(r, 20));
		}

		assert.equal(errors.length, 1);
		assert.match(String(errors[0]), /boom/);

		await bot.stop();
		await started; // resolves after the retry pause; polling never wedged
	} finally {
		globalThis.fetch = previousFetch;
	}
});
