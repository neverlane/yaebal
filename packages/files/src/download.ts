import type { File as TelegramFile } from "@yaebal/types";
import { FilesError } from "./errors.js";

/** where the bytes of a resolved file actually live. */
export type ResolvedFileSource =
	/** a plain HTTP download (the classic `…/file/bot<token>/<path>` URL, or a `local.baseUrl` rewrite). */
	| { type: "url"; url: string }
	/** a path on this machine's filesystem (local Bot API server in `--local` mode). */
	| { type: "disk"; path: string }
	/** bytes produced by a custom `source` function. */
	| { type: "bytes"; bytes: Uint8Array };

/** everything a {@link FileDownload} needs — supplied by `createFiles`, or by you in tests. */
export interface FileDownloadInit {
	/** fetch the `getFile` metadata. called at most once — the handle memoizes it. */
	getFile: () => Promise<TelegramFile>;
	/** map metadata to a byte source. called once, lazily — only when a body or URL is first needed. */
	sourceOf: (file: TelegramFile) => ResolvedFileSource | Promise<ResolvedFileSource>;
	/** fetch implementation for `url` sources. default: `globalThis.fetch`, resolved per call. */
	fetch?: typeof globalThis.fetch;
	/** aborts the byte fetch (and is respected by disk reads via the response machinery). */
	signal?: AbortSignal;
}

// node:fs & friends are imported lazily and only on the code paths that need a disk
// (`toFile`, disk-sourced bodies) — the module itself stays loadable on edge runtimes.
async function nodeFs(): Promise<typeof import("node:fs/promises")> {
	try {
		return await import("node:fs/promises");
	} catch (cause) {
		throw new FilesError(
			"no-filesystem",
			"files: this runtime has no filesystem — use bytes()/stream() instead of toFile(), and avoid the disk strategy",
			{ cause },
		);
	}
}

/**
 * a lazy, `Response`-like handle for one telegram file. nothing is fetched until you
 * ask for something: `info()` costs one `getFile`; the body readers additionally fetch
 * the bytes. it is a `PromiseLike<Uint8Array>` — `await handle` yields the raw bytes.
 *
 * ```ts
 * const dl = ctx.files.download(ctx.document);
 * await dl.info();               // getFile metadata (no body)
 * await dl.text();               // string (utf-8)
 * await dl.json<Config>();       // parsed JSON
 * await dl.stream();             // ReadableStream — pipe huge files, no buffering
 * await dl.toFile("./a.pdf");    // save to disk, returns the path
 * const bytes = await dl;        // Uint8Array
 * ```
 *
 * like a `Response`, the body is single-use: read it once, then call `download()`
 * again for another pass. `info()`, `url()` and a disk-sourced `toFile()` don't
 * consume the body.
 */
export class FileDownload implements PromiseLike<Uint8Array> {
	readonly #init: FileDownloadInit;
	#file?: Promise<TelegramFile>;
	#source?: Promise<ResolvedFileSource>;
	#response?: Promise<Response>;

	constructor(init: FileDownloadInit) {
		this.#init = init;
	}

	/** the `getFile` metadata (`file_id`, `file_unique_id`, `file_size`, `file_path`). no body read. */
	info(): Promise<TelegramFile> {
		this.#file ??= this.#init.getFile();
		return this.#file;
	}

