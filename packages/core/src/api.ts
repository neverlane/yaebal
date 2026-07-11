import type { BotApiMethods } from "@yaebal/types";
import { applyFormatFields } from "./format-hook.js";
import { isMediaSource, type MediaSource, type MediaStream } from "./media.js";
import type { ApiResponse, ResponseParameters } from "./telegram-types.js";
import type { WebhookReplyEnvelope } from "./webhook.js";

/**
 * resolve a local `media.path()` into bytes. runtime-specific (node:fs, Bun.file,
 * Deno.readFile), so it's injected rather than imported — that keeps `@yaebal/core`
 * free of any `node:` import and loadable on edge/web. the `yaebal` package wires an
 * auto-detecting default; absent ⇒ `media.path()` throws (e.g. on Cloudflare Workers).
 */
export type FileReader = (path: string) => Promise<Uint8Array>;

/**
 * thrown when the HTTP layer fails before a Bot API answer exists — the server
 * (or a proxy in front of it) replied with something that isn't the JSON envelope
 * (e.g. an HTML 502 page). carries the method and HTTP status for context;
 * `TelegramError` stays reserved for real `ok: false` API answers.
 */
export class HttpError extends Error {
	readonly method: string;
	readonly status: number;
	readonly statusText: string;

	constructor(method: string, status: number, statusText: string) {
		super(`[${method}] HTTP ${status} ${statusText}: non-JSON response from the API server`);

		this.name = "HttpError";
		this.method = method;
		this.status = status;
		this.statusText = statusText;
	}
}

/** thrown when telegram replies with `ok: false`. */
export class TelegramError extends Error {
	readonly method: string;
	readonly code: number;
	readonly description: string;
	readonly parameters?: ResponseParameters;

	constructor(method: string, code: number, description: string, parameters?: ResponseParameters) {
		super(`[${method}] ${code}: ${description}`);

		this.name = "TelegramError";
		this.method = method;
		this.code = code;
		this.description = description;
		this.parameters = parameters;
	}
}

/** inspect/rewrite params before a request. return new params to replace them. */
export type BeforeHook = (
	method: string,
	params: Record<string, unknown> | undefined,
) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;

/** inspect/rewrite the result after a successful request. return a value to replace it. */
export type AfterHook = (
	method: string,
	params: Record<string, unknown> | undefined,
	result: unknown,
) => unknown | Promise<unknown>;

/** what an error hook can ask the client to do. */
export interface ErrorAction {
	/** re-run the same call. */
	retry?: boolean;
	/** wait this many ms before retrying. */
	delayMs?: number;
}

/** runs when a request throws. `attempt` is the (1-based) attempt that just failed. */
export type ErrorHook = (
	method: string,
	error: unknown,
	attempt: number,
	params: Record<string, unknown> | undefined,
) => ErrorAction | undefined | Promise<ErrorAction | undefined>;

/** per-call options — currently just cancellation. */
export interface CallOptions {
	/** abort the underlying fetch (e.g. `Bot.stop()` cancels the long poll with this). */
	signal?: AbortSignal;
}

/**
 * the API client. every Bot API method is fully typed via the code-generated
 * {@link BotApiMethods} (the proxy materialises them at runtime); `call` stays as
 * the untyped passthrough (the puregram idea — a brand-new Bot API method, or
 * params built dynamically as plain records, work before/without types).
 * `before` / `after` / `onError` are the extension points plugins hang off of.
 */
export interface Api extends BotApiMethods {
	call<T = unknown>(
		method: string,
		params?: Record<string, unknown>,
		options?: CallOptions,
	): Promise<T>;
	/** build the download URL for a `file_path` from `getFile`. contains the bot token — don't log it. */
	fileUrl(filePath: string): string;
	/** register a hook that runs before every request; may rewrite params. */
	before(hook: BeforeHook): Api;
	/** register a hook that runs after every successful request; may rewrite the result. */
	after(hook: AfterHook): Api;
	/** register a hook that runs when a request throws; may request a retry. */
	onError(hook: ErrorHook): Api;
}

export interface ApiOptions {
	/**
	 * bare API origin, no trailing slash and no `/bot` — the client appends
	 * `/bot<token>/<method>` itself. e.g. `"https://api.telegram.org"` or a local
	 * bot-api server `"http://localhost:8081"`. passing a value that already ends
	 * in `/bot…` yields a doubled path and 401s. defaults to the public origin.
	 */
	apiRoot?: string;
	/** resolve `media.path()` to bytes. injected per runtime; absent ⇒ path media throws (e.g. edge). */
	readFile?: FileReader;
}

interface EncodedRequest {
	body: string | FormData | undefined;
	contentType?: string;
}

/** basename without node:path — keeps core free of node: imports. */
const baseName = (p: string): string => p.split(/[\\/]/).pop() || "file";
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	return copy.buffer;
};

