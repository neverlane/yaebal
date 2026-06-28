import { type Context, type MediaSource, type Message, media } from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/session";

export interface MediaCacheOptions {
	/** where to keep `key → file_id`. defaults to in-memory (lost on restart). */
	storage?: StorageAdapter<string>;
}

export interface MediaCache {
	/** send a photo, caching its `file_id` under `key` to skip future uploads. */
	photo(
		ctx: Context,
		key: string,
		source: MediaSource | string,
		extra?: Record<string, unknown>,
	): Promise<Message>;
	/** send a document, caching its `file_id` under `key`. */
	document(
		ctx: Context,
		key: string,
		source: MediaSource | string,
		extra?: Record<string, unknown>,
	): Promise<Message>;
}

function extractFileId(result: Message, field: string): string | undefined {
	const value = (result as unknown as Record<string, unknown>)[field];
	const node = Array.isArray(value) ? value[value.length - 1] : value;

	return (node as { file_id?: string } | undefined)?.file_id;
}

/**
 * the first time you send a local file under a `key`, telegram returns a
 * `file_id`; this caches it and reuses it on later sends — no re-upload.
 * caller-supplied keys, so it's correct under concurrency (unlike a transparent
 * hook that has to guess which upload produced which id).
 */
export function mediaCache(options: MediaCacheOptions = {}): MediaCache {
	const storage = options.storage ?? new MemoryStorage<string>();

	const send = async (
		ctx: Context,
		key: string,
		source: MediaSource | string,
		field: "photo" | "document",
		sender: (src: MediaSource | string, extra?: Record<string, unknown>) => Promise<Message>,
		extra?: Record<string, unknown>,
	): Promise<Message> => {
		const cached = await storage.get(key);
		const result = await sender(cached ? media.fileId(cached) : source, extra);

		if (!cached) {
			const id = extractFileId(result, field);
			
			if (id) await storage.set(key, id);
		}

		return result;
	};

	return {
		photo: (ctx, key, source, extra) =>
			send(ctx, key, source, "photo", (s, e) => ctx.sendPhoto(s, e), extra),
		document: (ctx, key, source, extra) =>
			send(ctx, key, source, "document", (s, e) => ctx.sendDocument(s, e), extra),
	};
}
