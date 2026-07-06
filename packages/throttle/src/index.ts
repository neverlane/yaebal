import { type Api, type BotPlugin, TelegramError } from "@yaebal/core";

export const GLOBAL_WINDOW_MS = 1_000;
export const PRIVATE_WINDOW_MS = 1_000;
export const GROUP_WINDOW_MS = 60_000;

export const DEFAULT_GLOBAL_PER_SEC = 30;
export const DEFAULT_PRIVATE_PER_SEC = 1;
export const DEFAULT_GROUP_PER_MIN = 20;

export const DEFAULT_EXCLUDED_METHODS = [
	"getMe",
	"getUpdates",
	"getWebhookInfo",
	"logOut",
	"close",
];

export const THROTTLE_CONTROL = Symbol.for("@yaebal/throttle/control");

export interface BucketLimit {
	/** number of calls allowed inside the window. */
	limit: number;
	/** rolling-window size in milliseconds. */
	windowMs: number;
}

export interface ThrottleBucket {
	key: string;
	limit: number;
	windowMs: number;
	weight?: number;
}

export interface ThrottleStorageResult {
	ok: boolean;
	waitMs: number;
	blockedBy?: string;
	resetAt?: number;
	remaining?: Record<string, number>;
}

export interface ThrottleStorageSnapshot {
	buckets: number;
	bucketSizes: Record<string, number>;
	frozenUntil: Record<string, number>;
}

/**
 * Storage is intentionally tiny: `take` must atomically check every bucket and,
 * only when all buckets have room, record the hit in all of them.
 */
export interface ThrottleStorage {
	take(
		buckets: readonly ThrottleBucket[],
		now: number,
	): ThrottleStorageResult | Promise<ThrottleStorageResult>;
	freeze?(bucketKey: string, until: number): void | Promise<void>;
	sweep?(now: number): void | Promise<void>;
	snapshot?(): ThrottleStorageSnapshot | Promise<ThrottleStorageSnapshot>;
}

export interface ThrottleMethodLimits {
	/** extra method-wide bucket on top of the bot-wide global bucket. */
	global?: BucketLimit | false;
	/** private-chat bucket for this method. falls back to the top-level private bucket. */
	privateChat?: BucketLimit | false;
	/** group/supergroup bucket for this method. falls back to the top-level group bucket. */
	group?: BucketLimit | false;
	/** default priority for this method. higher numbers drain first. */
	priority?: number;
}

export interface ThrottleRequestControl {
	/** bypass throttling for this call. */
	skip?: boolean;
	/** higher priority calls drain first while preserving FIFO within the same priority. */
	priority?: number;
	/** abort this request while it is still queued. */
	signal?: AbortSignal;
}

export type ThrottleControlled<T extends Record<string, unknown>> = T & {
	[THROTTLE_CONTROL]?: ThrottleRequestControl;
};

export type ThrottleOverflowMode = "queue" | "reject" | "drop-oldest";