/** drain a web stream / async iterable into one buffer (multipart needs a sized body). */
async function streamToBytes(stream: MediaStream): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let total = 0;

	const iterable: AsyncIterable<Uint8Array> =
		Symbol.asyncIterator in stream
			? (stream as AsyncIterable<Uint8Array>)
			: readerToIterable(stream as ReadableStream<Uint8Array>);

	for await (const chunk of iterable) {
		chunks.push(chunk);
		total += chunk.byteLength;
	}

	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return out;
}

// ReadableStream is async-iterable in node/bun/deno, but not in every edge runtime —
// fall back to the reader protocol so media.stream() works wherever fetch does.
async function* readerToIterable(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
	const reader = stream.getReader();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return;
			if (value) yield value;
		}
	} finally {
		reader.releaseLock();
	}
}

async function mediaToBlob(
	m: MediaSource,
	readFile?: FileReader,
): Promise<{ blob: Blob; filename: string }> {
	switch (m.kind) {
		case "path": {
			if (!readFile)
				throw new Error(
					"media.path() needs a filesystem — use the `yaebal` package (auto-detects node/bun/deno), " +
						"pass `readFile` to the Bot, or send media.buffer()/url() instead (e.g. on edge).",
				);

			const bytes = await readFile(m.path);
			return { blob: new Blob([toArrayBuffer(bytes)]), filename: baseName(m.path) };
		}
		case "buffer":
			return { blob: new Blob([toArrayBuffer(m.buffer)]), filename: m.filename ?? "file" };
		case "stream": {
			const bytes = await streamToBytes(m.stream);
			return { blob: new Blob([toArrayBuffer(bytes)]), filename: m.filename ?? "file" };
		}
		case "text":
			return { blob: new Blob([m.text]), filename: m.filename ?? "text.txt" };
		default:
			throw new Error(`mediaToBlob: ${m.kind} is not an uploadable source`);
	}
}

type Thenable<T> = { then: (resolve: (value: T) => unknown) => unknown };

function isThenable(v: unknown): v is Thenable<unknown> {
	return typeof v === "object" && v !== null && "then" in v;
}

async function resolveThenables(params: Record<string, unknown>): Promise<void> {
	for (const key of Object.keys(params)) {
		const v = params[key];
		if (isThenable(v)) params[key] = await v;
	}
}

// a value the media walk may descend into: arrays and plain objects only. anything
// exotic (typed arrays, Blobs, Dates, class instances) is passed through untouched —
// walking a Uint8Array's indices or flattening a Date to `{}` would corrupt params.
function isWalkable(v: unknown): v is Record<string, unknown> {
	if (Array.isArray(v)) return true;
	if (v === null || typeof v !== "object") return false;

	const proto = Object.getPrototypeOf(v);
	return proto === Object.prototype || proto === null;
}

/**
 * replace every {@link MediaSource} in `value` — at any depth — with its wire form:
 * `url`/`fileId` inline to their string; uploadable kinds become an `attach://_fileN`
 * reference and land in `uploads`. containers are copied, never mutated. this is what
 * makes nested media (`sendMediaGroup`, `editMessageMedia`, `createNewStickerSet`,
 * story/profile-photo content, …) work with the same `media.*` builders as flat params.
 */
function extractMedia(value: unknown, uploads: { field: string; source: MediaSource }[]): unknown {
	if (isMediaSource(value)) {
		if (value.kind === "url") return value.url;
		if (value.kind === "fileId") return value.fileId;

		const field = `_file${uploads.length}`;
		uploads.push({ field, source: value });
		return `attach://${field}`;
	}

	if (Array.isArray(value)) return value.map((item) => extractMedia(item, uploads));

	if (isWalkable(value)) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = extractMedia(v, uploads);
		return out;
	}

	return value;
}

/**
 * encode request params. plain params (and `url`/`fileId` media) go as JSON; if any
 * uploadable media is present — at the top level or nested (`sendMediaGroup` & co) —
 * the whole request becomes multipart, with each upload attached via `attach://`.
 * exported for testing.
 */
export async function encodeRequest(
	params: Record<string, unknown> | undefined,
	readFile?: FileReader,
): Promise<EncodedRequest> {
	if (!params) return { body: undefined, contentType: "application/json" };

	// shallow-copy so resolving thenables below never mutates the caller's object
	params = { ...params };
	await resolveThenables(params);

	const uploads: { field: string; source: MediaSource }[] = [];
	const encoded = extractMedia(params, uploads) as Record<string, unknown>;

	if (uploads.length === 0) {
		return { body: JSON.stringify(encoded), contentType: "application/json" };
	}

	const form = new FormData();

	for (const [k, v] of Object.entries(encoded)) {
		if (v === undefined || v === null) continue;

		form.set(k, typeof v === "string" ? v : JSON.stringify(v));
	}

	for (const { field, source } of uploads) {
		const { blob, filename } = await mediaToBlob(source, readFile);
		form.set(field, blob, filename);
	}

	return { body: form };
}

