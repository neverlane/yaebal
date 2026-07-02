/**
 * a virtual clock: overrides `Date.now`, `setTimeout`/`clearTimeout`, and
 * `setInterval`/`clearInterval` so TTL / retry-delay / debounce code under test
 * can be advanced instantly instead of waited on for real. installs globally
 * for the lifetime of the clock; always `.restore()` when done (or let
 * {@link TestEnv.shutdown} do it for you).
 */
export interface TestClock {
	/** the clock's current virtual time, in ms since epoch. */
	now(): number;
	/** advance the clock by `ms`, firing every timer whose deadline falls inside the window (in deadline order). intervals re-arm and may fire multiple times. */
	advance(ms: number): Promise<void>;
	/** uninstall — restores the real `Date.now`/`setTimeout`/`setInterval`. */
	restore(): void;
}

interface Timer {
	id: number;
	due: number;
	interval: number | undefined; // undefined = one-shot (setTimeout)
	fn: (...args: unknown[]) => void;
	args: unknown[];
	cancelled: boolean;
}

/**
 * install a virtual clock, overriding the global timer functions. `startAt`
 * defaults to the real current time so unrelated `Date.now()` reads (e.g. log
 * timestamps) stay plausible.
 */
export function installTestClock(startAt: number = Date.now()): TestClock {
	const realDateNow = Date.now;
	const realSetTimeout = globalThis.setTimeout;
	const realClearTimeout = globalThis.clearTimeout;
	const realSetInterval = globalThis.setInterval;
	const realClearInterval = globalThis.clearInterval;

	let now = startAt;
	let nextId = 1;
	const timers = new Map<number, Timer>();

	const schedule = (
		fn: (...args: unknown[]) => void,
		delay: number,
		interval: number | undefined,
		args: unknown[],
	): number => {
		const id = nextId++;
		timers.set(id, {
			id,
			due: now + Math.max(0, delay || 0),
			interval,
			fn,
			args,
			cancelled: false,
		});
		return id;
	};

	Date.now = () => now;

	globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) =>
		schedule(fn, delay ?? 0, undefined, args)) as unknown as typeof setTimeout;

	globalThis.clearTimeout = ((id?: number | ReturnType<typeof setTimeout>) => {
		if (typeof id === "number") timers.delete(id);
	}) as unknown as typeof clearTimeout;

	globalThis.setInterval = ((
		fn: (...args: unknown[]) => void,
		delay?: number,
		...args: unknown[]
	) => schedule(fn, delay ?? 0, delay ?? 0, args)) as unknown as typeof setInterval;

	globalThis.clearInterval = ((id?: number | ReturnType<typeof setInterval>) => {
		if (typeof id === "number") timers.delete(id);
	}) as unknown as typeof clearInterval;

	async function advance(ms: number): Promise<void> {
		const target = now + ms;

		for (;;) {
			let next: Timer | undefined;

			for (const timer of timers.values()) {
				if (timer.due > target) continue;
				if (!next || timer.due < next.due || (timer.due === next.due && timer.id < next.id)) {
					next = timer;
				}
			}

			if (!next) break;

			now = next.due;

			if (next.interval === undefined) {
				timers.delete(next.id);
			} else {
				next.due = now + Math.max(1, next.interval);
			}

			await next.fn(...next.args);
		}

		now = target;
	}

	function restore(): void {
		Date.now = realDateNow;
		globalThis.setTimeout = realSetTimeout;
		globalThis.clearTimeout = realClearTimeout;
		globalThis.setInterval = realSetInterval;
		globalThis.clearInterval = realClearInterval;
		timers.clear();
	}

	return { now: () => now, advance, restore };
}
