import type { Api, Context, Plugin } from "@yaebal/core";
import type { File as TelegramFile } from "@yaebal/types";
import { FileDownload, type ResolvedFileSource } from "./download.js";
import { FilesError } from "./errors.js";

export type { File as TelegramFile } from "@yaebal/types";
export { FileDownload, type FileDownloadInit, type ResolvedFileSource } from "./download.js";
export { FilesError, type FilesErrorReason } from "./errors.js";

/**
 * anything that names a telegram file:
 * - a raw `file_id` string;
 * - any api object carrying one (`Document`, `Audio`, `Video`, `Voice`, `Sticker`, a
 *   single `PhotoSize`, the `File` from `getFile`, …);
 * - an array of sizes (`ctx.photo`, thumbnails) — the largest (last) one wins.
 */
export type FileInput = string | { file_id: string } | readonly { file_id: string }[];

/** collapse a {@link FileInput} to its `file_id`. throws `FilesError("bad-input")` on junk. */
export function resolveFileId(input: FileInput): string {
	if (typeof input === "string") {
		if (input) return input;
		throw new FilesError("bad-input", "files: empty file_id");
	}

	if (Array.isArray(input)) {
		const last = input.at(-1) as { file_id: string } | undefined;
		if (last?.file_id) return last.file_id;
		throw new FilesError("bad-input", "files: empty size array — no file_id to pick");
	}

	const id = (input as { file_id: string }).file_id;
	if (typeof id === "string" && id) return id;

	throw new FilesError("bad-input", "files: input has no usable file_id");
}

/**
 * how to obtain the bytes once `getFile` answered — only interesting with a
 * self-hosted Bot API server (`--local`), where `file_path` is an absolute path
 * on the server's disk instead of a relative CDN path.
 *
 * - `"auto"` *(default)* — relative path → classic URL; absolute path → `local.baseUrl`
 *   rewrite when configured, else read from disk.
 * - `"url"` — always the classic `…/file/bot<token>/<path>` URL.
 * - `"disk"` — always read `file_path` from the local filesystem (shared volume).
 * - `"rewrite"` — always fetch `${local.baseUrl}/<relative path>` (token-less).
 * - a function — full custom resolution: you get the `File`, you return the bytes.
 */
export type FileSource =
	| "auto"
	| "url"
	| "disk"
	| "rewrite"
	| ((file: TelegramFile) => Uint8Array | Promise<Uint8Array>);

export interface FilesOptions {
	/** byte-fetching strategy. @default "auto" */
	source?: FileSource;
	/** topology of a self-hosted Bot API server run with `--local`. */
	local?: {
		/** the server's working directory — the prefix of absolute `file_path`s it reports. @default "/var/lib/telegram-bot-api" */
		dir?: string;
		/**
		 * where that directory is mounted on the bot's side, when the two share a volume
		 * at a different path (`dir` → `mount` is remapped before disk reads).
		 * @default same as `dir`
		 */
		mount?: string;
		/** public base URL the working dir is served at — enables token-less links and `source: "rewrite"`. */
		baseUrl?: string;
	};
	/** fetch implementation for the byte downloads (proxy, instrumentation, tests). @default globalThis.fetch */
	fetch?: typeof globalThis.fetch;
}

/** per-call options. */
export interface FileCallOptions {
	/** aborts the `getFile` call and the byte fetch. */
	signal?: AbortSignal;
}

/** `ctx.files` / `createFiles(api)` — resolve, inspect and download telegram files. */
export interface FilesControl {
	/** the `getFile` metadata for a file — size, unique id, path. one api call, no bytes. */
	info(file: FileInput, options?: FileCallOptions): Promise<TelegramFile>;
	/**
	 * the download URL for a file (via `getFile`).
	 *
	 * ⚠️ the classic telegram URL embeds the bot token — don't show it to users or log
	 * it. configure `local.baseUrl` for token-less links.
	 */
	url(file: FileInput, options?: FileCallOptions): Promise<string>;
	/**
	 * a lazy {@link FileDownload} handle. nothing happens until you read from it:
	 * `await` it for bytes, or use `.text()`, `.json()`, `.blob()`, `.stream()`,
	 * `.toFile(path)`, `.info()`, `.url()`.
	 */
	download(file: FileInput, options?: FileCallOptions): FileDownload;
}

