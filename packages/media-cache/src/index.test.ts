import assert from "node:assert/strict";
import test from "node:test";
import { type Api, type Context, createApi, media } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/session";
import { withFetch } from "@yaebal/test";
import { type MediaCacheEvent, mediaCache } from "./index.js";

interface SeenCall {
	method: string;
	upload: boolean;
	json?: Record<string, unknown>;
	form?: FormData;
}

/** the full Bot API envelope a scripted request should answer with. */
type Responder = (call: SeenCall, n: number) => unknown;

/**
 * a real `createApi` client over a scripted fetch — hook order, params cloning, the retry
 * loop and request encoding are the genuine core code paths, not re-implementations.
 */
async function withScriptedApi(
	respond: Responder,
	fn: (api: Api, calls: SeenCall[]) => Promise<void>,
): Promise<void> {
	const calls: SeenCall[] = [];
	const api = createApi("TEST", { readFile: async () => new Uint8Array([7, 7, 7]) });

	const handler = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const body = init?.body;
		const call: SeenCall = {
			method: String(input).split("/").at(-1) ?? "",
			upload: body instanceof FormData,
			json: typeof body === "string" ? JSON.parse(body) : undefined,
			form: body instanceof FormData ? body : undefined,
		};
		calls.push(call);

		return new Response(JSON.stringify(respond(call, calls.length)));
	}) as typeof fetch;

	await withFetch(handler, () => fn(api, calls));
}

const ok = (result: unknown) => ({ ok: true, result });
const staleFileId = () => ({
	ok: false,
	error_code: 400,
	description: "Bad Request: wrong file identifier/HTTP URL specified",
});

const photoMessage = (fileId: string) => ({
	message_id: 1,
	photo: [{ file_id: `${fileId}-small` }, { file_id: fileId }],
});

const fakeCtx = (api: Api): Context =>
	({ api, chat: { id: 42 }, routing: () => ({}) }) as unknown as Context;

test("attach: first send uploads, later sends reuse the cached file_id", async () => {
	await withScriptedApi(
		() => ok(photoMessage("BIG")),
		async (api, calls) => {
			mediaCache().attach(api);

			await api.call("sendPhoto", { chat_id: 1, photo: media.path("./logo.png") });
			// same file through a non-normalized spelling — still one cache entry
			await api.call("sendPhoto", { chat_id: 1, photo: media.path("logo.png"), caption: "hi" });

			assert.equal(calls[0]?.upload, true);
			assert.equal(calls[1]?.upload, false);
			assert.equal(calls[1]?.json?.photo, "BIG");
			assert.equal(calls[1]?.json?.caption, "hi"); // the rest of the params pass through
		},
	);
});

test("attach: buffers cache by content hash, not identity", async () => {
	let n = 0;

	await withScriptedApi(
		() => ok(photoMessage(`ID${++n}`)),
		async (api, calls) => {
			mediaCache().attach(api);

			await api.call("sendPhoto", { chat_id: 1, photo: media.buffer(new Uint8Array([1, 2, 3])) });
			await api.call("sendPhoto", { chat_id: 1, photo: media.buffer(new Uint8Array([1, 2, 3])) });
			await api.call("sendPhoto", { chat_id: 1, photo: media.buffer(new Uint8Array([9, 9, 9])) });

			assert.equal(calls[1]?.upload, false);
			assert.equal(calls[1]?.json?.photo, "ID1"); // same bytes, fresh Uint8Array → hit
			assert.equal(calls[2]?.upload, true); // different bytes → its own upload
		},
	);
});

test("attach: inline text caches by content hash", async () => {
	await withScriptedApi(
		() => ok({ message_id: 1, document: { file_id: "DOC" } }),
		async (api, calls) => {
			mediaCache().attach(api);

			await api.call("sendDocument", { chat_id: 1, document: media.text("hello", "a.txt") });
			await api.call("sendDocument", { chat_id: 1, document: media.text("hello", "a.txt") });

			assert.equal(calls[1]?.upload, false);
			assert.equal(calls[1]?.json?.document, "DOC");
		},
	);
});

