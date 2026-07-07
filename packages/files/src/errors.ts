/** what went wrong, machine-readable — branch on `error.reason` instead of message text. */
export type FilesErrorReason =
	/** the input couldn't be turned into a `file_id` (empty string, empty array, wrong shape). */
	| "bad-input"
	/** `getFile` answered without a `file_path` — telegram has nothing to download. */
	| "no-file-path"
	/** the byte fetch itself failed — carries the HTTP `status`. */
	| "download-failed"
	/** the file has no HTTP URL (local-server disk file, or a custom byte source). */
	| "no-url"
	/** a disk read was needed but the runtime has no filesystem (e.g. edge workers). */
	| "no-filesystem"
	/** the plugin options don't add up (e.g. `source: "rewrite"` without `local.baseUrl`). */
	| "config";

/** every error `@yaebal/files` throws. `instanceof` works; `reason` tells you which case. */
export class FilesError extends Error {
	readonly reason: FilesErrorReason;
	/** HTTP status of the failed download — only for `reason: "download-failed"`. */
	readonly status?: number;

	constructor(
		reason: FilesErrorReason,
		message: string,
		options?: { status?: number; cause?: unknown },
	) {
		super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);

		this.name = "FilesError";
		this.reason = reason;
		if (options?.status !== undefined) this.status = options.status;
	}
}