export interface ThrottleOptions {
	/** compatibility mode: one global call every N ms. superseded by `global`. */
	minIntervalMs?: number;
	/** bot-wide cap. defaults to 30 req/s. set false to disable the global bucket. */
	global?: BucketLimit | false;
	/** puregram-style shortcut for the bot-wide cap. ignored when `global` is set. */
	globalPerSec?: number;
	/** private-chat cap. defaults to 1 req/s per chat. */
	privateChat?: BucketLimit | false;
	/** puregram-style shortcut for private chats. ignored when `privateChat` is set. */
	perChatPerSec?: number;
	/** group/supergroup cap. defaults to 20 req/min per group. */
	group?: BucketLimit | false;
	/** puregram-style shortcut for groups. ignored when `group` is set. */
	perGroupPerMin?: number;
	/** isolated per-method buckets and method priorities. */
	perMethod?: Record<string, ThrottleMethodLimits>;
	/** methods that bypass throttling. */
	excludedMethods?: readonly string[];
	/** alias for puregram users. */
	excludeMethods?: readonly string[];
	/** derive the target chat id. default reads numeric `params.chat_id`. */
	extractChatId?: (
		method: string,
		params: Record<string, unknown> | undefined,
	) => number | undefined;
	/** group detector. default treats negative chat ids as groups/supergroups. */
	extractIsGroup?: (chatId: number) => boolean;
	/** default priority when no method/request priority is provided. */
	defaultPriority?: number;
	/** dynamic priority hook. request control still wins over this. */
	priority?: (method: string, params: Record<string, unknown> | undefined) => number;
	/** max queued calls behind any one bucket. default Infinity. */
	maxQueueDepth?: number;
	/** max queued calls in this process. default Infinity. */
	maxQueueSize?: number;
	/** what to do when queue caps are exceeded. default `queue`. */
	overflow?: ThrottleOverflowMode;
	/** puregram-style alias: `drop` maps to `overflow: "reject"`. */
	mode?: "queue" | "drop";
	/** shared storage. use a Redis-backed implementation to coordinate multiple processes. */
	storage?: ThrottleStorage;
	/** abort every queued request when this signal aborts. */
	signal?: AbortSignal;
	/** learn from TelegramError.parameters.retry_after observed by @yaebal/again/core hooks. default true. */
	learnRetryAfter?: boolean;
	/** extra ms added to learned retry_after freezes. default 0. */
	retryAfterPaddingMs?: number;
	/** metrics/event hook. never awaited. */
	onEvent?: (event: ThrottleEvent) => unknown;
	/** injected clock for tests/custom runtimes. */
	now?: () => number;
}

export interface ThrottleQueuedRequest {
	id: number;
	method: string;
	buckets: readonly string[];
	priority: number;
	enqueuedAt: number;
}

export interface ThrottleCancelFilter {
	id?: number;
	method?: string;
	bucket?: string;
}

export interface ThrottleMetrics {
	pending: number;
	queued: number;
	acquired: number;
	delayed: number;
	rejected: number;
	cancelled: number;
	storageErrors: number;
	retryAfterLearned: number;
	maxPending: number;
	totalWaitMs: number;
	lastWaitMs: number;
	nextWakeAt?: number;
}

export type ThrottleEvent =
	| {
			type: "queued";
			request: ThrottleQueuedRequest;
	  }
	| {
			type: "acquired";
			request: ThrottleQueuedRequest;
			waitMs: number;
			remaining?: Record<string, number>;
	  }
	| {
			type: "rejected" | "cancelled";
			request: ThrottleQueuedRequest;
			reason: unknown;
	  }
	| {
			type: "retry_after";
			method: string;
			buckets: readonly string[];
			retryAfterMs: number;
			until: number;
	  };

export interface ThrottleHandle {
	readonly pending: number;
	readonly metrics: ThrottleMetrics;
	acquire(
		method: string,
		params?: Record<string, unknown>,
		control?: ThrottleRequestControl,
	): Promise<void>;
	cancel(filter?: ThrottleCancelFilter, reason?: unknown): number;
	noteRetryAfter(
		method: string,
		params: Record<string, unknown> | undefined,
		retryAfterMs: number,
	): Promise<void>;
	sweep(): Promise<void>;
}

export interface ThrottlePlugin extends BotPlugin {
	readonly handle: ThrottleHandle;
}

interface BucketState {
	stamps: number[];
	frozenUntil?: number;
}

interface NormalizedOptions {
	global: BucketLimit | false;
	privateChat: BucketLimit | false;
	group: BucketLimit | false;
	perMethod: Record<string, ThrottleMethodLimits>;
	excluded: Set<string>;
	extractChatId: (
		method: string,
		params: Record<string, unknown> | undefined,
	) => number | undefined;
	extractIsGroup: (chatId: number) => boolean;
	defaultPriority: number;
	priority?: (method: string, params: Record<string, unknown> | undefined) => number;
	maxQueueDepth: number;
	maxQueueSize: number;
	overflow: ThrottleOverflowMode;
	storage: ThrottleStorage;
	signal?: AbortSignal;
	learnRetryAfter: boolean;
	retryAfterPaddingMs: number;
	onEvent?: (event: ThrottleEvent) => unknown;
	now: () => number;
}

interface QueueJob {
	id: number;
	method: string;
	params: Record<string, unknown> | undefined;
	buckets: ThrottleBucket[];
	bucketKeys: string[];
	priority: number;
	sequence: number;
	enqueuedAt: number;
	signal?: AbortSignal;
	onAbort?: () => void;
	resolve: () => void;
	reject: (error: unknown) => void;
}

