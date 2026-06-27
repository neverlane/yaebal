// Media abstraction (the puregram idea): a uniform way to point at a file —
// local path, URL, in-memory buffer, or an already-uploaded Telegram file_id.
// The Api layer turns each into the right wire form (multipart vs plain string).

const MEDIA: unique symbol = Symbol.for("yaebal.media");

export type MediaSource = { readonly [MEDIA]: true } & (
	| { kind: "path"; path: string }
	| { kind: "url"; url: string }
	| { kind: "buffer"; buffer: Uint8Array; filename?: string }
	| { kind: "fileId"; fileId: string }
);

/** Build a {@link MediaSource}. `media.path("./a.jpg")`, `media.url(...)`, etc. */
export const media = {
	path: (path: string): MediaSource => ({ [MEDIA]: true, kind: "path", path }),
	url: (url: string): MediaSource => ({ [MEDIA]: true, kind: "url", url }),
	buffer: (buffer: Uint8Array, filename?: string): MediaSource => ({
		[MEDIA]: true,
		kind: "buffer",
		filename,
		buffer,
	}),
	fileId: (fileId: string): MediaSource => ({ [MEDIA]: true, kind: "fileId", fileId }),
};

export function isMediaSource(x: unknown): x is MediaSource {
	return typeof x === "object" && x !== null && MEDIA in x;
}