test("attach: streams are single-shot and pass through uncached", async () => {
	const chunks = async function* () {
		yield new Uint8Array([1]);
	};

	await withScriptedApi(
		() => ok(photoMessage("S")),
		async (api, calls) => {
			mediaCache().attach(api);

			await api.call("sendPhoto", { chat_id: 1, photo: media.stream(chunks()) });
			await api.call("sendPhoto", { chat_id: 1, photo: media.stream(chunks()) });

			assert.equal(calls[0]?.upload, true);
			assert.equal(calls[1]?.upload, true);
		},
	);
});

test("attach: sendMediaGroup caches every item independently", async () => {
	const groupResult = [photoMessage("P"), { message_id: 2, video: { file_id: "V" } }];

	await withScriptedApi(
		() => ok(groupResult),
		async (api, calls) => {
			mediaCache().attach(api);

			const params = () => ({
				chat_id: 1,
				media: [
					{ type: "photo", media: media.path("a.png"), caption: "first" },
					{ type: "video", media: media.path("b.mp4") },
				],
			});

			await api.call("sendMediaGroup", params());
			await api.call("sendMediaGroup", params());

			assert.equal(calls[0]?.upload, true);
			assert.equal(calls[1]?.upload, false);

			const items = calls[1]?.json?.media as { media: string; caption?: string }[];
			assert.equal(items[0]?.media, "P");
			assert.equal(items[0]?.caption, "first");
			assert.equal(items[1]?.media, "V");
		},
	);
});

test("attach: editMessageMedia stores fresh uploads and hits the cache", async () => {
	await withScriptedApi(
		() => ok(photoMessage("E")),
		async (api, calls) => {
			mediaCache().attach(api);

			const params = () => ({
				chat_id: 1,
				message_id: 5,
				media: { type: "photo", media: media.path("e.png") },
			});

			await api.call("editMessageMedia", params());
			await api.call("editMessageMedia", params());

			assert.equal(calls[0]?.upload, true);
			assert.equal(calls[1]?.upload, false);
			assert.equal((calls[1]?.json?.media as { media: string }).media, "E");
		},
	);
});

test("attach: a rejected cached file_id is evicted and the source re-uploaded", async () => {
	const storage = new MemoryStorage<string>();
	const events: MediaCacheEvent[] = [];

	await withScriptedApi(
		(_call, n) => (n === 1 ? staleFileId() : ok(photoMessage("FRESH"))),
		async (api, calls) => {
			const cache = mediaCache({ storage, onEvent: (e) => void events.push(e) });
			cache.attach(api);

			const key = await cache.keyFor(media.path("logo.png"));
			assert(key);
			await storage.set(key, "STALE"); // e.g. leftover from another bot's run

			const result = await api.call<{ message_id: number }>("sendPhoto", {
				chat_id: 1,
				photo: media.path("logo.png"),
			});

			assert.equal(result.message_id, 1); // the caller never saw the failure
			assert.equal(calls.length, 2);
			assert.equal(calls[0]?.json?.photo, "STALE");
			assert.equal(calls[1]?.upload, true); // retried with the original source
			assert.equal(storage.get(key), "FRESH");
			assert.deepEqual(
				events.map((e) => e.type),
				["hit", "evict", "store"],
			);
			assert.deepEqual(events[1], { type: "evict", key, reason: "rejected", method: "sendPhoto" });
		},
	);
});

test("attach: a failing fresh upload stores nothing and never loops", async () => {
	const storage = new MemoryStorage<string>();

	await withScriptedApi(
		() => staleFileId(),
		async (api, calls) => {
			const cache = mediaCache({ storage });
			cache.attach(api);

			await assert.rejects(
				() => api.call("sendPhoto", { chat_id: 1, photo: media.path("logo.png") }),
				/wrong file identifier/,
			);

			assert.equal(calls.length, 1); // nothing was substituted → nothing to heal → no retry
			const key = await cache.keyFor(media.path("logo.png"));
			assert(key);
			assert.equal(storage.get(key), undefined);
		},
	);
});

test("attach: bookkeeping survives later hooks that clone params", async () => {
	await withScriptedApi(
		() => ok(photoMessage("BIG")),
		async (api, calls) => {
			mediaCache().attach(api);
			api.before((_method, params) => (params ? { ...params } : params));

			await api.call("sendPhoto", { chat_id: 1, photo: media.path("logo.png") });
			await api.call("sendPhoto", { chat_id: 1, photo: media.path("logo.png") });

			assert.equal(calls[1]?.upload, false); // the clone didn't lose the pending store
			assert.equal(calls[1]?.json?.photo, "BIG");
		},
	);
});