/** create a control object without serializing it into Telegram params. */
export function withThrottle<T extends Record<string, unknown>>(
	params: T,
	control: ThrottleRequestControl,
): ThrottleControlled<T> {
	return Object.assign({}, params, { [THROTTLE_CONTROL]: control });
}

/** old pure helper kept for tests and compatibility with the 0.0.x API. */
export function reserve(now: number, next: number, interval: number): { at: number; next: number } {
	const at = Math.max(now, next);

	return { at, next: at + interval };
}

export class ThrottleQueueOverflowError extends Error {
	readonly method: string;
	readonly buckets: readonly string[];
	readonly pending: number;

	constructor(method: string, buckets: readonly string[], pending: number) {
		super(`throttle: queue full for ${method} (${buckets.join(", ") || "no buckets"})`);
		this.name = "ThrottleQueueOverflowError";
		this.method = method;
		this.buckets = buckets;
		this.pending = pending;
	}
}

export class ThrottleAbortError extends Error {
	readonly method: string;
	readonly id: number;

	constructor(method: string, id: number) {
		super(`throttle: queued ${method} request ${id} was cancelled`);
		this.name = "ThrottleAbortError";
		this.method = method;
		this.id = id;
	}
}

export class MemoryThrottleStorage implements ThrottleStorage {
	readonly #buckets = new Map<string, BucketState>();

	take(buckets: readonly ThrottleBucket[], now: number): ThrottleStorageResult {
		const normalized = buckets.filter((bucket) => bucket.limit > 0 && bucket.windowMs >= 0);
		let waitMs = 0;
		let blockedBy: string | undefined;
		let resetAt: number | undefined;

		for (const bucket of normalized) {
			const state = this.#buckets.get(bucket.key);
			const stamps = state?.stamps ?? [];
			const weight = bucket.weight ?? 1;

			if (state?.frozenUntil !== undefined && state.frozenUntil > now) {
				const wait = state.frozenUntil - now;
				if (wait > waitMs) {
					waitMs = wait;
					blockedBy = bucket.key;
					resetAt = state.frozenUntil;
				}
				continue;
			}

			prune(stamps, now, bucket.windowMs);

			if (stamps.length + weight > bucket.limit) {
				const index = Math.max(0, stamps.length + weight - bucket.limit - 1);
				const stamp = stamps[index] ?? stamps[0] ?? now;
				const wait = Math.max(0, stamp + bucket.windowMs - now);

				if (wait > waitMs) {
					waitMs = wait;
					blockedBy = bucket.key;
					resetAt = stamp + bucket.windowMs;
				}
			}
		}

		if (waitMs > 0) return { ok: false, waitMs, blockedBy, resetAt };

		const remaining: Record<string, number> = {};
		for (const bucket of normalized) {
			let state = this.#buckets.get(bucket.key);
			if (!state) {
				state = { stamps: [] };
				this.#buckets.set(bucket.key, state);
			}

			prune(state.stamps, now, bucket.windowMs);

			const weight = bucket.weight ?? 1;
			for (let i = 0; i < weight; i++) state.stamps.push(now);
			remaining[bucket.key] = Math.max(0, bucket.limit - state.stamps.length);
		}

		return { ok: true, waitMs: 0, remaining };
	}

	freeze(bucketKey: string, until: number): void {
		const state = this.#buckets.get(bucketKey) ?? { stamps: [] };
		state.frozenUntil = Math.max(state.frozenUntil ?? 0, until);
		this.#buckets.set(bucketKey, state);
	}

	sweep(now: number): void {
		for (const [key, state] of this.#buckets) {
			const windowMs = inferWindowMs(key);
			prune(state.stamps, now, windowMs);

			if ((state.frozenUntil ?? 0) <= now && state.stamps.length === 0) this.#buckets.delete(key);
		}
	}

