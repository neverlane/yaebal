import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StorageAdapter } from "./index.js";

// on-disk shape: one json document, `{ [key]: { v, e? } }` where `e` is the expiry timestamp
interface Entry {
	v: unknown;
	e?: number;
}

export interface FileStorageOptions {
	/** expire entries this many ms after the last write/touch. checked lazily on read. */
	ttl?: number;
	/** pretty-print the json document (tabs) so the file is diffable/debuggable. */
	pretty?: boolean;
	/** clock override, mainly for tests. */
	now?: () => number;
}

/**
 * back storage with a single json file — the zero-infrastructure persistent adapter for small
 * bots. values must be json-serializable. every operation is funneled through one internal
 * queue and writes go via `tmp file + rename`, so the document can't interleave or tear;
 * one instance owns one path (two processes on the same file will race each other).
 */
export function fileStorage<T>(path: string, options: FileStorageOptions = {}): StorageAdapter<T> {
	const { ttl, pretty = false } = options;
	const now = options.now ?? Date.now;

	let data: Record<string, Entry> | undefined;
	let queue: Promise<unknown> = Promise.resolve();

	// serialize all operations: each op sees the previous one's flush completed
	const run = <R>(op: () => Promise<R>): Promise<R> => {
		const next = queue.then(op);
		queue = next.catch(() => {});
		return next;
	};

	const load = async (): Promise<Record<string, Entry>> => {
		if (data !== undefined) return data;

		try {
			data = JSON.parse(await readFile(path, "utf8")) as Record<string, Entry>;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			data = {};
		}

		return data;
	};

	const flush = async (doc: Record<string, Entry>): Promise<void> => {
		await mkdir(dirname(path), { recursive: true });

		const body = pretty ? JSON.stringify(doc, null, "\t") : JSON.stringify(doc);
		const tmp = `${path}.tmp`;

		await writeFile(tmp, body, "utf8");
		await rename(tmp, path);
	};

	const live = (doc: Record<string, Entry>, key: string): Entry | undefined => {
		const entry = doc[key];
		if (entry === undefined) return undefined;

		if (entry.e !== undefined && entry.e <= now()) {
			delete doc[key];
			return undefined;
		}

		return entry;
	};

	const adapter: StorageAdapter<T> = {
		get(key) {
			return run(async () => {
				const doc = await load();
				const entry = live(doc, key);
				// clone on the way out — a caller mutating the value must not silently edit the cache
				return entry === undefined ? undefined : (structuredClone(entry.v) as T);
			});
		},
		set(key, value) {
			return run(async () => {
				const doc = await load();
				// detach from the caller's object — later mutations must not edit the cache
				const v = structuredClone(value);
				doc[key] = ttl === undefined ? { v } : { v, e: now() + ttl };
				await flush(doc);
			});
		},
		delete(key) {
			return run(async () => {
				const doc = await load();
				if (doc[key] === undefined) return;
				delete doc[key];
				await flush(doc);
			});
		},
		has(key) {
			return run(async () => live(await load(), key) !== undefined);
		},
		keys(prefix = "") {
			return run(async () => {
				const doc = await load();
				return Object.keys(doc).filter(
					(key) => key.startsWith(prefix) && live(doc, key) !== undefined,
				);
			});
		},
		clear() {
			return run(async () => {
				data = {};
				await flush(data);
			});
		},
	};

	if (ttl !== undefined) {
		adapter.touch = (key) =>
			run(async () => {
				const doc = await load();
				const entry = live(doc, key);
				if (entry === undefined) return;
				entry.e = now() + ttl;
				await flush(doc);
			});
	}

	return adapter;
}
