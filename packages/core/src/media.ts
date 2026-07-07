// media abstraction (the puregram idea): a uniform way to point at a file —
// local path, URL, in-memory buffer, stream, inline text, or an already-uploaded
// telegram file_id. the api layer turns each into the right wire form
// (multipart vs plain string), at any nesting depth (sendMediaGroup & co).

const MEDIA: unique symbol = Symbol.for("yaebal.media");

/** anything `media.stream()` accepts — a web stream or any async chunk iterable. */
export type MediaStream = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

export type MediaSource = { readonly [MEDIA]: true } & (
	| { kind: "path"; path: string }
	| { kind: "url"; url: string }
	| { kind: "buffer"; buffer: Uint8Array; filename?: string }
	| { kind: "stream"; stream: MediaStream; filename?: string }
	| { kind: "text"; text: string; filename?: string }
	| { kind: "fileId"; fileId: string }
);

/** build a {@link MediaSource}. `media.path("./a.jpg")`, `media.url(...)`, etc. */
export const media = {
	path: (path: string): MediaSource => ({ [MEDIA]: true, kind: "path", path }),
	url: (url: string): MediaSource => ({ [MEDIA]: true, kind: "url", url }),
	buffer: (buffer: Uint8Array, filename?: string): MediaSource => ({
		[MEDIA]: true,
		kind: "buffer",
		filename,
		buffer,
	}),
	/** upload from a stream. buffered right before the request — multipart needs a sized body. */
	stream: (stream: MediaStream, filename?: string): MediaSource => ({
		[MEDIA]: true,
		kind: "stream",
		filename,
		stream,
	}),
	/** upload a string as a text file (`media.text("hi", "notes.txt")`). */
	text: (text: string, filename?: string): MediaSource => ({
		[MEDIA]: true,
		kind: "text",
		filename,
		text,
	}),
	fileId: (fileId: string): MediaSource => ({ [MEDIA]: true, kind: "fileId", fileId }),
};

export function isMediaSource(x: unknown): x is MediaSource {
	return typeof x === "object" && x !== null && MEDIA in x;
}