	snapshot(): ThrottleStorageSnapshot {
		const bucketSizes: Record<string, number> = {};
		const frozenUntil: Record<string, number> = {};

		for (const [key, state] of this.#buckets) {
			bucketSizes[key] = state.stamps.length;
			if (state.frozenUntil !== undefined) frozenUntil[key] = state.frozenUntil;
		}

		return { buckets: this.#buckets.size, bucketSizes, frozenUntil };
	}
}

export function memoryThrottleStorage(): ThrottleStorage {
	return new MemoryThrottleStorage();
}

export function createThrottleHandle(options: ThrottleOptions = {}): ThrottleHandle {
	return new ThrottleController(normalizeOptions(options));
}

class ThrottleController implements ThrottleHandle {
	readonly #options: NormalizedOptions;
	readonly #jobs: QueueJob[] = [];
	readonly #queuedByBucket = new Map<string, number>();
	#sequence = 0;
	#id = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#timerDue = 0;
	#running = false;
	#runAgain = false;
	readonly #counts = {
		queued: 0,
		acquired: 0,
		delayed: 0,
		rejected: 0,
		cancelled: 0,
		storageErrors: 0,
		retryAfterLearned: 0,
		maxPending: 0,
		totalWaitMs: 0,
		lastWaitMs: 0,
	};

	constructor(options: NormalizedOptions) {
		this.#options = options;

		if (options.signal) {
			if (options.signal.aborted) this.cancel(undefined, options.signal.reason);
			else
				options.signal.addEventListener(
					"abort",
					() => this.cancel(undefined, options.signal?.reason),
					{
						once: true,
					},
				);
		}
	}

	get pending(): number {
		return this.#jobs.length;
	}

	get metrics(): ThrottleMetrics {
		return {
			pending: this.#jobs.length,
			queued: this.#counts.queued,
			acquired: this.#counts.acquired,
			delayed: this.#counts.delayed,
			rejected: this.#counts.rejected,
			cancelled: this.#counts.cancelled,
			storageErrors: this.#counts.storageErrors,
			retryAfterLearned: this.#counts.retryAfterLearned,
			maxPending: this.#counts.maxPending,
			totalWaitMs: this.#counts.totalWaitMs,
			lastWaitMs: this.#counts.lastWaitMs,
			nextWakeAt: this.#timer ? this.#timerDue : undefined,
		};
	}

