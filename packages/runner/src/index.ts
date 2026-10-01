import type { Update } from "@yaebal/types";

/**
 * @yaebal/runner — drives a bot with CONCURRENT update processing instead of the
 * built-in sequential long-poll. updates that share a key (the chat id, by
 * default) still run strictly in order, so per-chat state (sessions) stays safe;
 * unrelated chats run in parallel up to `concurrency`.
 */

export interface Scheduler {
	/** queue a task. tasks with the same non-null `key` run in submit order, never overlapping. */
	submit(key: PropertyKey | undefined, task: () => Promise<void>): void;
	/** resolves once nothing is queued or running. */
	idle(): Promise<void>;
	/** resolves once fewer than `n` tasks are queued or running (backpressure gate). */
	whenBelow(n: number): Promise<void>;
	/** tasks currently queued or running. */
	size(): number;
}

/** a bounded-concurrency scheduler with optional per-key sequentialization. */
export function createScheduler(concurrency: number): Scheduler {
	if (!Number.isInteger(concurrency) || concurrency <= 0) {
		throw new RangeError("concurrency must be a positive integer");
	}
	let active = 0;
	let pending = 0;

	const slotWaiters: (() => void)[] = [];
	const idleWaiters: (() => void)[] = [];
	const belowWaiters: { n: number; resolve: () => void }[] = [];
	const tails = new Map<PropertyKey, Promise<void>>();

	const acquire = () =>
		new Promise<void>((resolve) => {
			if (active < concurrency) {
				active++;
				resolve();
			} else {
				slotWaiters.push(() => {
					active++;
					resolve();
				});
			}
		});

	const release = () => {
		active--;
		slotWaiters.shift()?.();
	};

	const settle = () => {
		pending--;

		if (pending === 0) for (const f of idleWaiters.splice(0)) f();

		for (let i = belowWaiters.length - 1; i >= 0; i--) {
			const w = belowWaiters[i];

			if (w && pending < w.n) {
				belowWaiters.splice(i, 1);
				w.resolve();
			}
		}
	};

	const runTask = async (task: () => Promise<void>) => {
		await acquire();

		try {
			await task();
		} catch {
			// tasks are expected to handle their own errors (the runner wraps handleUpdate)
		} finally {
			release();
			settle();
		}
	};

	return {
		submit(key, task) {
			pending++;

			if (key == null) {
				void runTask(task);
				return;
			}

			const prev = tails.get(key) ?? Promise.resolve();
			const next = prev.then(
				() => runTask(task),
				() => runTask(task),
			);

			tails.set(key, next);
			void next.finally(() => {
				if (tails.get(key) === next) tails.delete(key);
			});
		},
		idle() {
			return pending === 0
				? Promise.resolve()
				: new Promise((resolve) => idleWaiters.push(resolve));
		},
		whenBelow(n) {
			return pending < n
				? Promise.resolve()
				: new Promise((resolve) => belowWaiters.push({ n, resolve }));
		},
		size() {
			return pending;
		},
	};
}

/** extract the default sequentialization key (chat id, falling back to the actor's user id). */
export function chatKey(update: Update): number | undefined {
	const scoped =
		update.message ??
		update.edited_message ??
		update.channel_post ??
		update.edited_channel_post ??
		update.business_message ??
		update.edited_business_message ??
		update.guest_message ??
		update.stopped_message_generation ??
		update.deleted_business_messages ??
		update.callback_query?.message ??
		update.message_reaction ??
		update.message_reaction_count ??
		update.my_chat_member ??
		update.chat_member ??
		update.chat_join_request ??
		update.chat_boost ??
		update.removed_chat_boost;

	const chatId = scoped?.chat?.id;
	if (chatId != null) return chatId;

	return (
		update.callback_query?.from?.id ??
		update.inline_query?.from?.id ??
		update.chosen_inline_result?.from?.id ??
		update.shipping_query?.from?.id ??
		update.pre_checkout_query?.from?.id ??
		update.purchased_paid_media?.from?.id ??
		update.poll_answer?.user?.id ??
		update.poll_answer?.voter_chat?.id ??
		update.business_connection?.user?.id ??
		undefined
	);
}

export interface RunnerBot {
	api: {
		getUpdates(
			params?: Record<string, unknown>,
			options?: { signal?: AbortSignal },
		): Promise<Update[]>;
	};
	handleUpdate(update: Update): Promise<void>;
}

export interface RunnerOptions {
	/** max updates processed at once. defaults to 50. */
	concurrency?: number;
	/** map an update to a key whose updates must stay ordered. defaults to chat id. `undefined` = no ordering. */
	sequentializeBy?: (update: Update) => PropertyKey | undefined;
	/** getUpdates batch size. defaults to 100. */
	limit?: number;
	/** long-poll timeout (seconds). defaults to 30. */
	timeout?: number;
	/** restrict update types (telegram `allowed_updates`). */
	allowedUpdates?: string[];
	/** called on a handler or polling error. */
	onError?: (error: unknown, update?: Update) => void;
}

export interface RunnerHandle {
	/** stop polling and wait for in-flight updates to drain. */
	stop(): Promise<void>;
}

/** sleep, cut short by `signal` so `stop()` never waits out a retry backoff. */
const delay = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		if (signal.aborted) return resolve();

		const done = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", done);
			resolve();
		};

		const timer = setTimeout(done, ms);
		signal.addEventListener("abort", done, { once: true });
	});

/** start driving `bot` concurrently. returns a handle whose `stop()` drains in-flight work. */
export function run(bot: RunnerBot, options: RunnerOptions = {}): RunnerHandle {
	const concurrency = options.concurrency ?? 50;
	const seqBy = options.sequentializeBy ?? chatKey;
	const scheduler = createScheduler(concurrency);
	// aborts the in-flight long poll (and any retry backoff) so stop() returns promptly
	// instead of waiting out the full `timeout` window.
	const abort = new AbortController();

	let stopped = false;
	let offset = 0;

	const safe = async (update: Update) => {
		try {
			await bot.handleUpdate(update);
		} catch (error) {
			options.onError?.(error, update);
		}
	};

	const loop = async () => {
		while (!stopped) {
			if (scheduler.size() >= concurrency) await scheduler.whenBelow(concurrency);
			if (stopped) break;

			let updates: Update[];
			try {
				updates = await bot.api.getUpdates(
					{
						offset,
						limit: options.limit ?? 100,
						timeout: options.timeout ?? 30,
						...(options.allowedUpdates ? { allowed_updates: options.allowedUpdates } : {}),
					},
					{ signal: abort.signal },
				);
			} catch (error) {
				if (stopped) break;

				options.onError?.(error);
				await delay(3000, abort.signal);

				continue;
			}

			for (const update of updates) {
				offset = update.update_id + 1;
				scheduler.submit(seqBy(update), () => safe(update));
			}
		}
	};

	const loopDone = loop();

	return {
		async stop() {
			stopped = true;
			abort.abort();
			await loopDone;
			await scheduler.idle();
		},
	};
}
