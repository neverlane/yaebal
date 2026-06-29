import { type MediaSource, isMediaSource } from "./media.js";
import type { ApiResponse, Message, Update, User } from "./telegram-types.js";

/**
 * resolve a local `media.path()` into bytes. runtime-specific (node:fs, Bun.file,
 * Deno.readFile), so it's injected rather than imported — that keeps `@yaebal/core`
 * free of any `node:` import and loadable on edge/web. the `yaebal` package wires an
 * auto-detecting default; absent ⇒ `media.path()` throws (e.g. on Cloudflare Workers).
 */
export type FileReader = (path: string) => Promise<Uint8Array>;

/** thrown when telegram replies with `ok: false`. */
export class TelegramError extends Error {
	readonly method: string;
	readonly code: number;

	constructor(method: string, code: number, description: string) {
		super(`[${method}] ${code}: ${description}`);

		this.name = "TelegramError";
		this.method = method;
		this.code = code;
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
) => ErrorAction | undefined | Promise<ErrorAction | undefined>;

/**
 * the API client. known methods are typed; everything else goes through `call`
 * (the puregram passthrough — a new Bot API method works before its types ship).
 * `before` / `after` / `onError` are the extension points plugins hang off of.
 */
export interface Api {
	call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
	getMe(): Promise<User>;
	getUpdates(params?: Record<string, unknown>): Promise<Update[]>;
	sendMessage(params: Record<string, unknown>): Promise<Message>;
	answerCallbackQuery(params: Record<string, unknown>): Promise<boolean>;
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
	apiRoot?: string;
	/** resolve `media.path()` to bytes. injected per runtime; absent ⇒ path media throws (e.g. edge). */
	readFile?: FileReader;
}

interface EncodedRequest {
	body: string | FormData | undefined;
	contentType?: string;
}

function containsMedia(v: unknown): boolean {
	if (isMediaSource(v)) return true;
	if (Array.isArray(v)) return v.some(containsMedia);
	if (v !== null && typeof v === "object") return Object.values(v).some(containsMedia);

	return false;
}

/** basename without node:path — keeps core free of node: imports. */
const baseName = (p: string): string => p.split(/[\\/]/).pop() || "file";
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	return copy.buffer;
};

async function mediaToBlob(
	m: MediaSource,
	readFile?: FileReader,
): Promise<{ blob: Blob; filename: string }> {
	if (m.kind === "path") {
		if (!readFile)
			throw new Error(
				"media.path() needs a filesystem — use the `yaebal` package (auto-detects node/bun/deno), " +
				"pass `readFile` to the Bot, or send media.buffer()/url() instead (e.g. on edge).",
			);

		const bytes = await readFile(m.path);
		return { blob: new Blob([toArrayBuffer(bytes)]), filename: baseName(m.path) };
	}

	if (m.kind === "buffer") {
		return { blob: new Blob([toArrayBuffer(m.buffer)]), filename: m.filename ?? "file" };
	}

	throw new Error(`mediaToBlob: ${m.kind} is not an uploadable source`);
}

/**
 * encode request params. Plain params (and `url`/`fileId` media) go as JSON;
 * if any `path`/`buffer` media is present the whole request becomes multipart,
 * with each upload attached via `attach://`. exported for testing.
 */
type Thenable<T> = { then: (resolve: (value: T) => unknown) => unknown };

function isThenable(v: unknown): v is Thenable<unknown> {
	return typeof v === "object" && v !== null && "then" in v;
}

async function resolveThenables(
	params: Record<string, unknown>,
): Promise<void> {
	for (const key of Object.keys(params)) {
		const v = params[key];
		if (isThenable(v)) params[key] = await v;
	}
}

export async function encodeRequest(
	params: Record<string, unknown> | undefined,
	readFile?: FileReader,
): Promise<EncodedRequest> {
	if (!params) return { body: undefined, contentType: "application/json" };

	await resolveThenables(params);

	// ponytail: media is only handled at the top level. media nested inside arrays
	// or objects (e.g. sendMediaGroup's `media[]`) would serialize to garbage, so
	// fail loud until that method is actually supported.
	if (Object.values(params).some((v) => !isMediaSource(v) && containsMedia(v))) {
		throw new Error(
			"encodeRequest: nested MediaSource (e.g. inside sendMediaGroup) is not supported yet — pass media as a top-level param",
		);
	}

	const needsUpload = Object.values(params).some(
		(v) => isMediaSource(v) && (v.kind === "path" || v.kind === "buffer"),
	);

	if (!needsUpload) {
		const inlined: Record<string, unknown> = {};

		for (const [k, v] of Object.entries(params)) {
			inlined[k] = isMediaSource(v)
				? v.kind === "url"
					? v.url
					: (v as { fileId: string }).fileId
				: v;
		}

		return { body: JSON.stringify(inlined), contentType: "application/json" };
	}

	const form = new FormData();
	let n = 0;

	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === null) continue;

		if (isMediaSource(v)) {
			if (v.kind === "fileId") form.set(k, v.fileId);
			else if (v.kind === "url") form.set(k, v.url);
			else {
				const field = `_file${n++}`;
				const { blob, filename } = await mediaToBlob(v, readFile);

				form.set(field, blob, filename);
				form.set(k, `attach://${field}`);
			}
		} else if (typeof v === "string") {
			form.set(k, v);
		} else {
			form.set(k, JSON.stringify(v));
		}
	}

	return { body: form };
}

/** builds a callable API client with before/after/error hooks. */
export function createApi(token: string, options: ApiOptions = {}): Api {
	const apiRoot = options.apiRoot ?? "https://api.telegram.org";
	const beforeHooks: BeforeHook[] = [];
	const afterHooks: AfterHook[] = [];
	const errorHooks: ErrorHook[] = [];

	const rawCall = async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
		const { body, contentType } = await encodeRequest(params, options.readFile);
		const res = await fetch(`${apiRoot}/bot${token}/${method}`, {
			method: "POST",
			// for multipart, let fetch set the content-type (with its boundary).
			headers: contentType ? { "content-type": contentType } : undefined,
			body,
		});

		const data = (await res.json()) as ApiResponse<T>;
		if (!data.ok) throw new TelegramError(method, data.error_code, data.description);

		return data.result;
	};

	const call = async <T = unknown>(
		method: string,
		params?: Record<string, unknown>,
	): Promise<T> => {
		let p = params;
		for (const hook of beforeHooks) {
			const next = await hook(method, p);
			if (next !== undefined) p = next;
		}

		// ponytail: retry loop is bounded by the error hooks themselves (e.g. again caps
		// attempts). with no hook requesting a retry it throws on the first failure.
		for (let attempt = 1; ; attempt++) {
			try {
				let result = await rawCall<T>(method, p);

			for (const hook of afterHooks) {
				const next = await hook(method, p, result);
				if (next !== undefined) result = next as Awaited<T>;
			}

				return result;
			} catch (error) {
				let retry: ErrorAction | undefined;

				for (const hook of errorHooks) {
					const action = await hook(method, error, attempt);
					if (action?.retry) {
						retry = action;
						break;
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
		get(obj, prop: string) {
			if (prop in obj) return obj[prop];

			// lazily materialise `api.<method>(params)` → call(method, params).
			const method = (params?: Record<string, unknown>) => call(prop, params);
			
			obj[prop] = method;
			return method;
		},
	}) as unknown as Api;

	return api;
}