	#resolveSource(): Promise<ResolvedFileSource> {
		this.#source ??= this.info().then((file) => this.#init.sourceOf(file));
		return this.#source;
	}

	/**
	 * the download URL. no body read.
	 *
	 * ⚠️ the classic telegram URL embeds the bot token — don't show it to users or log
	 * it. with `local.baseUrl` configured the link is token-less. throws
	 * `FilesError("no-url")` when the file only exists as a disk path or custom bytes.
	 */
	async url(): Promise<string> {
		const source = await this.#resolveSource();
		if (source.type === "url") return source.url;

		throw new FilesError(
			"no-url",
			source.type === "disk"
				? "files: this file resolves to a local-server disk path — set `local.baseUrl` to serve it over HTTP, or read it with bytes()/toFile()"
				: "files: a custom `source` produces bytes directly — there is no URL to hand out",
		);
	}

	#fetchResponse(): Promise<Response> {
		this.#response ??= (async () => {
			const source = await this.#resolveSource();

			if (source.type === "bytes") {
				return new Response(toArrayBuffer(source.bytes));
			}

			if (source.type === "disk") {
				const fs = await nodeFs();
				// one buffered read; streaming from disk goes through stream() below
				return new Response(toArrayBuffer(await fs.readFile(source.path)));
			}

			const fetchImpl = this.#init.fetch ?? globalThis.fetch;
			const res = await fetchImpl(source.url, { signal: this.#init.signal });

			if (!res.ok) {
				// drain nothing — release the connection instead of holding it until GC
				await res.body?.cancel().catch(() => {});

				const file = await this.info();
				throw new FilesError(
					"download-failed",
					`files: download failed (${res.status}) for "${file.file_id}"`,
					{ status: res.status },
				);
			}

			return res;
		})();

		return this.#response;
	}

	/** the whole file as an `ArrayBuffer`. */
	async arrayBuffer(): Promise<ArrayBuffer> {
		return (await this.#fetchResponse()).arrayBuffer();
	}

	/** the whole file as a `Uint8Array`. */
	async bytes(): Promise<Uint8Array> {
		const res = await this.#fetchResponse();

		// Response.bytes() is native on node 22+/bun/deno; older runtimes fall back
		const native = (res as { bytes?: () => Promise<Uint8Array> }).bytes;
		return typeof native === "function"
			? native.call(res)
			: new Uint8Array(await res.arrayBuffer());
	}

	/** the whole file as a `Blob`. */
	async blob(): Promise<Blob> {
		return (await this.#fetchResponse()).blob();
	}

	/** the file decoded as UTF-8 text. */
	async text(): Promise<string> {
		return (await this.#fetchResponse()).text();
	}

	/** the file parsed as JSON. */
	async json<T = unknown>(): Promise<T> {
		return (await this.#fetchResponse()).json() as Promise<T>;
	}

	/** a web `ReadableStream` over the bytes — pipe large files without buffering them. */
	async stream(): Promise<ReadableStream<Uint8Array>> {
		const source = await this.#resolveSource();

		// disk files stream straight from the fs — no whole-file buffering
		if (source.type === "disk" && this.#response === undefined) {
			const [{ createReadStream }, { Readable }] = await Promise.all([
				import("node:fs").catch((cause) => {
					throw new FilesError("no-filesystem", "files: this runtime has no filesystem", {
						cause,
					});
				}),
				import("node:stream"),
			]);

			return Readable.toWeb(createReadStream(source.path)) as ReadableStream<Uint8Array>;
		}

		const res = await this.#fetchResponse();
		if (!res.body) throw new FilesError("download-failed", "files: response has no body");

		return res.body;
	}

	/**
	 * save the file to `path` and return `path`. a local-server disk file is copied on
	 * disk (no transfer at all); anything else streams to the file without buffering.
	 * doesn't consume the body for disk sources. needs a filesystem (node/bun/deno).
	 */
	async toFile(path: string): Promise<string> {
		const source = await this.#resolveSource();
		const fs = await nodeFs();

		if (source.type === "disk") {
			await fs.copyFile(source.path, path);
			return path;
		}

		if (source.type === "bytes") {
			await fs.writeFile(path, source.bytes);
			return path;
		}

		const res = await this.#fetchResponse();

		if (res.body) {
			const { Readable } = await import("node:stream");
			await fs.writeFile(path, Readable.fromWeb(res.body as never));
		} else {
			await fs.writeFile(path, new Uint8Array(await res.arrayBuffer()));
		}

		return path;
	}

	/** `PromiseLike`: `await handle` resolves to the file bytes (`Uint8Array`). */
	then<TResult1 = Uint8Array, TResult2 = never>(
		onfulfilled?: ((value: Uint8Array) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.bytes().then(onfulfilled, onrejected);
	}
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	return copy.buffer;
};
