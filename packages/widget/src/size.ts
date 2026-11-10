import { byteLength, WIDGET_LIMITS, WidgetError } from "./limits.js";

/** how big a widget's html is, measured the way telegram measures it. */
export interface HtmlSize {
	/** UTF-8 bytes (limit {@link WIDGET_LIMITS.htmlBytes}). */
	bytes: number;
	/** bytes after zlib compression at level 9 (limit {@link WIDGET_LIMITS.htmlCompressedBytes}). */
	compressedBytes: number;
	/**
	 * `true` when `compressedBytes` came from real level-9 zlib (`node:zlib`, also on bun and
	 * deno). `false` on runtimes without it: the web `CompressionStream` compresses at its default
	 * level, which never beats level 9 — so the figure is an upper bound and `fits` stays safe.
	 */
	exact: boolean;
	/** within both limits, and non-empty with no NUL. */
	fits: boolean;
}

/** measures the zlib-compressed size of some bytes. */
export type Deflate = (bytes: Uint8Array) => number;

let nodeDeflate: Deflate | null | undefined;

/**
 * a level-9 deflate measurer from a loaded `node:zlib` module — `null` when the module is a stub
 * without `deflateSync` (what a browser bundler substitutes for node builtins).
 */
export function deflaterFrom(zlib: { deflateSync?: unknown }): Deflate | null {
	const deflateSync = zlib.deflateSync;
	if (typeof deflateSync !== "function") return null;
	return (bytes) => (deflateSync(bytes, { level: 9 }) as Uint8Array).length;
}

/** `node:zlib` at level 9, loaded once; `null` where the runtime has no `node:zlib`. */
async function loadNodeDeflate(): Promise<Deflate | null> {
	nodeDeflate ??= await import("node:zlib").then(
		deflaterFrom,
		// a runtime without node:zlib (edge workers): the CompressionStream fallback takes over
		/* node:coverage ignore next */
		() => null,
	);
	return nodeDeflate;
}

/** web-standard fallback: zlib-format deflate at the default level (an upper bound on level 9). */
export async function streamDeflateSize(bytes: Uint8Array): Promise<number> {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	const stream = new Blob([copy]).stream().pipeThrough(new CompressionStream("deflate"));
	const buffer = await new Response(stream).arrayBuffer();
	return buffer.byteLength;
}

/**
 * the zlib-compressed size of `bytes`. `useNodeZlib: false` forces the {@link streamDeflateSize}
 * fallback (what a runtime without `node:zlib` gets).
 */
export async function compressedSize(
	bytes: Uint8Array,
	useNodeZlib = true,
): Promise<{ size: number; exact: boolean }> {
	const deflate = useNodeZlib ? await loadNodeDeflate() : null;
	if (deflate) return { size: deflate(bytes), exact: true };
	return { size: await streamDeflateSize(bytes), exact: false };
}

export interface MeasureOptions {
	/** `false` measures with the web `CompressionStream` fallback even where `node:zlib` exists. */
	useNodeZlib?: boolean;
}

/** measure `html` against telegram's two size limits without throwing. */
export async function measureHtml(html: string, options: MeasureOptions = {}): Promise<HtmlSize> {
	const bytes = new TextEncoder().encode(html);
	const { size, exact } = await compressedSize(bytes, options.useNodeZlib ?? true);

	return {
		bytes: bytes.length,
		compressedBytes: size,
		exact,
		fits:
			bytes.length > 0 &&
			!html.includes("\0") &&
			bytes.length <= WIDGET_LIMITS.htmlBytes &&
			size <= WIDGET_LIMITS.htmlCompressedBytes,
	};
}

/**
 * the checks telegram runs on a widget's html — empty or NUL is `INPUT_MEDIA_WIDGET_HTML_INVALID`,
 * over 32768 bytes or over 4096 compressed is `INPUT_MEDIA_WIDGET_TOO_LARGE`. resolves to the
 * measured size when it passes.
 */
export async function checkHtml(html: string, options: MeasureOptions = {}): Promise<HtmlSize> {
	if (html.length === 0) {
		throw new WidgetError("INPUT_MEDIA_WIDGET_HTML_INVALID", "widget html must not be empty");
	}
	if (html.includes("\0")) {
		throw new WidgetError("INPUT_MEDIA_WIDGET_HTML_INVALID", "widget html must not contain NUL");
	}
	const bytes = byteLength(html);
	if (bytes > WIDGET_LIMITS.htmlBytes) {
		throw new WidgetError(
			"INPUT_MEDIA_WIDGET_TOO_LARGE",
			`widget html is ${bytes} bytes, the limit is ${WIDGET_LIMITS.htmlBytes}`,
		);
	}

	const size = await measureHtml(html, options);
	if (size.compressedBytes > WIDGET_LIMITS.htmlCompressedBytes) {
		throw new WidgetError(
			"INPUT_MEDIA_WIDGET_TOO_LARGE",
			`widget html is ${size.compressedBytes} bytes zlib-compressed${size.exact ? "" : " (upper bound)"}, the limit is ${WIDGET_LIMITS.htmlCompressedBytes} — trim it or pass minify: true`,
		);
	}
	return size;
}
