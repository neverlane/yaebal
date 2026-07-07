import { AsyncLocalStorage } from "node:async_hooks";

/** every error morda throws on purpose — catchable as one family. */
export class MordaError extends Error {
	constructor(message: string) {
		super(`morda: ${message}`);
		this.name = "MordaError";
	}
}

// ── intent ids ───────────────────────────────────────────────────────────────

const COUNTER_SPACE = 36 ** 3; // 3 base36 chars of monotonic counter
const TIME_SPACE = 36 ** 6; // ~25 days of millisecond resolution

// random start so ids from different process runs are unlikely to collide.
let counter = Math.floor(Math.random() * COUNTER_SPACE);

/**
 * short dialog-instance id: 6 base36 chars of time + 3 of counter (9 bytes on
 * the wire). the counter makes two ids minted in the same millisecond differ —
 * stale-press detection relies on that; the time prefix keeps ids distinct
 * across restarts.
 */
export function shortId(): string {
	counter = (counter + 1) % COUNTER_SPACE;
	const time = (Date.now() % TIME_SPACE).toString(36).padStart(6, "0");
	return time + counter.toString(36).padStart(3, "0");
}

// ── keyed reentrant mutex ────────────────────────────────────────────────────

/**
 * serializes work per state key so concurrent updates (webhook mode, runners
 * with cross-chat concurrency) can't interleave read-modify-write on the same
 * dialog. reentrant via AsyncLocalStorage: control calls made *inside* a locked
 * section (e.g. `ctx.dialog.push()` from a button's `onClick`) run in place
 * instead of deadlocking. single-process only — multi-process deployments need
 * sticky routing per chat (or an external queue), same as every dialog engine.
 */
export class KeyedLock {
	#tails = new Map<string, Promise<unknown>>();
	#held = new AsyncLocalStorage<Set<string>>();

	async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
		const held = this.#held.getStore();
		if (held?.has(key)) return fn(); // reentrant: already inside this key's section

		const previous = this.#tails.get(key) ?? Promise.resolve();
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		this.#tails.set(key, gate);

		await previous.catch(() => {}); // wait our turn; a predecessor's crash is not ours
		try {
			return await this.#held.run(new Set(held).add(key), fn);
		} finally {
			release();
			if (this.#tails.get(key) === gate) this.#tails.delete(key);
		}
	}
}

// ── telegram error shapes ────────────────────────────────────────────────────

/**
 * `400: message is not modified` — telegram's answer to a no-op edit. expected
 * (a refresh button when nothing changed), never "edit failed, resend".
 */
export function isNotModified(error: unknown): boolean {
	return /not modified/i.test(describeError(error));
}

function describeError(error: unknown): string {
	const e = error as {
		message?: string;
		description?: string;
		payload?: { description?: string };
	};
	return String(e?.message ?? e?.description ?? e?.payload?.description ?? error);
}

// ── limits ───────────────────────────────────────────────────────────────────

export const MAX_TEXT = 4096;
export const MAX_CAPTION = 1024;
export const MAX_COMMIT_PASSES = 5;
