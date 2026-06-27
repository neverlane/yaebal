import type { Context, Plugin } from "@yaebal/core";

export interface FilesControl {
	/** Resolve a `file_id` to its download URL (via `getFile`). */
	fileLink(fileId: string): Promise<string>;
	/** Download a `file_id` into memory (buffers the whole file — not for streaming). */
	download(fileId: string): Promise<Uint8Array>;
}

/** Adds `ctx.files` with helpers to resolve and download Telegram files. */
export function files(): Plugin<Context, { files: FilesControl }> {
	return (composer) =>
		composer.derive((ctx) => {
			const control: FilesControl = {
				async fileLink(fileId) {
					const file = await ctx.api.call<{ file_path?: string }>("getFile", {
						file_id: fileId,
					});
					if (!file.file_path) {
						throw new Error(`files: getFile returned no file_path for "${fileId}"`);
					}
					return ctx.api.fileUrl(file.file_path);
				},
				async download(fileId) {
					const res = await fetch(await control.fileLink(fileId));
					if (!res.ok) {
						throw new Error(`files: download failed (${res.status}) for "${fileId}"`);
					}
					return new Uint8Array(await res.arrayBuffer());
				},
			};
			return { files: control };
		});
}
