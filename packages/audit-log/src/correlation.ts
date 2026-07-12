/** what every `api.*` event fired while an update is being handled inherits from that
 * update — the correlation this whole module exists to thread through the async call
 * chain that core's `before`/`after`/`onError` hooks otherwise have no way to see. */
export interface CorrelationStore {
	updateId: number;
	correlationId: string;
	chatId?: number;
	userId?: number;
}

// type-only reference — never a static import, so this stays inert (not an error) on
// runtimes without `node:async_hooks`; only `ensureAls`'s dynamic `import()` touches it
// at runtime, and only once, lazily.
type ALS<T> = import("node:async_hooks").AsyncLocalStorage<T>;

let als: ALS<CorrelationStore> | undefined;
let alsReady: Promise<void> | undefined;

/** resolve `node:async_hooks` once (memoized) — `undefined` forever after on a runtime
 * that doesn't have it (most edge/worker runtimes), where correlation degrades
 * gracefully to `undefined` ids instead of throwing. */
function ensureAls(): Promise<void> {
	alsReady ??= import("node:async_hooks")
		.then((mod) => {
			als = new mod.AsyncLocalStorage<CorrelationStore>();
		})
		.catch(() => {
			als = undefined;
		});

	return alsReady;
}

/** run `fn` with `store` attached as the current correlation context — every `api.*`
 * hook invoked synchronously or asynchronously downstream of `fn` can read it back via
 * {@link currentCorrelation}. a no-op passthrough (no correlation available) if
 * `node:async_hooks` doesn't resolve. */
export async function runWithCorrelation<T>(
	store: CorrelationStore,
	fn: () => Promise<T>,
): Promise<T> {
	await ensureAls();
	return als ? als.run(store, fn) : fn();
}

/** the correlation store for the update currently being handled, if any — `undefined`
 * outside of update handling (e.g. a call made from `bot.onStart`, a cron job, or
 * before the first update has resolved `node:async_hooks`). */
export function currentCorrelation(): CorrelationStore | undefined {
	return als?.getStore();
}

/** a short, dependency-free correlation id: `crypto.randomUUID()` where available
 * (every runtime yaebal targets, Node >= 20 included), else a timestamp+random
 * fallback. collision risk is irrelevant for log correlation. */
export function newCorrelationId(): string {
	const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

interface CallTracking {
	callId: string;
	attempt: number;
	start: number;
}

// keyed by the `params` object reference a before-hook sees: core's retry loop reuses
// the same outer `params` object across every attempt of one logical call (it's derived
// once, before the retry loop starts — see packages/core/src/api.ts), so this recovers a
// per-call identity + latency the hooks themselves are never given. two caveats, both
// documented in the README: a plugin installed *before* audit-log that returns a new
// params object from its own before-hook breaks the reference this relies on (install
// audit-log last for the tightest correlation), and a caller that reuses one literal
// `params` object across unrelated `call()`s will have those calls share an identity.
const callTracking = new WeakMap<Record<string, unknown>, CallTracking>();

/** call from the `api.before` hook: returns a stable `callId` for this logical call
 * (the same id on every retry attempt) plus the 1-based attempt number. `params ===
 * undefined` (a no-arg method, e.g. `getMe`) has no stable key to track against — every
 * attempt looks like attempt 1 of a fresh call. */
export function beginCall(params: Record<string, unknown> | undefined): {
	callId: string;
	attempt: number;
} {
	if (params === undefined) return { callId: newCorrelationId(), attempt: 1 };

	const existing = callTracking.get(params);
	if (existing) {
		existing.attempt += 1;
		return { callId: existing.callId, attempt: existing.attempt };
	}

	const tracking: CallTracking = { callId: newCorrelationId(), attempt: 1, start: Date.now() };
	callTracking.set(params, tracking);
	return { callId: tracking.callId, attempt: 1 };
}

/** call from `api.after`/`api.onError`: closes out the tracking {@link beginCall}
 * opened, returning the call's total elapsed time across every attempt. `undefined` if
 * `params` has no tracked entry (a no-arg method, or the reference broke — see {@link
 * beginCall}'s caveats). */
export function endCall(
	params: Record<string, unknown> | undefined,
): { callId: string; durationMs: number } | undefined {
	if (params === undefined) return undefined;

	const tracking = callTracking.get(params);
	if (!tracking) return undefined;

	callTracking.delete(params);
	return { callId: tracking.callId, durationMs: Date.now() - tracking.start };
}
