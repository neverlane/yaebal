import {
	type Api,
	type Context,
	isMediaSource,
	type MediaSource,
	type Message,
	media,
} from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/session";

export interface MediaCacheOptions {
	storage?: StorageAdapter<string>;
}

export interface MediaCache {
	photo(
		ctx: Context,
		key: string,
		source: MediaSource | string,
		extra?: Record<string, unknown>,
	): Promise<Message>;
	document(
		ctx: Context,
		key: string,
		source: MediaSource | string,
		extra?: Record<string, unknown>,
	): Promise<Message>;
	hook(api: Api): void;
	/**
	 * cached media sources — `.path()` and `.url()` return thenables that
	 * transparently resolve to a cached `file_id` string (if available) or
	 * the original source. works directly in `ctx.send*()` — no wrapper needed.
	 *
	 * @example
	 * const cache = mediaCache()
	 * bot.command("logo", async (ctx) => {
	 *   await ctx.sendPhoto(cache.media.path("./logo.png"))
	 * })
	 */
	media: CachedMedia;
}

export interface CachedMedia {
	path(
		p: string,
	): MediaSource & { then(resolve: (value: string | MediaSource) => unknown): unknown };
	url(
		u: string,
	): MediaSource & { then(resolve: (value: string | MediaSource) => unknown): unknown };
}

function extractFileId(result: Message, field: string): string | undefined {
	const value = (result as unknown as Record<string, unknown>)[field];
	const node = Array.isArray(value) ? value.at(-1) : value;
	return (node as { file_id?: string } | undefined)?.file_id;
}

const MEDIA_METHODS: Record<string, { param: string; field: string }> = {
	sendPhoto: { param: "photo", field: "photo" },
	sendDocument: { param: "document", field: "document" },
	sendAudio: { param: "audio", field: "audio" },
	sendVideo: { param: "video", field: "video" },
	sendAnimation: { param: "animation", field: "animation" },
	sendVoice: { param: "voice", field: "voice" },
	sendVideoNote: { param: "video_note", field: "video_note" },
	sendSticker: { param: "sticker", field: "sticker" },
};

function computeKey(source: MediaSource): string | undefined {
	if (source.kind === "path") return `path:${source.path}`;
	if (source.kind === "url") return `url:${source.url}`;
	return undefined;
}

function createCachedSource(
	source: MediaSource,
	storage_: StorageAdapter<string>,
): MediaSource & { then(resolve: (value: string | MediaSource) => unknown): unknown } {
	const key = computeKey(source);

	return {
		...source,
		then(resolve: (value: string | MediaSource) => unknown) {
			if (!key) return resolve(source);
			return Promise.resolve(storage_.get(key)).then((cached) => {
				resolve(cached ? media.fileId(cached) : source);
			});
		},
	};
}

export function mediaCache(options: MediaCacheOptions = {}): MediaCache {
	const storage = options.storage ?? new MemoryStorage<string>();

	const send = async (
		_ctx: Context,
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
		media: {
			path: (p: string) => createCachedSource(media.path(p), storage),
			url: (u: string) => createCachedSource(media.url(u), storage),
		},
		hook(api: Api) {
			const cachedBefore = new Map<object, string>();

			api.before(async (method, params) => {
				const config = MEDIA_METHODS[method];
				if (!config || !params) return;

				const src = params[config.param];
				if (!isMediaSource(src)) return;

				const key = computeKey(src);
				if (!key) return;

				const fileId = await storage.get(key);
				if (fileId) {
					params[config.param] = fileId;
					return params;
				}

				cachedBefore.set(params, key);

				return params;
			});

			api.after(async (method, params, result) => {
				if (!params) return;

				const config = MEDIA_METHODS[method];
				if (!config) return;

				const key = cachedBefore.get(params);
				if (!key) return;

				cachedBefore.delete(params);

				const id = extractFileId(result as Message, config.field);
				if (id) await storage.set(key, id);
			});
		},
	};
}