test("attach is idempotent — attaching twice registers one set of hooks", async () => {
	const events: MediaCacheEvent[] = [];

	await withScriptedApi(
		() => ok(photoMessage("BIG")),
		async (api) => {
			const cache = mediaCache({ onEvent: (e) => void events.push(e) });
			cache.attach(api);
			cache.attach(api);

			await api.call("sendPhoto", { chat_id: 1, photo: media.path("logo.png") });
			await api.call("sendPhoto", { chat_id: 1, photo: media.path("logo.png") });

			assert.deepEqual(
				events.map((e) => e.type),
				["store", "hit"],
			);
		},
	);
});

test("manual: explicit keys upload once and reuse the file_id", async () => {
	await withScriptedApi(
		() => ok(photoMessage("BIG")),
		async (api, calls) => {
			const cache = mediaCache();
			const ctx = fakeCtx(api);

			await cache.photo(ctx, "logo", media.path("./logo.png"), { caption: "v1" });
			await cache.photo(ctx, "logo", media.url("https://cdn.example/logo.png"));

			assert.equal(calls[0]?.upload, true);
			assert.equal(calls[0]?.form?.get("caption"), "v1");
			// second send: different source, same key → still a hit
			assert.equal(calls[1]?.json?.photo, "BIG");
			assert.equal(calls[1]?.json?.chat_id, 42);
		},
	);
});

test("manual: distinct keys cache independently", async () => {
	await withScriptedApi(
		() => ok({ message_id: 1, document: { file_id: "DOC" } }),
		async (api, calls) => {
			const cache = mediaCache();
			const ctx = fakeCtx(api);

			await cache.document(ctx, "report-a", media.path("a.pdf"));
			await cache.document(ctx, "report-b", media.path("b.pdf"));

			assert.equal(calls[0]?.upload, true);
			assert.equal(calls[1]?.upload, true);
		},
	);
});

test("manual: a stale file_id under an explicit key falls back to a fresh upload", async () => {
	const storage = new MemoryStorage<string>();

	await withScriptedApi(
		(_call, n) => (n === 1 ? staleFileId() : ok(photoMessage("FRESH"))),
		async (api, calls) => {
			const cache = mediaCache({ storage });
			const ctx = fakeCtx(api);

			const key = await cache.keyFor("logo");
			await storage.set(key ?? "", "STALE");

			const result = await cache.photo(ctx, "logo", media.path("logo.png"));

			assert.equal(result.message_id, 1);
			assert.equal(calls[0]?.json?.photo, "STALE");
			assert.equal(calls[1]?.upload, true);
			assert.equal(storage.get(key ?? ""), "FRESH");
		},
	);
});

test("scope namespaces every key", async () => {
	const cache = mediaCache({ scope: "bot42" });

	assert.equal(await cache.keyFor(media.url("https://x/y.png")), "bot42:url:https://x/y.png");
	assert.equal(await cache.keyFor("poster"), "bot42:key:poster");
});

test("keyFor: streams and file_ids are not cacheable", async () => {
	const cache = mediaCache();
	const chunks = async function* () {
		yield new Uint8Array([1]);
	};

	assert.equal(await cache.keyFor(media.stream(chunks())), undefined);
	assert.equal(await cache.keyFor(media.fileId("AgAC")), undefined);
});

test("invalidate forgets a source so the next send re-uploads", async () => {
	const events: MediaCacheEvent[] = [];

	await withScriptedApi(
		() => ok(photoMessage("BIG")),
		async (api, calls) => {
			const cache = mediaCache({ onEvent: (e) => void events.push(e) });
			cache.attach(api);

			await api.call("sendPhoto", { chat_id: 1, photo: media.path("logo.png") });
			await cache.invalidate(media.path("logo.png"));
			await api.call("sendPhoto", { chat_id: 1, photo: media.path("logo.png") });

			assert.equal(calls[1]?.upload, true);
			assert.equal(events[1]?.type, "evict");
			assert.equal(events[1]?.type === "evict" && events[1].reason, "invalidated");
		},
	);
});
