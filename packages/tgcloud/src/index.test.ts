import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { Bot, media, TelegramError } from "@yaebal/core";
import { createSdkApi } from "./api.js";
import { bundleTgcloud } from "./bundle.js";
import { handlerTypes, updateFromHandler } from "./handlers.js";
import type { SdkBridge, TgcloudInputFile } from "./sdk.js";

class FakeInputFile {
	constructor(
		readonly bytes: Uint8Array,
		readonly filename: string,
	) {}
}

class FakeBotApiError extends Error {
	readonly code: number;
	readonly description: string;
	readonly parameters?: { retry_after?: number };
	constructor(code: number, description: string, parameters?: { retry_after?: number }) {
		super(description);
		this.code = code;
		this.description = description;
		this.parameters = parameters;
	}
}

function bridge(calls: { method: string; params: unknown }[]): SdkBridge {
	const api: SdkBridge["api"] = new Proxy({} as SdkBridge["api"], {
		get: (_target, prop) => {
			if (typeof prop !== "string") return undefined;
			if (prop === "getFileContent") {
				return async () => new Uint8Array([9]);
			}
			return async (params?: Record<string, unknown>) => {
				calls.push({ method: prop, params });
				return { message_id: calls.length, chat: { id: 1, type: "private" }, date: 0, text: "ok" };
			};
		},
	});
	return {
		api,
		InputFile: FakeInputFile as unknown as SdkBridge["InputFile"],
		isBotApiError: (error): error is FakeBotApiError => error instanceof FakeBotApiError,
	};
}

test("sdk api calls sdk.api and unwraps the result", { timeout: 5_000 }, async () => {
	const calls: { method: string; params: unknown }[] = [];
	const api = createSdkApi(bridge(calls));
	const sent = await api.sendMessage({ chat_id: 1, text: "hi" });
	assert.equal(calls[0]?.method, "sendMessage");
	assert.deepEqual(calls[0]?.params, { chat_id: 1, text: "hi" });
	assert.equal(sent.message_id, 1);
});

test("bot api errors become TelegramError and hooks still retry", async () => {
	let attempts = 0;
	const api = createSdkApi({
		api: new Proxy({} as SdkBridge["api"], {
			get: () => async () => {
				attempts++;
				if (attempts === 1) throw new FakeBotApiError(429, "Too Many Requests", { retry_after: 0 });
				return { ok: true };
			},
		}),
		InputFile: FakeInputFile as unknown as SdkBridge["InputFile"],
		isBotApiError: (error): error is FakeBotApiError => error instanceof FakeBotApiError,
	});
	api.onError(() => ({ retry: true, delayMs: 0 }));
	const result = await api.sendMessage({ chat_id: 1, text: "x" });
	assert.equal(attempts, 2);
	assert.deepEqual(result, { ok: true });
});

test("a bot api error with no retry hook rejects as TelegramError", async () => {
	const api = createSdkApi({
		api: new Proxy({} as SdkBridge["api"], {
			get: () => async () => {
				throw new FakeBotApiError(400, "Bad Request");
			},
		}),
		InputFile: FakeInputFile as unknown as SdkBridge["InputFile"],
		isBotApiError: (error): error is FakeBotApiError => error instanceof FakeBotApiError,
	});
	await assert.rejects(api.sendMessage({ chat_id: 1, text: "x" }), (error: unknown) => {
		assert.ok(error instanceof TelegramError);
		assert.equal(error.code, 400);
		return true;
	});
});

test("uploadable media becomes an InputFile, urls stay strings", async () => {
	const calls: { method: string; params: unknown }[] = [];
	const api = createSdkApi(bridge(calls));
	await api.sendPhoto({
		chat_id: 1,
		photo: media.buffer(new Uint8Array([1, 2, 3]), "a.jpg"),
		caption: "cap",
	});
	const params = calls[0]?.params as { photo: TgcloudInputFile; caption: string };
	assert.ok(params.photo instanceof FakeInputFile);
	assert.equal(params.photo.filename, "a.jpg");
	assert.deepEqual(params.photo.bytes, new Uint8Array([1, 2, 3]));
	assert.equal(params.caption, "cap");

	await api.sendPhoto({ chat_id: 1, photo: media.url("https://example.test/a.jpg") });
	assert.equal((calls[1]?.params as { photo: string }).photo, "https://example.test/a.jpg");
});