	async acquire(
		method: string,
		params?: Record<string, unknown>,
		control?: ThrottleRequestControl,
	): Promise<void> {
		const requestControl = { ...controlFrom(params), ...control };
		if (requestControl.skip || this.#options.excluded.has(method)) return;

		const buckets = this.#bucketsFor(method, params);
		if (buckets.length === 0) return;

		const signal = requestControl.signal;
		const id = ++this.#id;
		if (signal?.aborted) throw signal.reason ?? new ThrottleAbortError(method, id);

		const bucketKeys = buckets.map((bucket) => bucket.key);
		const priority = this.#priorityFor(method, params, requestControl.priority);
		const overflow = this.#overflowFor(bucketKeys);

		if (overflow && this.#options.overflow === "reject") {
			this.#counts.rejected++;
			throw new ThrottleQueueOverflowError(method, bucketKeys, this.#jobs.length);
		}

		if (overflow && this.#options.overflow === "drop-oldest") {
			this.#dropOldest(new ThrottleQueueOverflowError(method, bucketKeys, this.#jobs.length));
		}

		await new Promise<void>((resolve, reject) => {
			const job: QueueJob = {
				id,
				method,
				params,
				buckets,
				bucketKeys,
				priority,
				sequence: ++this.#sequence,
				enqueuedAt: this.#options.now(),
				signal,
				resolve,
				reject,
			};

			if (signal) {
				job.onAbort = () =>
					this.#cancelJob(job, signal.reason ?? new ThrottleAbortError(method, id));
				signal.addEventListener("abort", job.onAbort, { once: true });
			}

			this.#jobs.push(job);
			this.#counts.queued++;
			this.#counts.maxPending = Math.max(this.#counts.maxPending, this.#jobs.length);
			for (const key of bucketKeys)
				this.#queuedByBucket.set(key, (this.#queuedByBucket.get(key) ?? 0) + 1);
			this.#emit({ type: "queued", request: this.#snapshot(job) });
			this.#requestPump(0);
		});
	}

	cancel(
		filter: ThrottleCancelFilter = {},
		reason: unknown = new Error("throttle cancelled"),
	): number {
		let cancelled = 0;

		for (const job of [...this.#jobs]) {
			if (!matchesCancelFilter(job, filter)) continue;
			this.#cancelJob(job, reason);
			cancelled++;
		}

		return cancelled;
	}

	async noteRetryAfter(
		method: string,
		params: Record<string, unknown> | undefined,
		retryAfterMs: number,
	): Promise<void> {
		if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0 || !this.#options.storage.freeze) return;

		const buckets = this.#bucketsFor(method, params);
		const until = this.#options.now() + retryAfterMs + this.#options.retryAfterPaddingMs;
		for (const bucket of buckets) await this.#options.storage.freeze(bucket.key, until);

		this.#counts.retryAfterLearned++;
		this.#emit({
			type: "retry_after",
			method,
			buckets: buckets.map((bucket) => bucket.key),
			retryAfterMs,
			until,
		});
		this.#requestPump(retryAfterMs + this.#options.retryAfterPaddingMs);
	}

	async sweep(): Promise<void> {
		await this.#options.storage.sweep?.(this.#options.now());
	}

	#bucketsFor(method: string, params: Record<string, unknown> | undefined): ThrottleBucket[] {
		const buckets: ThrottleBucket[] = [];
		const methodLimits = this.#options.perMethod[method];

		if (this.#options.global) buckets.push(bucket("global", this.#options.global));
		if (methodLimits?.global) buckets.push(bucket(`method:${method}:global`, methodLimits.global));

		const chatId = this.#options.extractChatId(method, params);
		if (chatId === undefined) return buckets;

		if (this.#options.extractIsGroup(chatId)) {
			const hasGroupOverride = methodLimits !== undefined && "group" in methodLimits;
			const group = hasGroupOverride ? methodLimits.group : this.#options.group;
			if (group) {
				const key = hasGroupOverride ? `method:${method}:group:${chatId}` : `group:${chatId}`;
				buckets.push(bucket(key, group));
			}
		} else {
			const hasPrivateOverride = methodLimits !== undefined && "privateChat" in methodLimits;
			const privateChat = hasPrivateOverride ? methodLimits.privateChat : this.#options.privateChat;
			if (privateChat) {
				const key = hasPrivateOverride ? `method:${method}:private:${chatId}` : `private:${chatId}`;
				buckets.push(bucket(key, privateChat));
			}
		}

		return buckets;
	}

	#priorityFor(
		method: string,
		params: Record<string, unknown> | undefined,
		requestPriority: number | undefined,
	): number {
		return (
			requestPriority ??
			this.#options.perMethod[method]?.priority ??
			this.#options.priority?.(method, params) ??
			this.#options.defaultPriority
		);
	}

	#overflowFor(bucketKeys: readonly string[]): boolean {
		if (this.#jobs.length >= this.#options.maxQueueSize) return true;
		return bucketKeys.some(
			(key) => (this.#queuedByBucket.get(key) ?? 0) >= this.#options.maxQueueDepth,
		);
	}

	#dropOldest(reason: unknown): void {
		const job = [...this.#jobs].sort(
			(a, b) => a.priority - b.priority || a.sequence - b.sequence,
		)[0];
		if (job) this.#rejectJob(job, reason, "rejected");
	}

	#requestPump(delayMs: number): void {
		if (delayMs <= 0 && this.#running) {
			this.#runAgain = true;
			return;
		}

