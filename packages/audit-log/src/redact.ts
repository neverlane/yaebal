/** key names masked wherever they appear, at any depth, in an event's `update`,
 * `params`, or `result` — case-insensitive. covers the fields most likely to carry a
 * credential or PII across the Bot API surface (`setWebhook`'s `secret_token`, contact
 * shares, payment provider tokens, …). extend via {@link RedactOptions.secretKeys},
 * or replace outright. */
export const DEFAULT_SECRET_KEYS = [
	"secret_token",
	"token",
	"access_token",
	"refresh_token",
	"bot_token",
	"client_secret",
	"password",
	"passwd",
	"authorization",
	"api_key",
	"apikey",
	"provider_token",
	"phone_number",
	"card_number",
	"pin",
];

const REDACTED = "[redacted]";
const DEFAULT_MAX_STRING_LENGTH = 2000;

export interface RedactOptions {
	/** dot-path patterns, relative to the event (`"params.text"`, `"update.message.text"`),
	 * masked regardless of key name — for hiding message content itself, not just known
	 * secrets. a `*` segment matches any single key at that depth. object paths only —
	 * array elements aren't addressable. */
	paths?: string[];
	/** replace {@link DEFAULT_SECRET_KEYS} entirely instead of extending it. */
	secretKeys?: string[];
	/** truncate string values longer than this many characters. `0` disables truncation.
	 * default `2000`. */
	maxStringLength?: number;
	/** replace binary payloads (`Uint8Array`/`ArrayBuffer`/typed arrays — media buffers
	 * passed to `sendPhoto` etc.) with a `"[binary N bytes]"` placeholder instead of
	 * dumping raw bytes into the log. default `true`. */
	stripBinary?: boolean;
}

function isBinaryLike(value: unknown): value is ArrayBuffer | ArrayBufferView {
	return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function byteLengthOf(value: ArrayBuffer | ArrayBufferView): number {
	return value instanceof ArrayBuffer ? value.byteLength : value.byteLength;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	if (isBinaryLike(value) || value instanceof Date) return false;

	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function pathMatches(current: readonly string[], patterns: readonly string[][]): boolean {
	return patterns.some(
		(pattern) =>
			pattern.length === current.length &&
			pattern.every((segment, i) => segment === "*" || segment === current[i]),
	);
}

interface ResolvedRedactOptions {
	patterns: string[][];
	secretKeys: Set<string>;
	maxStringLength: number;
	stripBinary: boolean;
}

function redactValue(
	value: unknown,
	path: readonly string[],
	options: ResolvedRedactOptions,
): unknown {
	if (typeof value === "string") {
		if (options.maxStringLength <= 0 || value.length <= options.maxStringLength) return value;
		const omitted = value.length - options.maxStringLength;
		return `${value.slice(0, options.maxStringLength)}…(+${omitted} chars)`;
	}

	if (value === null) return value;
	// functions fall through to the placeholder logic below (not returned here) — a bare
	// function is exactly the kind of non-plain value that branch exists to catch.
	if (typeof value !== "object" && typeof value !== "function") return value;

	if (isBinaryLike(value)) {
		return options.stripBinary ? `[binary ${byteLengthOf(value)} bytes]` : value;
	}
	if (value instanceof Date) return value;

	if (Array.isArray(value)) return value.map((item) => redactValue(item, path, options));

	if (isPlainObject(value)) {
		const result: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value)) {
			const childPath = [...path, key];
			if (options.secretKeys.has(key.toLowerCase()) || pathMatches(childPath, options.patterns)) {
				result[key] = REDACTED;
			} else {
				result[key] = redactValue(child, childPath, options);
			}
		}
		return result;
	}

	// a class instance, function, Map/Set, stream, … — never attempt to clone these
	// (structuredClone would throw on some, silently detach a stream on others); a
	// placeholder is always safe and never breaks the logging pipeline.
	const ctorName = (value as { constructor?: { name?: string } }).constructor?.name;
	return `[object ${ctorName ?? typeof value}]`;
}

/** deep-clone-and-mask `value` — the secrets denylist, `paths`, string truncation, and
 * binary stripping all applied in one pass. never mutates `value`; never throws (unknown
 * object shapes degrade to a `"[object X]"` placeholder rather than crashing the
 * logging pipeline). used internally by {@link createAuditLogger} on every event unless
 * `redact: false` is passed; exported for sinks/formatters that want the same treatment
 * applied to an arbitrary value. */
export function applyRedaction<T>(value: T, options: RedactOptions = {}): T {
	const resolved: ResolvedRedactOptions = {
		patterns: (options.paths ?? []).map((p) => p.split(".")),
		secretKeys: new Set((options.secretKeys ?? DEFAULT_SECRET_KEYS).map((k) => k.toLowerCase())),
		maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
		stripBinary: options.stripBinary ?? true,
	};

	return redactValue(value, [], resolved) as T;
}
