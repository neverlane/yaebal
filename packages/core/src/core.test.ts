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

test("encodeRequest rejects nested media (fails loud, no garbage)", async () => {
	await assert.rejects(
		() => encodeRequest({ media: [{ type: "photo", media: media.path("./a.jpg") }] }),
		/nested MediaSource/,
	);
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
