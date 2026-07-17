import { AiError } from "./model.js";

/** `"20/h"`, `"5/m"`, `"100/d"`, `"1/s"` — count per window. */
export type RateSpec = `${number}/${"s" | "m" | "h" | "d"}`;

const WINDOW_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export interface ParsedRate {
	count: number;
	windowMs: number;
}

export function parseRate(spec: RateSpec): ParsedRate {
	const match = /^(\d+)\/([smhd])$/.exec(spec);
	const count = match === null ? Number.NaN : Number(match[1]);
	if (match === null || !Number.isInteger(count) || count < 1) {
		throw new AiError(`ai: invalid rate spec "${spec}" — expected e.g. "20/h", "5/m"`);
	}
	return { count, windowMs: WINDOW_MS[match[2] as keyof typeof WINDOW_MS] };
}

/** thrown when a per-user limit is exhausted. `retryAfterMs` says when the window frees up. */
export class AiLimitError extends AiError {
	readonly retryAfterMs: number;

	constructor(retryAfterMs: number) {
		super(
			`ai: rate limit exhausted, retry in ${Math.ceil(retryAfterMs / 1000)}s (catch AiLimitError to answer politely)`,
		);
		this.name = "AiLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}

/** sliding-window counter, in-process. one instance per bot; keys are user ids. */
export interface RateLimiter {
	/** consume one slot for `key`, or throw {@link AiLimitError}. */
	take(key: string | number): void;
}

export function createRateLimiter(spec: RateSpec, now: () => number = Date.now): RateLimiter {
	const { count, windowMs } = parseRate(spec);
	const hits = new Map<string, number[]>();

	return {
		take(key) {
			const id = String(key);
			const at = now();
			const floor = at - windowMs;
			const kept = (hits.get(id) ?? []).filter((t) => t > floor);

			if (kept.length >= count) {
				const oldest = kept[0] ?? at;
				hits.set(id, kept);
				throw new AiLimitError(oldest + windowMs - at);
			}

			kept.push(at);
			hits.set(id, kept);
		},
	};
}
