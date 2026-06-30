import assert from "node:assert/strict";
import test from "node:test";
import { encodeRequest } from "./api.js";
import { Bot, type BotPlugin } from "./bot.js";
import type { Context } from "./context.js";
import { isMediaSource, media } from "./media.js";
import { webhookCallback } from "./webhook.js";

test("media helpers are branded and discriminated", () => {
	assert.ok(isMediaSource(media.fileId("AgAC")));
	assert.ok(isMediaSource(media.url("https://yaeb.al/y.png")));
	assert.equal(isMediaSource({ kind: "fileId", fileId: "x" }), false); // unbranded
});

test("encodeRequest sends JSON when there is no upload", async () => {
	const r = await encodeRequest({ chat_id: 1, photo: media.fileId("AgAC") });

	assert.equal(r.contentType, "application/json");
	assert.deepEqual(JSON.parse(r.body as string), { chat_id: 1, photo: "AgAC" });
});

test("encodeRequest inlines a url media to its string", async () => {
	const r = await encodeRequest({ photo: media.url("https://yaeb.al/p.png") });

	assert.deepEqual(JSON.parse(r.body as string), { photo: "https://yaeb.al/p.png" });
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
