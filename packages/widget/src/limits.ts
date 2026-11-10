/**
 * the hard numbers from telegram's widget docs (core.telegram.org/bots/widgets), and the checks
 * that turn a would-be 400 from the bot api into a clear local error before anything is sent.
 */

/** telegram's widget limits. sizes are UTF-8 bytes unless noted. */
export const WIDGET_LIMITS = {
	/** the widget's html, uncompressed. */
	htmlBytes: 32768,
	/** the widget's html after zlib compression at level 9 (the binding limit in practice). */
	htmlCompressedBytes: 4096,
	/** each of `public_data` / `chat_data`. */
	dataBytes: 1024,
	/** the `data` a widget sends with `TelegramWidget.request()` (and a wallet call's label). */
	queryMinBytes: 1,
	queryMaxBytes: 64,
	/** the `data` of an `answerWidgetQuery`. */
	answerBytes: 1024,
	/** a widget query must be answered within this window, or the widget gets `TIMEOUT`. */
	answerTimeoutMs: 15_000,
	/** `editSharedWidgetData`'s `cache_time`, seconds (below the minimum is refused, above is clamped). */
	cacheTimeMin: 5,
	cacheTimeMax: 3600,
	/** the logical-pixel size telegram clamps a widget to. */
	widthMin: 200,
	widthMax: 600,
	heightMin: 50,
	heightMax: 600,
	/** a TON Connect transaction carries 1–255 messages. */
	tonMessagesMax: 255,
} as const;

/**
 * what went wrong — the first five mirror the error names the bot api itself would answer with,
 * so a log line reads the same whichever side caught it.
 */
export type WidgetErrorCode =
	| "INPUT_MEDIA_WIDGET_TOO_LARGE"
	| "INPUT_MEDIA_WIDGET_HTML_INVALID"
	| "INPUT_MEDIA_WIDGET_DATA_TOO_LARGE"
	| "INPUT_MEDIA_WIDGET_DATA_INVALID"
	| "WIDGET_RESULT_TOO_LARGE"
	| "WIDGET_QUERY_INVALID"
	| "WIDGET_CACHE_TIME_INVALID"
	| "WIDGET_SIZE_INVALID"
	| "WIDGET_TON_INVALID"
	| "WIDGET_NO_TARGET"
	| "WIDGET_NOT_A_QUERY";

/** thrown by every check in this package — `code` says which limit was hit. */
export class WidgetError extends Error {
	override readonly name = "WidgetError";

	constructor(
		readonly code: WidgetErrorCode,
		message: string,
	) {
		super(message);
	}
}

const encoder = new TextEncoder();

/** UTF-8 byte length — the unit every widget limit is measured in. */
export function byteLength(value: string): number {
	return encoder.encode(value).length;
}

/** which state slot a value is headed for — only used in error messages. */
export type DataField = "public_data" | "chat_data";

/** a `public_data` / `chat_data` value: at most 1024 bytes, no NUL. returns it unchanged. */
export function assertData(value: string, field: DataField = "public_data"): string {
	if (value.includes("\0")) {
		throw new WidgetError("INPUT_MEDIA_WIDGET_DATA_INVALID", `${field} must not contain NUL`);
	}
	const size = byteLength(value);
	if (size > WIDGET_LIMITS.dataBytes) {
		throw new WidgetError(
			"INPUT_MEDIA_WIDGET_DATA_TOO_LARGE",
			`${field} is ${size} bytes, the limit is ${WIDGET_LIMITS.dataBytes}`,
		);
	}
	return value;
}

/** an `answerWidgetQuery` `data`: at most 1024 bytes. returns it unchanged. */
export function assertAnswer(value: string): string {
	const size = byteLength(value);
	if (size > WIDGET_LIMITS.answerBytes) {
		throw new WidgetError(
			"WIDGET_RESULT_TOO_LARGE",
			`the answer is ${size} bytes, the limit is ${WIDGET_LIMITS.answerBytes}`,
		);
	}
	return value;
}

/** the `data` of a widget query (or a wallet call's label): 1–64 bytes. returns it unchanged. */
export function assertQueryData(value: string): string {
	const size = byteLength(value);
	if (size < WIDGET_LIMITS.queryMinBytes || size > WIDGET_LIMITS.queryMaxBytes) {
		throw new WidgetError(
			"WIDGET_QUERY_INVALID",
			`widget query data must be ${WIDGET_LIMITS.queryMinBytes}-${WIDGET_LIMITS.queryMaxBytes} bytes, got ${size}`,
		);
	}
	return value;
}

/** `editSharedWidgetData`'s `cache_time`: an integer of at least 5 (telegram clamps above 3600). */
export function assertCacheTime(seconds: number): number {
	if (!Number.isInteger(seconds) || seconds < WIDGET_LIMITS.cacheTimeMin) {
		throw new WidgetError(
			"WIDGET_CACHE_TIME_INVALID",
			`cache_time must be an integer >= ${WIDGET_LIMITS.cacheTimeMin} seconds, got ${seconds}`,
		);
	}
	return seconds;
}

/** a widget `width` / `height`: a positive integer (telegram clamps it into its range on display). */
export function assertDimension(value: number, field: "width" | "height"): number {
	if (!Number.isInteger(value) || value <= 0) {
		throw new WidgetError(
			"WIDGET_SIZE_INVALID",
			`${field} must be a positive integer, got ${value}`,
		);
	}
	return value;
}