const DEFAULT_LOCAL_DIR = "/var/lib/telegram-bot-api";

/** absolute on POSIX (`/x`) or Windows (`C:\x`, `\\server\share`) — i.e. a local-server path. */
const isAbsolutePath = (filePath: string): boolean =>
	filePath.startsWith("/") || filePath.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(filePath);

/** remap a server-reported absolute path to where the bot can read it (`dir` → `mount`). */
function toDiskPath(filePath: string, local: FilesOptions["local"]): string {
	const dir = local?.dir ?? DEFAULT_LOCAL_DIR;
	const mount = local?.mount;
	if (!mount || !filePath.startsWith(dir)) return filePath;

	return mount.replace(/[\\/]+$/, "") + filePath.slice(dir.length);
}

/** token-less URL under `local.baseUrl` for a (possibly absolute) `file_path`. */
function toRewriteUrl(filePath: string, local: FilesOptions["local"]): string {
	const baseUrl = local?.baseUrl;
	if (!baseUrl) {
		throw new FilesError(
			"config",
			'files: source "rewrite" needs `local.baseUrl` (the public URL the server\'s working dir is served at)',
		);
	}

	const dir = local?.dir ?? DEFAULT_LOCAL_DIR;
	const rel = (filePath.startsWith(dir) ? filePath.slice(dir.length) : filePath).replace(
		/^[\\/]+/,
		"",
	);

	return `${baseUrl.replace(/\/+$/, "")}/${rel}`;
}

/**
 * build a {@link FilesControl} bound to an api client. this is the plugin's engine,
 * exported on its own so file work isn't chained to middleware — use it in `onStart`,
 * cron jobs, workers, or scripts where there is no `ctx`.
 *
 * ```ts
 * const files = createFiles(bot.api);
 * await files.download(fileId).toFile("./backup.bin");
 * ```
 */
export function createFiles(api: Api, options: FilesOptions = {}): FilesControl {
	const getFile = (file: FileInput, callOptions?: FileCallOptions): Promise<TelegramFile> =>
		// api.call instead of the typed proxy method — it's the form that takes a signal
		api.call<TelegramFile>(
			"getFile",
			{ file_id: resolveFileId(file) },
			{
				signal: callOptions?.signal,
			},
		);

	const sourceOf = async (file: TelegramFile): Promise<ResolvedFileSource> => {
		const filePath = file.file_path;
		if (!filePath) {
			throw new FilesError(
				"no-file-path",
				`files: getFile returned no file_path for "${file.file_id}"`,
			);
		}

		let strategy = options.source ?? "auto";
		if (strategy === "auto") {
			strategy = isAbsolutePath(filePath) ? (options.local?.baseUrl ? "rewrite" : "disk") : "url";
		}

		if (typeof strategy === "function") return { type: "bytes", bytes: await strategy(file) };
		if (strategy === "disk") return { type: "disk", path: toDiskPath(filePath, options.local) };
		if (strategy === "rewrite") return { type: "url", url: toRewriteUrl(filePath, options.local) };

		return { type: "url", url: api.fileUrl(filePath) };
	};

	const control: FilesControl = {
		info: (file, callOptions) => getFile(file, callOptions),
		url: (file, callOptions) => control.download(file, callOptions).url(),
		download: (file, callOptions) =>
			new FileDownload({
				getFile: () => getFile(file, callOptions),
				sourceOf,
				fetch: options.fetch,
				signal: callOptions?.signal,
			}),
	};

	return control;
}

/**
 * adds `ctx.files` — see {@link FilesControl}. the control is built once per api client
 * (it holds no per-update state), so the per-update cost is one property.
 *
 * ```ts
 * bot.install(files());
 *
 * bot.on("message:photo", async (ctx) => {
 *   await ctx.files.download(ctx.photo).toFile("./last-photo.jpg");
 * });
 * ```
 */
export function files(options: FilesOptions = {}): Plugin<Context, { files: FilesControl }> {
	const perApi = new WeakMap<Api, FilesControl>();

	return (composer) =>
		composer.derive((ctx) => {
			let files = perApi.get(ctx.api);
			if (!files) {
				files = createFiles(ctx.api, options);
				perApi.set(ctx.api, files);
			}

			return { files };
		});
}