/** builds a callable API client with before/after/error hooks. */
export function createApi(token: string, options: ApiOptions = {}): Api {
	const apiRoot = options.apiRoot ?? "https://api.telegram.org";
	const beforeHooks: BeforeHook[] = [];
	const afterHooks: AfterHook[] = [];
	const errorHooks: ErrorHook[] = [];

	const rawCall = async <T>(
		method: string,
		params?: Record<string, unknown>,
		callOptions?: CallOptions,
	): Promise<T> => {
		const { body, contentType } = await encodeRequest(params, options.readFile);
		const res = await fetch(`${apiRoot}/bot${token}/${method}`, {
			method: "POST",
			// for multipart, let fetch set the content-type (with its boundary).
			headers: contentType ? { "content-type": contentType } : undefined,
			body,
			signal: callOptions?.signal,
		});

		let data: ApiResponse<T>;
		try {
			data = (await res.json()) as ApiResponse<T>;
		} catch {
			// a proxy/self-hosted server answered with something that isn't the JSON
			// envelope (e.g. an HTML 502) — surface the method + status, not a bare SyntaxError
			throw new HttpError(method, res.status, res.statusText);
		}

		if (!data.ok)
			throw new TelegramError(method, data.error_code, data.description, data.parameters);

		return data.result;
	};

	const call = async <T = unknown>(
		method: string,
		params?: Record<string, unknown>,
		callOptions?: CallOptions,
	): Promise<T> => {
		// split `format`/`fmt` results into text + entities wherever the schema allows
		// them, so every method — not just the ctx helpers — accepts formatted values.
		params = applyFormatFields(method, params);

		// ponytail: retry loop is bounded by the error hooks themselves (e.g. again caps
		// attempts). with no hook requesting a retry it throws on the first failure.
		for (let attempt = 1; ; attempt++) {
			let p = params;
			for (const hook of beforeHooks) {
				const next = await hook(method, p);
				if (next !== undefined) p = next;
			}

			try {
				let result = await rawCall<T>(method, p, callOptions);

				for (const hook of afterHooks) {
					const next = await hook(method, p, result);
					if (next !== undefined) result = next as Awaited<T>;
				}

				return result;
			} catch (error) {
				// a deliberate abort is a cancellation, not a failure — never offer it for retry
				if (callOptions?.signal?.aborted) throw error;

				let retry: ErrorAction | undefined;

				for (const hook of errorHooks) {
					const action = await hook(method, error, attempt, p);
					if (!retry && action?.retry) {
						retry = action;
					}
				}

				if (!retry) throw error;
				if (retry.delayMs) await new Promise((r) => setTimeout(r, retry.delayMs));
			}
		}
	};

	const registrar: Record<string, unknown> = {
		call,
		fileUrl: (filePath: string) => `${apiRoot}/file/bot${token}/${filePath}`,
		before(hook: BeforeHook) {
			beforeHooks.push(hook);
			return api;
		},
		after(hook: AfterHook) {
			afterHooks.push(hook);
			return api;
		},
		onError(hook: ErrorHook) {
			errorHooks.push(hook);
			return api;
		},
	};

	const api = new Proxy(registrar, {
		get(obj, prop) {
			// never materialise a fake Bot API method for `then` (or the promise machinery
			// would treat the api object as a thenable — `await api` fired a real request)
			// or for symbols (inspect/iterator probes; they can't be part of a URL anyway).
			if (typeof prop === "symbol" || prop === "then") return Reflect.get(obj, prop);
			if (prop in obj) return obj[prop];

			// lazily materialise `api.<method>(params)` → call(method, params).
			const method = (params?: Record<string, unknown>) => call(prop, params);

			obj[prop] = method;
			return method;
		},
	}) as unknown as Api;

	return api;
}

/**
 * a per-update view of an api that offers each call to a webhook-reply envelope
 * first: the one call the envelope claims becomes the webhook's HTTP response
 * (its promise resolves `true` — telegram doesn't send back a result); everything
 * else falls through to the real client, hooks and retries included. calls that
 * carry uploads are never offered — a webhook reply must be plain JSON.
 */
export function withReplyEnvelope(api: Api, envelope: WebhookReplyEnvelope): Api {
	const call = async <T = unknown>(
		method: string,
		params?: Record<string, unknown>,
		callOptions?: CallOptions,
	): Promise<T> => {
		// mirror the client's own encoding (fmt fields, media → wire form) so the
		// claimed params serialize exactly like a normal request body would.
		const formatted = applyFormatFields(method, params);
		const uploads: { field: string; source: MediaSource }[] = [];
		const encoded = extractMedia(formatted, uploads) as Record<string, unknown> | undefined;

		if (uploads.length === 0 && envelope.claim(method, encoded)) return true as T;

		return api.call<T>(method, params, callOptions);
	};

	const view: Record<string | symbol, unknown> = { call };

	return new Proxy(view, {
		get(obj, prop) {
			if (typeof prop === "symbol" || prop === "then") return Reflect.get(obj, prop);
			if (prop in obj) return obj[prop];
			// hook registration and fileUrl belong to the underlying client.
			if (prop === "fileUrl" || prop === "before" || prop === "after" || prop === "onError") {
				return (api as unknown as Record<string, unknown>)[prop];
			}

			const method = (params?: Record<string, unknown>) => call(prop, params);

			obj[prop] = method;
			return method;
		},
	}) as unknown as Api;
}