test("downloadFile reads bytes from sdk instead of a token url", async () => {
	const api = createSdkApi(bridge([]));
	const file = await api.downloadFile("abc");
	assert.deepEqual(file.bytes, new Uint8Array([9]));
	assert.throws(() => api.fileUrl("x"), /token/);
});

test("handlerTypes always includes message and keeps canonical order", () => {
	const bot = new Bot("123:test");
	bot.on("callback_query", () => {});
	bot.command("start", () => {});
	assert.deepEqual(handlerTypes(bot), ["message", "callback_query"]);
	assert.deepEqual(handlerTypes(bot, ["inline_query"]), [
		"message",
		"inline_query",
		"callback_query",
	]);
});

test("updateFromHandler prefers the raw update and synthesizes one otherwise", () => {
	const raw = { update_id: 7, message: { text: "hi" } };
	assert.equal(updateFromHandler("message", { text: "nope" }, { update: raw as never }), raw);
	assert.deepEqual(updateFromHandler("callback_query", { id: "1" }, undefined), {
		update_id: 0,
		callback_query: { id: "1" },
	});
});

test("bundle writes one sdk-only handler per update type", async () => {
	const root = await mkdtemp(join(tmpdir(), "yaebal-tgcloud-"));
	const result = await bundleTgcloud({
		input: new URL("./fixture.js", import.meta.url).pathname,
		root,
	});
	assert.deepEqual(result.handlers, ["handlers/message.js", "handlers/callback_query.js"]);
	const message = await readFile(join(root, "tgcloud/handlers/message.js"), "utf8");
	const callback = await readFile(join(root, "tgcloud/handlers/callback_query.js"), "utf8");
	assert.match(message, /import\("sdk"\)/);
	assert.doesNotMatch(message, /node_modules/);
	assert.notEqual(message, callback);

	const sent: { method: string; params: unknown }[] = [];
	await runWithSdk(
		() =>
			import(pathToFileURL(join(root, "tgcloud/handlers/message.js")).href) as Promise<{
				default: (payload: unknown, ctx?: unknown) => Promise<void>;
			}>,
		sent,
		{
			message_id: 1,
			chat: { id: 5, type: "private" },
			text: "/start",
			date: 0,
			from: user(),
		},
	);
	assert.equal(sent[0]?.method, "sendMessage");
	assert.equal((sent[0]?.params as { text: string }).text, "hello");
	assert.equal((sent[0]?.params as { chat_id: number }).chat_id, 5);
});

function user() {
	return { id: 5, is_bot: false, first_name: "A" };
}

async function runWithSdk(
	load: () => Promise<{ default: (payload: unknown, ctx?: unknown) => Promise<void> }>,
	sent: { method: string; params: unknown }[],
	payload: unknown,
) {
	const fake = {
		api: new Proxy(
			{},
			{
				get: (_target, prop) => async (params: unknown) => {
					sent.push({ method: String(prop), params });
					return { message_id: 1, chat: { id: 5, type: "private" }, date: 0, text: "ok" };
				},
			},
		),
		InputFile: FakeInputFile,
		BotApiError: FakeBotApiError,
	};
	const previous = globalThis as { sdk?: unknown };
	// the bundle imports the bare specifier `sdk`, which only tgcloud resolves.
	// tests register it for this one call through a custom hook installed below.
	registerSdk(fake);
	try {
		const mod = await load();
		await mod.default(payload, { update: { update_id: 1, message: payload } });
	} finally {
		registerSdk(undefined);
		void previous;
	}
}

function registerSdk(value: unknown) {
	(globalThis as { __yaebalTestSdk?: unknown }).__yaebalTestSdk = value;
}