		this.#armTimer(delayMs);
	}

	#armTimer(delayMs: number): void {
		const delay = Math.max(0, delayMs);
		const due = this.#options.now() + delay;
		if (this.#timer && due >= this.#timerDue) return;

		if (this.#timer) clearTimeout(this.#timer);
		this.#timerDue = due;
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			this.#timerDue = 0;
			void this.#pump();
		}, delay);
	}

	async #pump(): Promise<void> {
		if (this.#running) {
			this.#runAgain = true;
			return;
		}

		this.#running = true;
		try {
			while (this.#jobs.length > 0) {
				const ordered = [...this.#jobs].sort(
					(a, b) => b.priority - a.priority || a.sequence - b.sequence,
				);
				let minWait = Number.POSITIVE_INFINITY;
				let dispatched = false;

				for (const job of ordered) {
					if (job.signal?.aborted) {
						this.#cancelJob(job, job.signal.reason ?? new ThrottleAbortError(job.method, job.id));
						dispatched = true;
						break;
					}

					let result: ThrottleStorageResult;
					try {
						result = await this.#options.storage.take(job.buckets, this.#options.now());
					} catch (error) {
						this.#counts.storageErrors++;
						this.#rejectJob(job, error, "rejected");
						dispatched = true;
						break;
					}

					if (result.ok) {
						this.#acquireJob(job, result.remaining);
						dispatched = true;
						break;
					}

					minWait = Math.min(minWait, Math.max(1, result.waitMs));
				}

				if (dispatched) continue;
				if (Number.isFinite(minWait)) this.#armTimer(minWait);
				break;
			}
		} finally {
			this.#running = false;
			if (this.#runAgain && this.#jobs.length > 0) {
				this.#runAgain = false;
				this.#armTimer(0);
			}
		}
	}

	#acquireJob(job: QueueJob, remaining: Record<string, number> | undefined): void {
		this.#removeJob(job);
		const waitMs = Math.max(0, this.#options.now() - job.enqueuedAt);
		this.#counts.acquired++;
		this.#counts.lastWaitMs = waitMs;
		this.#counts.totalWaitMs += waitMs;
		if (waitMs > 0) this.#counts.delayed++;
		this.#emit({ type: "acquired", request: this.#snapshot(job), waitMs, remaining });
		job.resolve();
	}

	#cancelJob(job: QueueJob, reason: unknown): void {
		this.#rejectJob(job, reason, "cancelled");
	}

	#rejectJob(job: QueueJob, reason: unknown, type: "cancelled" | "rejected"): void {
		if (!this.#removeJob(job)) return;
		if (type === "cancelled") this.#counts.cancelled++;
		else this.#counts.rejected++;
		this.#emit({ type, request: this.#snapshot(job), reason });
		job.reject(reason);
	}

	#removeJob(job: QueueJob): boolean {
		const index = this.#jobs.indexOf(job);
		if (index < 0) return false;

		this.#jobs.splice(index, 1);
		if (job.signal && job.onAbort) job.signal.removeEventListener("abort", job.onAbort);

		for (const key of job.bucketKeys) {
			const next = (this.#queuedByBucket.get(key) ?? 1) - 1;
			if (next <= 0) this.#queuedByBucket.delete(key);
			else this.#queuedByBucket.set(key, next);
		}

		return true;
	}

	#snapshot(job: QueueJob): ThrottleQueuedRequest {
		return {
			id: job.id,
			method: job.method,
			buckets: job.bucketKeys,
			priority: job.priority,
			enqueuedAt: job.enqueuedAt,
		};
	}

	#emit(event: ThrottleEvent): void {
		try {
			this.#options.onEvent?.(event);
		} catch {
			// Observability hooks must not affect API delivery.
		}
	}
}

function installThrottle(
	api: Api,
	options: ThrottleOptions = {},
	handle = createThrottleHandle(options),
) {
	api.before(async (method, params): Promise<undefined> => {
		await handle.acquire(method, params);
		return undefined;
	});

	if ((options.learnRetryAfter ?? true) !== false) {
		api.onError(async (method, error, _attempt, params) => {
			if (!(error instanceof TelegramError) || error.code !== 429) return undefined;

			const retryAfter = error.parameters?.retry_after;
			if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter >= 0) {
				await handle.noteRetryAfter(method, params, retryAfter * 1000);
			}

			return undefined;
		});
	}

	return handle;
}

/** create an installable bot plugin: `bot.install(throttle())`. */
export function throttle(options?: ThrottleOptions): ThrottlePlugin;
/** install throttling on a bot's API directly: `const limiter = throttle(bot.api)`. */
export function throttle(api: Api, options?: ThrottleOptions): ThrottleHandle;
export function throttle(
	apiOrOptions?: Api | ThrottleOptions,
	options: ThrottleOptions = {},
): ThrottlePlugin | ThrottleHandle {
	if (isApi(apiOrOptions)) return installThrottle(apiOrOptions, options);

	const pluginOptions = apiOrOptions ?? {};
	const handle = createThrottleHandle(pluginOptions);
	const plugin = ((bot: { api: Api }) => {
		installThrottle(bot.api, pluginOptions, handle);
		return bot;
	}) as unknown as ThrottlePlugin;

	Object.defineProperty(plugin, "handle", { value: handle, enumerable: true });

	return plugin;
}

