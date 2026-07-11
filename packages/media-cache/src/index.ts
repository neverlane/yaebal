import {
	type Api,
	type BotPlugin,
	type Context,
	isMediaSource,
	type MediaSource,
	type Message,
	media,
	TelegramError,
} from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/sklad";

/** a cache observation — wire it to metrics/logging via {@link MediaCacheOptions.onEvent}. */
export type MediaCacheEvent =
	| { type: "hit"; method: string; key: string; fileId: string }
	| { type: "store"; method: string; key: string; fileId: string }
	| { type: "evict"; key: string; reason: "invalidated" | "rejected"; method?: string };

export interface MediaCacheOptions {
	/**
	 * where `key → file_id` lives. defaults to in-memory (`MemoryStorage`, lost on restart).
	 * keys are stored flat with no plugin prefix, so don't share one store instance with
	 * another plugin unless you give each a distinct {@link MediaCacheOptions.scope} —
	 * otherwise their keys can collide.
	 */
	storage?: StorageAdapter<string>;
	/**
	 * key namespace, e.g. the bot's id. a `file_id` is only valid for the bot that uploaded
	 * it — set this whenever several bots share one persistent storage.
	 */
	scope?: string;
	/** observe hits / stores / evictions (metrics, logging). awaited before the send continues. */
	onEvent?: (event: MediaCacheEvent) => unknown | Promise<unknown>;
}

/**
 * manual-mode sender: sends to the update's chat (with the context's business/topic routing)
 * under an explicit cache key, so the key survives the file moving to another path or URL.
 */
export type CachedSend = (
	ctx: Context,
	key: string,
	source: MediaSource | string,
	extra?: Record<string, unknown>,
) => Promise<Message>;

export interface MediaCache {
	photo: CachedSend;
	document: CachedSend;
	audio: CachedSend;
	video: CachedSend;
	animation: CachedSend;
	voice: CachedSend;
	videoNote: CachedSend;
	sticker: CachedSend;
	/**
	 * transparent mode: intercept every media send on this api client. cached sources are
	 * swapped to their `file_id` before the request; fresh uploads are remembered from the
	 * response; a `file_id` telegram rejects is evicted and the original source retried.
	 */
	attach(api: Api): void;
	/** installable form of {@link MediaCache.attach}: `bot.install(cache.plugin())`. */
	plugin(): BotPlugin;
	/** forget one cached `file_id` — by source, or by manual-mode key. */
	invalidate(source: MediaSource | string): Promise<void>;
	/**
	 * the storage key a source caches under (scoped). `undefined` for sources that can't be
	 * cached — streams (single-shot) and `file_id`s (already the cached form).
	 */
	keyFor(source: MediaSource | string): Promise<string | undefined>;
}

/** send methods with one top-level media param, and the result field carrying its file_id. */
const SEND_METHODS: Record<string, { param: string; field: string }> = {
	sendPhoto: { param: "photo", field: "photo" },
	sendDocument: { param: "document", field: "document" },
	sendAudio: { param: "audio", field: "audio" },
	sendVideo: { param: "video", field: "video" },
	sendAnimation: { param: "animation", field: "animation" },
	sendVoice: { param: "voice", field: "voice" },
	sendVideoNote: { param: "video_note", field: "video_note" },
	sendSticker: { param: "sticker", field: "sticker" },
};

/** InputMedia `type` → the Message field its file_id comes back in. */
const INPUT_MEDIA_FIELDS: Record<string, string> = {
	photo: "photo",
	video: "video",
	audio: "audio",
	document: "document",
	animation: "animation",
};

/** telegram's ways of saying "that file_id is no good" (other bot's id, wiped storage, typo). */
const STALE_FILE_ID = /wrong (?:remote )?file identifier|wrong file_id|invalid file_id/i;

