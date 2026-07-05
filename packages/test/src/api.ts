import {
	type AfterHook,
	type Api,
	type BeforeHook,
	type ErrorAction,
	type ErrorHook,
	type ResponseParameters,
	TelegramError,
} from "@yaebal/core";
import { normalizeParams } from "./normalize.js";

/** a single recorded api call: the method, the params it was given, and how it resolved. */
export interface RecordedCall {
	method: string;
	params: Record<string, unknown> | undefined;
	/** the resolved result, if the call succeeded. */
	result?: unknown;
	/** the thrown error, if the call failed (and no `onError` hook rescued it). */
	error?: unknown;
	/** ms since epoch when the call was made — honors an installed {@link TestClock}. */
	at: number;
}

/** a canned result for one method: a static value, an {@link ApiErrorSentinel}/`Error`, or a function of `(params, attempt)`. */
export type MockResult =
	| unknown
	| Error
	| ApiErrorSentinel
	| ((params: Record<string, unknown> | undefined, attempt: number) => unknown);

/** the shape `apiError(...)` returns — a sentinel telling the mock to throw a {@link TestApiError}. */
export interface ApiErrorSentinel {
	readonly __yaebalApiError: true;
	code: number;
	description: string;
	parameters?: ResponseParameters;
}

/**
 * simulate a real Telegram Bot API error response — the bot sees exactly what it would see
 * from the real api: a thrown {@link TestApiError} (a {@link TelegramError} subclass).
 *
 * @example
 * env.onApi("sendMessage", apiError(403, "Forbidden: bot was blocked by the user"));
 * env.onApi("sendMessage", apiError(429, "Too Many Requests", { retry_after: 30 }));
 */
export function apiError(
	code: number,
	description: string,
	parameters?: ResponseParameters,
): ApiErrorSentinel {
	return { __yaebalApiError: true, code, description, parameters };
}

/** typeguard for a stored `apiError(...)` sentinel. */
export function isApiErrorSentinel(value: unknown): value is ApiErrorSentinel {
	return typeof value === "object" && value !== null && "__yaebalApiError" in value;
}

/** a {@link TelegramError} carrying the optional `parameters` bag (e.g. `retry_after`) real errors ship. */
export class TestApiError extends TelegramError {}

/** options accepted by `{ times }` overrides: one-shot (or N-shot) replies. */
export interface OnApiOptions {
	/** consume this override for exactly `times` calls, then fall back to the next queued/permanent reply. default: permanent (never expires). */
	times?: number;
}

export interface MockApiOptions {
	/** per-method canned results/errors, keyed by method name — seeds the permanent override, same as calling `onApi(method, result)` for each entry. */
	results?: Record<string, MockResult>;
	/** throw instead of falling back to `{}` when a method has no builtin default and no override registered. catches "forgot to stub this" in tests that care. default `false`. */
	strictApi?: boolean;
	/** clock to timestamp recorded calls with; defaults to the real `Date.now`. */
	now?: () => number;
}

/** result of {@link mockApi}: the fake `api`, its recorded calls, and inspection/stubbing helpers. */
export interface MockApi {
	api: Api;
	calls: RecordedCall[];
	/** hooks registered on `api` via `before`/`after`/`onError` — inspect them or invoke them yourself. */
	hooks: { before: BeforeHook[]; after: AfterHook[]; onError: ErrorHook[] };
	/** the most recent recorded call, optionally filtered to a method. */
	lastCall(method?: string): RecordedCall | undefined;
	/** every recorded call to a given method, in call order. */
	callsTo(method: string): RecordedCall[];
	/** override a method's reply. permanent unless `opts.times` is given (then it's consumed after `times` calls and the previous permanent, if any, resumes). */
	onApi(method: string, reply: MockResult, opts?: OnApiOptions): void;
	/** drop a method's overrides (or every method's, if none given) — reverts to the builtin default. */
	offApi(method?: string): void;
	/** clear recorded calls and per-method attempt counters. keeps hooks and overrides. */
	reset(): void;
}

/** default results for known methods; everything else resolves to `{}` (or throws, with `strictApi`). */
const STUBBED_METHODS = new Set(["getMe", "answerCallbackQuery"]);

function builtinResult(method: string, nextMessageId: () => number): unknown {
	if (method.startsWith("send") || method === "copyMessage" || method === "forwardMessage") {
		return { message_id: nextMessageId() };
	}

	if (method === "answerCallbackQuery") return true;
	if (method === "getMe") return { id: 1, is_bot: true, first_name: "bot", username: "bot" };

	return {};
}

function hasBuiltin(method: string): boolean {
	return (
		method.startsWith("send") ||
		method === "copyMessage" ||
		method === "forwardMessage" ||
		STUBBED_METHODS.has(method)
	);
}

interface QueuedReply {
	reply: MockResult;
	remaining: number;
}