function isApi(value: Api | ThrottleOptions | undefined): value is Api {
	return typeof (value as Api | undefined)?.before === "function";
}

function normalizeOptions(options: ThrottleOptions): NormalizedOptions {
	return {
		global: normalizeGlobal(options),
		privateChat: options.privateChat ?? perSecond(options.perChatPerSec ?? DEFAULT_PRIVATE_PER_SEC),
		group: options.group ?? {
			limit: options.perGroupPerMin ?? DEFAULT_GROUP_PER_MIN,
			windowMs: GROUP_WINDOW_MS,
		},
		perMethod: options.perMethod ?? {},
		excluded: new Set(
			options.excludedMethods ?? options.excludeMethods ?? DEFAULT_EXCLUDED_METHODS,
		),
		extractChatId: options.extractChatId ?? defaultExtractChatId,
		extractIsGroup: options.extractIsGroup ?? ((chatId) => chatId < 0),
		defaultPriority: options.defaultPriority ?? 0,
		priority: options.priority,
		maxQueueDepth: options.maxQueueDepth ?? Number.POSITIVE_INFINITY,
		maxQueueSize: options.maxQueueSize ?? Number.POSITIVE_INFINITY,
		overflow: options.mode === "drop" ? "reject" : (options.overflow ?? "queue"),
		storage: options.storage ?? memoryThrottleStorage(),
		signal: options.signal,
		learnRetryAfter: options.learnRetryAfter ?? true,
		retryAfterPaddingMs: options.retryAfterPaddingMs ?? 0,
		onEvent: options.onEvent,
		now: options.now ?? (() => Date.now()),
	};
}

function normalizeGlobal(options: ThrottleOptions): BucketLimit | false {
	if (options.global !== undefined) return options.global;
	if (options.minIntervalMs !== undefined) return { limit: 1, windowMs: options.minIntervalMs };
	return perSecond(options.globalPerSec ?? DEFAULT_GLOBAL_PER_SEC);
}

function perSecond(limit: number): BucketLimit {
	return { limit, windowMs: GLOBAL_WINDOW_MS };
}

function bucket(key: string, limit: BucketLimit): ThrottleBucket {
	return { key, limit: limit.limit, windowMs: limit.windowMs };
}

function defaultExtractChatId(
	_method: string,
	params: Record<string, unknown> | undefined,
): number | undefined {
	const raw = params?.chat_id;
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;

	if (typeof raw === "string") {
		const n = Number(raw);
		if (Number.isFinite(n)) return n;
	}

	return undefined;
}

function controlFrom(params: Record<string, unknown> | undefined): ThrottleRequestControl {
	return ((params as ThrottleControlled<Record<string, unknown>> | undefined)?.[THROTTLE_CONTROL] ??
		{}) as ThrottleRequestControl;
}

function prune(stamps: number[], now: number, windowMs: number): void {
	const cutoff = now - windowMs;
	let drop = 0;
	while (drop < stamps.length && (stamps[drop] ?? Number.POSITIVE_INFINITY) <= cutoff) drop++;
	if (drop > 0) stamps.splice(0, drop);
}

function inferWindowMs(key: string): number {
	if (key.includes(":group:") || key.startsWith("group:")) return GROUP_WINDOW_MS;
	if (key.includes(":private:") || key.startsWith("private:")) return PRIVATE_WINDOW_MS;
	return GLOBAL_WINDOW_MS;
}

function matchesCancelFilter(job: QueueJob, filter: ThrottleCancelFilter): boolean {
	if (filter.id !== undefined && job.id !== filter.id) return false;
	if (filter.method !== undefined && job.method !== filter.method) return false;
	if (filter.bucket !== undefined && !job.bucketKeys.includes(filter.bucket)) return false;
	return true;
}