function isStaleFileIdError(error: unknown): boolean {
	return (
		error instanceof TelegramError && error.code === 400 && STALE_FILE_ID.test(error.description)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** photo-family results are arrays of sizes (largest last); the rest carry a single object. */
function fileIdAt(value: unknown): string | undefined {
	const node = Array.isArray(value) ? value.at(-1) : value;
	return isRecord(node) && typeof node.file_id === "string" ? node.file_id : undefined;
}

const pickField =
	(field: string) =>
	(result: unknown): string | undefined =>
		isRecord(result) ? fileIdAt(result[field]) : undefined;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	// copy into a fresh ArrayBuffer — webcrypto rejects shared/offset-backed views
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const named = (filename: string | undefined) => (filename ? `:${filename}` : "");

/**
 * the cache key for a source. paths and urls key by location — zero extra I/O on a hit.
 * buffers and inline text key by content hash: they're already in memory, hashing costs
 * far less than the upload it saves, and a content change simply becomes a new key.
 * streams are single-shot (hashing would drain them) and file_ids are already the cached
 * form — both are uncacheable.
 */
async function computeKey(source: MediaSource): Promise<string | undefined> {
	switch (source.kind) {
		case "path":
			return `path:${source.path.replace(/^(?:\.\/)+/, "")}`;
		case "url":
			return `url:${source.url}`;
		case "buffer":
			return `sha256:${await sha256Hex(source.buffer)}${named(source.filename)}`;
		case "text":
			return `sha256:${await sha256Hex(new TextEncoder().encode(source.text))}${named(source.filename)}`;
		default:
			return undefined;
	}
}

const STAMP: unique symbol = Symbol("yaebal.media-cache");

/**
 * per-request bookkeeping, stamped onto the params object (a copy — the caller's object is
 * never touched) so it survives later hooks that clone params via spread.
 */
interface Stamp {
	/** keys whose cached file_id went into the request — evicted + retried if telegram rejects. */
	substituted: string[];
	/** fresh uploads to remember once the request succeeds. */
	pending: { key: string; pick: (result: unknown) => string | undefined }[];
}

type Stamped = Record<string, unknown> & { [STAMP]?: Stamp };

export function mediaCache(options: MediaCacheOptions = {}): MediaCache {
	const storage = options.storage ?? new MemoryStorage<string>();
	const attached = new WeakSet<Api>();

	const scoped = (key: string) => (options.scope ? `${options.scope}:${key}` : key);
	const emit = async (event: MediaCacheEvent) => {
		await options.onEvent?.(event);
	};

	const keyFor = async (source: MediaSource | string): Promise<string | undefined> => {
		if (typeof source === "string") return scoped(`key:${source}`);

		const key = await computeKey(source);
		return key === undefined ? undefined : scoped(key);
	};

	/** swap a cached input-media item to its file_id, or queue the fresh upload for storing. */
	const resolveInputMedia = async (
		item: unknown,
		method: string,
		stamp: Stamp,
		pick: (field: string) => (result: unknown) => string | undefined,
	): Promise<unknown> => {
		if (!isRecord(item) || !isMediaSource(item.media)) return item;

		const field = typeof item.type === "string" ? INPUT_MEDIA_FIELDS[item.type] : undefined;
		if (!field) return item;

		const key = await keyFor(item.media);
		if (!key) return item;

		const cached = await storage.get(key);
		if (cached) {
			stamp.substituted.push(key);
			await emit({ type: "hit", method, key, fileId: cached });
			return { ...item, media: media.fileId(cached) };
		}

		stamp.pending.push({ key, pick: pick(field) });
		return item;
	};

	const attach = (api: Api): void => {
		if (attached.has(api)) return;
		attached.add(api);

		api.before(async (method, params) => {
			if (!params) return;

			const stamp: Stamp = { substituted: [], pending: [] };

			const flat = SEND_METHODS[method];
			if (flat) {
				const source = params[flat.param];
				if (!isMediaSource(source)) return;

				const key = await keyFor(source);
				if (!key) return;

				const cached = await storage.get(key);
				if (cached) {
					stamp.substituted.push(key);
					await emit({ type: "hit", method, key, fileId: cached });
					return { ...params, [flat.param]: media.fileId(cached), [STAMP]: stamp };
				}

				stamp.pending.push({ key, pick: pickField(flat.field) });
				return { ...params, [STAMP]: stamp };
			}

			if (method === "sendMediaGroup" && Array.isArray(params.media)) {
				const items = await Promise.all(
					params.media.map((item, index) =>
						resolveInputMedia(
							item,
							method,
							stamp,
							(field) => (result) =>
								Array.isArray(result) ? pickField(field)(result[index]) : undefined,
						),
					),
				);

				if (stamp.substituted.length === 0 && stamp.pending.length === 0) return;
				return { ...params, media: items, [STAMP]: stamp };
			}

			if (method === "editMessageMedia" && isRecord(params.media)) {
				const item = await resolveInputMedia(params.media, method, stamp, pickField);

				if (stamp.substituted.length === 0 && stamp.pending.length === 0) return;
				return { ...params, media: item, [STAMP]: stamp };
			}

			return;
		});

		api.after(async (method, params, result) => {
			const stamp = (params as Stamped | undefined)?.[STAMP];
			if (!stamp) return;

			for (const { key, pick } of stamp.pending) {
				const fileId = pick(result);
				if (!fileId) continue;

				await storage.set(key, fileId);
				await emit({ type: "store", method, key, fileId });
			}
		});

		api.onError(async (method, error, _attempt, params) => {
			const stamp = (params as Stamped | undefined)?.[STAMP];
			if (!stamp || stamp.substituted.length === 0 || !isStaleFileIdError(error)) return;

			// telegram doesn't say which file_id it disliked — evict everything this request
			// used and retry. the retry restarts from the caller's original params (still
			// carrying the sources), misses the now-empty keys and re-uploads. the retried
			// attempt substitutes nothing, so a second failure cannot loop.
			for (const key of stamp.substituted) {
				await storage.delete(key);
				await emit({ type: "evict", key, reason: "rejected", method });
			}

			return { retry: true };
		});
	};

	const manual = (method: string): CachedSend => {
		const spec = SEND_METHODS[method];
		if (!spec) throw new Error(`media-cache: ${method} is not a cacheable send method`);

		const { param, field } = spec;

		return async (ctx, key, source, extra = {}) => {
			const chatId = ctx.chat?.id;
			if (chatId === undefined) {
				throw new Error(`media-cache ${method}: no chat in this update`);
			}

			const send = (src: MediaSource | string) =>
				ctx.api.call<Message>(method, {
					chat_id: chatId,
					[param]: src,
					...ctx.routing(),
					...extra,
				});

			const scopedKey = scoped(`key:${key}`);
			const cached = await storage.get(scopedKey);

			if (cached) {
				try {
					const result = await send(media.fileId(cached));
					await emit({ type: "hit", method, key: scopedKey, fileId: cached });
					return result;
				} catch (error) {
					if (!isStaleFileIdError(error)) throw error;

					// the stored file_id went bad — forget it and fall through to a fresh upload
					await storage.delete(scopedKey);
					await emit({ type: "evict", key: scopedKey, reason: "rejected", method });
				}
			}

			const result = await send(source);
			const fileId = pickField(field)(result);

			if (fileId) {
				await storage.set(scopedKey, fileId);
				await emit({ type: "store", method, key: scopedKey, fileId });
			}

			return result;
		};
	};

	return {
		photo: manual("sendPhoto"),
		document: manual("sendDocument"),
		audio: manual("sendAudio"),
		video: manual("sendVideo"),
		animation: manual("sendAnimation"),
		voice: manual("sendVoice"),
		videoNote: manual("sendVideoNote"),
		sticker: manual("sendSticker"),
		attach,
		plugin: () => (bot) => {
			attach(bot.api);
			return bot;
		},
		invalidate: async (source) => {
			const key = await keyFor(source);
			if (!key) return;

			await storage.delete(key);
			await emit({ type: "evict", key, reason: "invalidated" });
		},
		keyFor,
	};
}