interface MethodOverride {
	queue: QueuedReply[];
	permanent?: MockResult;
}

/**
 * a fake {@link Api} whose every method records `{ method, params, result | error, at }` into
 * `calls` and resolves to a sensible default (auto-incrementing `message_id` for `send*`, `true`
 * for `answerCallbackQuery`, `{}` otherwise) — or to whatever `onApi`/`options.results` says.
 * `before`/`after`/`onError` are real hook registrars (not no-ops): register a hook the same way
 * you would on the production `Api` and it actually runs on each attempt, including retries requested by an
 * `onError` hook. the mock never actually waits on a requested `delayMs` — retries settle
 * instantly, so tests stay fast (pair with {@link installTestClock} if the code under test
 * schedules the retry itself via `setTimeout`).
 */
export function mockApi(options: MockApiOptions = {}): MockApi {
	const calls: RecordedCall[] = [];
	const overrides = new Map<string, MethodOverride>();
	const attempts = new Map<string, number>();
	const now = options.now ?? (() => Date.now());
	let nextMessageId = 1;

	for (const [method, reply] of Object.entries(options.results ?? {})) {
		overrides.set(method, { queue: [], permanent: reply });
	}

	const hooks = {
		before: [] as BeforeHook[],
		after: [] as AfterHook[],
		onError: [] as ErrorHook[],
	};

	function resolveReply(method: string, params: Record<string, unknown> | undefined): unknown {
		const attempt = (attempts.get(method) ?? 0) + 1;
		attempts.set(method, attempt);

		const override = overrides.get(method);
		let reply: MockResult | undefined;

		if (override?.queue.length) {
			const head = override.queue[0] as QueuedReply;
			head.remaining--;
			reply = head.reply;
			if (head.remaining <= 0) override.queue.shift();
		} else if (override && "permanent" in override) {
			reply = override.permanent;
		} else if (options.strictApi && !hasBuiltin(method)) {
			throw new Error(
				`mockApi: no stub for "${method}" — register one with onApi("${method}", ...), or disable strictApi`,
			);
		} else {
			return builtinResult(method, () => nextMessageId++);
		}

		if (typeof reply === "function") {
			return (reply as (p: typeof params, a: number) => unknown)(params, attempt);
		}

		if (isApiErrorSentinel(reply)) {
			return new TestApiError(method, reply.code, reply.description, reply.parameters);
		}

		return reply;
	}

	const call = async (method: string, rawParams?: Record<string, unknown>): Promise<never> => {
		for (let attempt = 1; ; attempt++) {
			let p = normalizeParams(rawParams);
			for (const hook of hooks.before) {
				const next = await hook(method, p);
				if (next !== undefined) p = next;
			}

			let result: unknown;

			try {
				result = resolveReply(method, p);
				if (result instanceof Error) throw result;
			} catch (error) {
				let retry: ErrorAction | undefined;
				for (const hook of hooks.onError) {
					const action = await hook(method, error, attempt, p);
					if (!retry && action?.retry) {
						retry = action;
					}
				}

				calls.push({ method, params: p, error, at: now() });
				if (!retry) throw error;
				continue; // the mock never actually waits on retry.delayMs
			}

			for (const hook of hooks.after) {
				const next = await hook(method, p, result);
				if (next !== undefined) result = next;
			}

			calls.push({ method, params: p, result, at: now() });
			return result as never;
		}
	};

	const registrar: Record<string, unknown> = {
		call: (method: string, params?: Record<string, unknown>) => call(method, params),
		fileUrl: (filePath: string) => `https://example.invalid/file/${filePath}`,
		before(hook: BeforeHook) {
			hooks.before.push(hook);
			return api;
		},
		after(hook: AfterHook) {
			hooks.after.push(hook);
			return api;
		},
		onError(hook: ErrorHook) {
			hooks.onError.push(hook);
			return api;
		},
	};

	const api = new Proxy(registrar, {
		get(obj, prop: string) {
			if (prop in obj) return obj[prop];

			const method = (params?: Record<string, unknown>) => call(prop, params);
			obj[prop] = method;

			return method;
		},
	}) as unknown as Api;

	return {
		api,
		calls,
		hooks,
		lastCall: (method) =>
			method ? [...calls].reverse().find((c) => c.method === method) : calls.at(-1),
		callsTo: (method) => calls.filter((c) => c.method === method),
		onApi: (method, reply, opts) => {
			const entry = overrides.get(method) ?? { queue: [] };
			if (opts?.times !== undefined) entry.queue.push({ reply, remaining: opts.times });
			else entry.permanent = reply;
			overrides.set(method, entry);
		},
		offApi: (method) => {
			if (method) overrides.delete(method);
			else overrides.clear();
		},
		reset: () => {
			calls.length = 0;
			attempts.clear();
			nextMessageId = 1;
		},
	};
}
