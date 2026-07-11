import { type Api, TelegramError } from "@yaebal/core";
import type { CopyMessageParams, SendMessageParams } from "@yaebal/types";

export type ChatId = number | string;
export type Awaitable<T> = T | Promise<T>;
export type BroadcastStatus =
	| "creating"
	| "queued"
	| "running"
	| "paused"
	| "completed"
	| "cancelled";
export type BroadcastDeliveryStatus = "queued" | "running" | "sent" | "failed" | "skipped";
export type BroadcastRetryReason = "retry_after" | "rate_limit" | "server" | "network";

export type BroadcastAction<Args extends readonly unknown[] = readonly unknown[]> = (
	...args: Args
) => Awaitable<unknown>;

export interface BroadcastType<Args extends readonly unknown[] = readonly unknown[]> {
	action: BroadcastAction<Args>;
}

export type BroadcastTypes = Record<string, BroadcastType<readonly unknown[]>>;
export type BroadcastArgs<T> = T extends BroadcastType<infer Args> ? Args : never;
export type BroadcastInput<Args extends readonly unknown[]> = Iterable<Args> | AsyncIterable<Args>;
export type BroadcastTargets<T> = Iterable<T> | AsyncIterable<T>;

export interface BroadcastRateLimit {
	/** calls allowed in the rolling window. defaults to 25/sec, below Telegram's 30/sec ceiling. */
	limit: number;
	/** rolling-window size in milliseconds. */
	windowMs: number;
}

export interface BroadcastRetryOptions {
	/** total attempts per delivery, including the first one. defaults to 5. */
	attempts?: number;
	/** base exponential backoff in ms. defaults to 1000. */
	baseDelayMs?: number;
	/** max delay for one retry in ms. defaults to 30000. */
	maxDelayMs?: number;
	/** fixed delay mode, useful for GramIO-style queues and tests. */
	fixedDelayMs?: number;
	/** add this many ms to Telegram retry_after waits. defaults to 0. */
	retryAfterPaddingMs?: number;
	/** retry non-Telegram errors as transient network/runtime failures. defaults to true. */
	retryOnNetwork?: boolean;
	/** retry Telegram 5xx errors. defaults to true. */
	retryOnServerError?: boolean;
	/** randomize computed delay by this fraction, or provide a custom mapper. defaults to 0. */
	jitter?: number | ((delayMs: number, attempt: number, error: unknown) => number);
}

export interface BroadcastRetryDecision {
	reason: BroadcastRetryReason;
	delayMs: number;
	retryAfterMs?: number;
}

export interface BroadcastErrorInfo {
	name?: string;
	message: string;
	code?: number;
	description?: string;
	retryAfterMs?: number;
}

export interface BroadcastJobState {
	id: string;
	type: string;
	status: BroadcastStatus;
	total: number;
	sent: number;
	failed: number;
	skipped: number;
	retried: number;
	priority: number;
	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	completedAt?: number;
	metadata?: Record<string, unknown>;
}

export interface BroadcastDeliveryState {
	id: string;
	jobId: string;
	type: string;
	index: number;
	args: readonly unknown[];
	status: BroadcastDeliveryStatus;
	attempts: number;
	maxAttempts: number;
	priority: number;
	dueAt: number;
	createdAt: number;
	updatedAt: number;
	startedAt?: number;
	finishedAt?: number;
	lockedBy?: string;
	lockUntil?: number;
	key?: string;
	error?: BroadcastErrorInfo;
	result?: unknown;
}

export interface BroadcastStorageJobFilter {
	status?: BroadcastStatus | readonly BroadcastStatus[];
	type?: string;
}

export interface BroadcastStorageDeliveryFilter {
	status?: BroadcastDeliveryStatus | readonly BroadcastDeliveryStatus[];
}

export interface BroadcastStorage {
	createJob(job: BroadcastJobState): Awaitable<void>;
	addDeliveries(jobId: string, deliveries: readonly BroadcastDeliveryState[]): Awaitable<void>;
	getJob(jobId: string): Awaitable<BroadcastJobState | undefined>;
	patchJob(jobId: string, patch: Partial<BroadcastJobState>): Awaitable<void>;
	incrementJob(
		jobId: string,
		delta: Partial<Pick<BroadcastJobState, "total" | "sent" | "failed" | "skipped" | "retried">>,
	): Awaitable<BroadcastJobState | undefined>;
	claim(
		workerId: string,
		now: number,
		leaseMs: number,
	): Awaitable<BroadcastDeliveryState | undefined>;
	patchDelivery(
		jobId: string,
		deliveryId: string,
		patch: Partial<BroadcastDeliveryState>,
	): Awaitable<void>;
	listJobs(filter?: BroadcastStorageJobFilter): Awaitable<BroadcastJobState[]>;
	listDeliveries(
		jobId: string,
		filter?: BroadcastStorageDeliveryFilter,
	): Awaitable<BroadcastDeliveryState[]>;
	nextDueAt(now: number): Awaitable<number | undefined>;
}

export interface BroadcastTypeOptions<Args extends readonly unknown[]> {
	/** deterministic key stored with each delivery; useful for DB traces and dedupe in custom storage. */
	key?: (args: Args, index: number) => string | number;
	/** priority for deliveries of this type. higher drains first. */
	priority?: number | ((args: Args, index: number) => number);
	/** per-type retry policy. overrides client defaults. */
	retry?: BroadcastRetryOptions | false;
	/** treat an error as a permanent skip. defaults to Telegram 403. */
	shouldSkip?: (error: unknown, args: Args, attempt: number) => boolean;
	/** called after a delivery permanently fails or is skipped. never blocks other deliveries. */
	onError?: (error: unknown, args: Args, delivery: BroadcastDeliveryState) => unknown;
}

export interface BroadcastStartOptions {
	id?: string;
	metadata?: Record<string, unknown>;
	priority?: number;
	delayMs?: number;
	batchSize?: number;
	retry?: BroadcastRetryOptions | false;
	storeResults?: boolean;
}

export interface BroadcastClientOptions {
	storage?: BroadcastStorage;
	concurrency?: number;
	/** set false if another plugin/worker enforces rate limits. */
	rateLimit?: BroadcastRateLimit | false;
	retry?: BroadcastRetryOptions | false;
	/** Telegram error codes considered unreachable recipients. defaults to [403]. */
	ignoredErrorCodes?: readonly number[];
	leaseMs?: number;
	autoRun?: boolean;
	workerId?: string;
	now?: () => number;
	id?: () => string;
	onEvent?: (event: BroadcastEvent) => unknown;
}

export interface BroadcastMetrics {
	active: number;
	queued: number;
	started: number;
	completed: number;
	failed: number;
	skipped: number;
	retried: number;
	rateLimited: number;
	storageErrors: number;
	nextWakeAt?: number;
}

export interface BroadcastResult {
	jobId: string;
	type: string;
	total: number;
	sent: number;
	failed: number;
	skipped: number;
	retried: number;
	cancelled: number;
	status: BroadcastStatus;
	durationMs?: number;
}

export interface BroadcastSnapshot extends BroadcastResult {
	job: BroadcastJobState;
}

export interface BroadcastWaitOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
}

export interface BroadcastJobHandle {
	readonly id: string;
	readonly type: string;
	snapshot(): Promise<BroadcastSnapshot>;
	wait(options?: BroadcastWaitOptions): Promise<BroadcastResult>;
	pause(): Promise<void>;
	resume(): Promise<void>;
	cancel(): Promise<void>;
}

export interface BroadcastDeliveryEvent {
	delivery: BroadcastDeliveryState;
	job?: BroadcastJobState;
}

export type BroadcastEvent =
	| { type: "job_created"; job: BroadcastJobState }
	| { type: "job_queued"; job: BroadcastJobState }
	| {
			type: "job_paused" | "job_resumed" | "job_cancelled" | "job_completed";
			job: BroadcastJobState;
	  }
	| ({
			type: "delivery_started" | "delivery_sent" | "delivery_skipped" | "delivery_failed";
	  } & BroadcastDeliveryEvent & { error?: unknown; result?: unknown })
	| ({ type: "delivery_retry" } & BroadcastDeliveryEvent & {
				error: unknown;
				decision: BroadcastRetryDecision;
			})
	| { type: "rate_limited"; waitMs: number; delivery: BroadcastDeliveryState }
	| { type: "storage_error"; error: unknown };

export interface BroadcastOptions extends BroadcastStartOptions {
	/** extra params merged into every sendMessage. chat_id/text always win. */
	extra?: Omit<SendMessageParams, "chat_id" | "text"> & Record<string, unknown>;
	/** called for each delivery that permanently fails or is skipped. */
	onError?: (chatId: ChatId, error: unknown, delivery: BroadcastDeliveryState) => unknown;
	/** full event stream for progress bars, logs and metrics. */
	onEvent?: (event: BroadcastEvent) => unknown;
	concurrency?: number;
	rateLimit?: BroadcastRateLimit | false;
	retry?: BroadcastRetryOptions | false;
	signal?: AbortSignal;
}

interface RegisteredType {
	run(args: readonly unknown[]): Awaitable<unknown>;
	key(args: readonly unknown[], index: number): string | undefined;
	priority(args: readonly unknown[], index: number): number | undefined;
	shouldSkip(error: unknown, args: readonly unknown[], attempt: number): boolean;
	onError?(error: unknown, args: readonly unknown[], delivery: BroadcastDeliveryState): unknown;
	retry?: BroadcastRetryOptions | false;
}

interface NormalizedOptions {
	storage: BroadcastStorage;
	concurrency: number;
	rateLimit: BroadcastRateLimit | false;
	retry: BroadcastRetryOptions | false;
	ignoredErrorCodes: readonly number[];
	leaseMs: number;
	autoRun: boolean;
	workerId: string;
	now: () => number;
	id: () => string;
	onEvent?: (event: BroadcastEvent) => unknown;
}

interface Waiter {
	resolve: (result: BroadcastResult) => void;
	reject: (error: unknown) => void;
	timer?: ReturnType<typeof setTimeout>;
	signal?: AbortSignal;
	onAbort?: () => void;
}

type NormalizedRetry = Required<Omit<BroadcastRetryOptions, "fixedDelayMs">> & {
	fixedDelayMs?: number;
};

const DEFAULT_RATE_LIMIT: BroadcastRateLimit = { limit: 25, windowMs: 1_000 };
const DEFAULT_RETRY: Required<
	Pick<BroadcastRetryOptions, "attempts" | "baseDelayMs" | "maxDelayMs">
> &
	Omit<BroadcastRetryOptions, "attempts" | "baseDelayMs" | "maxDelayMs"> = {
	attempts: 5,
	baseDelayMs: 1_000,
	maxDelayMs: 30_000,
	retryAfterPaddingMs: 0,
	retryOnNetwork: true,
	retryOnServerError: true,
	jitter: 0,
};

export class BroadcastJobNotFoundError extends Error {
	readonly jobId: string;

	constructor(jobId: string) {
		super(`broadcast: job "${jobId}" was not found`);
		this.name = "BroadcastJobNotFoundError";
		this.jobId = jobId;
	}
}

export class BroadcastTypeNotFoundError extends Error {
	readonly type: string;

	constructor(type: string) {
		super(`broadcast: type "${type}" is not registered in this worker`);
		this.name = "BroadcastTypeNotFoundError";
		this.type = type;
	}
}

export class BroadcastWaitTimeoutError extends Error {
	readonly jobId: string;
	readonly timeoutMs: number;

	constructor(jobId: string, timeoutMs: number) {
		super(`broadcast: waiting for job "${jobId}" timed out after ${timeoutMs}ms`);
		this.name = "BroadcastWaitTimeoutError";
		this.jobId = jobId;
		this.timeoutMs = timeoutMs;
	}
}

export class MemoryBroadcastStorage implements BroadcastStorage {
	readonly #jobs = new Map<string, BroadcastJobState>();
	readonly #deliveries = new Map<string, Map<string, BroadcastDeliveryState>>();

	createJob(job: BroadcastJobState): void {
		if (this.#jobs.has(job.id)) throw new Error(`broadcast: job "${job.id}" already exists`);
		this.#jobs.set(job.id, cloneJob(job));
		this.#deliveries.set(job.id, new Map());
	}

	addDeliveries(jobId: string, deliveries: readonly BroadcastDeliveryState[]): void {
		const bucket = this.#deliveries.get(jobId);
		if (!bucket) throw new BroadcastJobNotFoundError(jobId);

		for (const delivery of deliveries) bucket.set(delivery.id, cloneDelivery(delivery));
	}

	getJob(jobId: string): BroadcastJobState | undefined {
		const job = this.#jobs.get(jobId);
		return job && cloneJob(job);
	}

	patchJob(jobId: string, patch: Partial<BroadcastJobState>): void {
		const job = this.#jobs.get(jobId);
		if (!job) throw new BroadcastJobNotFoundError(jobId);

		this.#jobs.set(jobId, cloneJob({ ...job, ...patch }));
	}

	incrementJob(
		jobId: string,
		delta: Partial<Pick<BroadcastJobState, "total" | "sent" | "failed" | "skipped" | "retried">>,
	): BroadcastJobState | undefined {
		const job = this.#jobs.get(jobId);
		if (!job) return undefined;

		const next: BroadcastJobState = {
			...job,
			total: job.total + (delta.total ?? 0),
			sent: job.sent + (delta.sent ?? 0),
			failed: job.failed + (delta.failed ?? 0),
			skipped: job.skipped + (delta.skipped ?? 0),
			retried: job.retried + (delta.retried ?? 0),
			updatedAt: Date.now(),
		};

		this.#jobs.set(jobId, cloneJob(next));
		return cloneJob(next);
	}

	claim(workerId: string, now: number, leaseMs: number): BroadcastDeliveryState | undefined {
		const candidates: BroadcastDeliveryState[] = [];

		for (const [jobId, bucket] of this.#deliveries) {
			const job = this.#jobs.get(jobId);
			if (!job || (job.status !== "queued" && job.status !== "running")) continue;

			for (const delivery of bucket.values()) {
				const expired = delivery.status === "running" && (delivery.lockUntil ?? 0) <= now;
				if ((delivery.status === "queued" && delivery.dueAt <= now) || expired) {
					candidates.push(delivery);
				}
			}
		}

		const delivery = candidates.sort(
			(a, b) => b.priority - a.priority || a.dueAt - b.dueAt || a.index - b.index,
		)[0];
		if (!delivery) return undefined;

		const job = this.#jobs.get(delivery.jobId);
		const bucket = this.#deliveries.get(delivery.jobId);
		if (!job || !bucket) return undefined;

		const nextJob: BroadcastJobState = {
			...job,
			status: "running",
			startedAt: job.startedAt ?? now,
			updatedAt: now,
		};
		const nextDelivery: BroadcastDeliveryState = {
			...delivery,
			status: "running",
			attempts: delivery.attempts + 1,
			startedAt: delivery.startedAt ?? now,
			updatedAt: now,
			lockedBy: workerId,
			lockUntil: now + leaseMs,
		};

		this.#jobs.set(job.id, nextJob);
		bucket.set(delivery.id, nextDelivery);

		return cloneDelivery(nextDelivery);
	}

	patchDelivery(jobId: string, deliveryId: string, patch: Partial<BroadcastDeliveryState>): void {
		const bucket = this.#deliveries.get(jobId);
		if (!bucket) throw new BroadcastJobNotFoundError(jobId);

		const delivery = bucket.get(deliveryId);
		if (!delivery) throw new Error(`broadcast: delivery "${deliveryId}" was not found`);

		bucket.set(deliveryId, cloneDelivery({ ...delivery, ...patch }));
	}

	listJobs(filter: BroadcastStorageJobFilter = {}): BroadcastJobState[] {
		return [...this.#jobs.values()].filter((job) => matchesJob(job, filter)).map(cloneJob);
	}

	listDeliveries(
		jobId: string,
		filter: BroadcastStorageDeliveryFilter = {},
	): BroadcastDeliveryState[] {
		const bucket = this.#deliveries.get(jobId);
		if (!bucket) return [];

		return [...bucket.values()]
			.filter((delivery) => matchesDelivery(delivery, filter))
			.map(cloneDelivery);
	}

	nextDueAt(now: number): number | undefined {
		let next: number | undefined;

		for (const [jobId, bucket] of this.#deliveries) {
			const job = this.#jobs.get(jobId);
			if (!job || (job.status !== "queued" && job.status !== "running")) continue;

			for (const delivery of bucket.values()) {
				const dueAt = delivery.status === "queued" ? delivery.dueAt : delivery.lockUntil;
				if (dueAt === undefined || dueAt <= now) continue;
				if (next === undefined || dueAt < next) next = dueAt;
			}
		}

		return next;
	}
}

export function memoryBroadcastStorage(): BroadcastStorage {
	return new MemoryBroadcastStorage();
}

export class Broadcast<Types extends BroadcastTypes = Record<never, never>> {
	readonly api: Api;
	readonly storage: BroadcastStorage;
	readonly #options: NormalizedOptions;
	readonly #types = new Map<string, RegisteredType>();
	readonly #waiters = new Map<string, Set<Waiter>>();
	readonly #limiter: LocalRateLimiter | undefined;
	#active = 0;
	#running = false;
	#pumping = false;
	#pumpAgain = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#timerDue = 0;
	#inlineTypeId = 0;
	readonly #counts = {
		queued: 0,
		started: 0,
		completed: 0,
		failed: 0,
		skipped: 0,
		retried: 0,
		rateLimited: 0,
		storageErrors: 0,
	};

	constructor(api: Api, options: BroadcastClientOptions = {}) {
		this.api = api;
		this.#options = normalizeOptions(options);
		this.storage = this.#options.storage;
		this.#limiter = this.#options.rateLimit
			? new LocalRateLimiter(this.#options.rateLimit, this.#options.now)
			: undefined;

		if (this.#options.autoRun) this.run();
	}

	get active(): number {
		return this.#active;
	}

	get running(): boolean {
		return this.#running;
	}

	get metrics(): BroadcastMetrics {
		return {
			active: this.#active,
			queued: this.#counts.queued,
			started: this.#counts.started,
			completed: this.#counts.completed,
			failed: this.#counts.failed,
			skipped: this.#counts.skipped,
			retried: this.#counts.retried,
			rateLimited: this.#counts.rateLimited,
			storageErrors: this.#counts.storageErrors,
			nextWakeAt: this.#timer ? this.#timerDue : undefined,
		};
	}

	/** register a typed broadcast definition. chained calls accumulate valid start() names and tuple args. */
	type<const Name extends string, const Args extends readonly unknown[]>(
		name: Name,
		action: BroadcastAction<Args>,
		options: BroadcastTypeOptions<Args> = {},
	): Broadcast<Types & { [K in Name]: BroadcastType<Args> }> {
		if (this.#types.has(name)) throw new Error(`broadcast: type "${name}" is already registered`);

		this.#types.set(name, {
			run: (args) => action(...(args as unknown as Args)),
			key: (args, index) => stringifyKey(options.key?.(args as unknown as Args, index)),
			priority: (args, index) => {
				if (typeof options.priority === "function")
					return options.priority(args as unknown as Args, index);
				return options.priority;
			},
			shouldSkip: (error, args, attempt) =>
				options.shouldSkip?.(error, args as unknown as Args, attempt) ??
				this.#defaultShouldSkip(error),
			onError: options.onError
				? (error, args, delivery) => options.onError?.(error, args as unknown as Args, delivery)
				: undefined,
			retry: options.retry,
		});

		return this as unknown as Broadcast<Types & { [K in Name]: BroadcastType<Args> }>;
	}

	async start<Name extends keyof Types & string>(
		name: Name,
		items: BroadcastInput<BroadcastArgs<Types[Name]>>,
		options: BroadcastStartOptions = {},
	): Promise<BroadcastJobHandle> {
		return this.#enqueue(name, items as BroadcastInput<readonly unknown[]>, options);
	}

	/** start the local worker loop. multiple processes can share storage if the adapter makes claim() atomic. */
	run(): this {
		if (this.#running) return this;
		this.#running = true;
		this.#schedule(0);
		return this;
	}

	async stop(options: { drain?: boolean } = {}): Promise<void> {
		this.#running = false;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#timerDue = 0;

		if (!options.drain) return;
		while (this.#active > 0) await sleep(10);
	}

	async queueMessage(
		chatIds: BroadcastTargets<ChatId>,
		text: string,
		options: BroadcastOptions = {},
	): Promise<BroadcastJobHandle> {
		const type = this.#inlineType("sendMessage");
		const extra = options.extra ?? {};
		this.#registerInline(
			type,
			async ([chatId]: readonly [ChatId, number]) => {
				await this.api.sendMessage({ ...extra, chat_id: chatId, text });
			},
			{
				onError: options.onError
					? (error, args, delivery) => options.onError?.(args[0], error, delivery)
					: undefined,
			},
		);

		return this.#enqueue(type, indexedTargets(chatIds), options);
	}

	async sendMessage(
		chatIds: BroadcastTargets<ChatId>,
		text: string,
		options: BroadcastOptions = {},
	): Promise<BroadcastResult> {
		const job = await this.queueMessage(chatIds, text, options);
		return job.wait({ signal: options.signal });
	}

	async queueCopyMessage(
		chatIds: BroadcastTargets<ChatId>,
		params: Omit<CopyMessageParams, "chat_id"> & Record<string, unknown>,
		options: BroadcastStartOptions = {},
	): Promise<BroadcastJobHandle> {
		const type = this.#inlineType("copyMessage");
		this.#registerInline(type, async ([chatId]: readonly [ChatId, number]) => {
			await this.api.call("copyMessage", { ...params, chat_id: chatId });
		});

		return this.#enqueue(type, indexedTargets(chatIds), options);
	}

	async copyMessage(
		chatIds: BroadcastTargets<ChatId>,
		params: Omit<CopyMessageParams, "chat_id"> & Record<string, unknown>,
		options: BroadcastStartOptions = {},
	): Promise<BroadcastResult> {
		const job = await this.queueCopyMessage(chatIds, params, options);
		return job.wait();
	}

	async queueMethod<Target>(
		method: string,
		targets: BroadcastTargets<Target>,
		buildParams: (target: Target, index: number) => Record<string, unknown>,
		options: BroadcastStartOptions = {},
	): Promise<BroadcastJobHandle> {
		const type = this.#inlineType(method);
		this.#registerInline(type, async ([target, index]: readonly [Target, number]) => {
			await this.api.call(method, buildParams(target, index));
		});

		return this.#enqueue(type, indexedTargets(targets), options);
	}

	async method<Target>(
		method: string,
		targets: BroadcastTargets<Target>,
		buildParams: (target: Target, index: number) => Record<string, unknown>,
		options: BroadcastStartOptions = {},
	): Promise<BroadcastResult> {
		const job = await this.queueMethod(method, targets, buildParams, options);
		return job.wait();
	}

	async pause(jobId: string): Promise<void> {
		const job = await this.#requireJob(jobId);
		if (isTerminal(job.status)) return;

		const next = { ...job, status: "paused" as const, updatedAt: this.#options.now() };
		await this.storage.patchJob(jobId, next);
		this.#emit({ type: "job_paused", job: next });
	}

	async resume(jobId: string): Promise<void> {
		const job = await this.#requireJob(jobId);
		if (job.status !== "paused") return;

		const next = { ...job, status: "queued" as const, updatedAt: this.#options.now() };
		await this.storage.patchJob(jobId, next);
		this.#emit({ type: "job_resumed", job: next });
		this.#schedule(0);
	}

	async cancel(jobId: string): Promise<void> {
		const job = await this.#requireJob(jobId);
		if (isTerminal(job.status)) return;

		const next = {
			...job,
			status: "cancelled" as const,
			updatedAt: this.#options.now(),
			completedAt: this.#options.now(),
		};
		await this.storage.patchJob(jobId, next);
		this.#emit({ type: "job_cancelled", job: next });
		this.#resolveWaiters(jobId, resultFromJob(next));
	}

	async snapshot(jobId: string): Promise<BroadcastSnapshot> {
		const job = await this.#requireJob(jobId);
		return { ...resultFromJob(job), job };
	}

	async wait(jobId: string, options: BroadcastWaitOptions = {}): Promise<BroadcastResult> {
		const job = await this.#requireJob(jobId);
		if (isTerminal(job.status)) return resultFromJob(job);

		return new Promise<BroadcastResult>((resolve, reject) => {
			const waiter: Waiter = { resolve, reject, signal: options.signal };
			let waiters = this.#waiters.get(jobId);
			if (!waiters) {
				waiters = new Set();
				this.#waiters.set(jobId, waiters);
			}

			const cleanup = () => {
				if (waiter.timer) clearTimeout(waiter.timer);
				if (waiter.signal && waiter.onAbort)
					waiter.signal.removeEventListener("abort", waiter.onAbort);
				waiters?.delete(waiter);
				if (waiters?.size === 0) this.#waiters.delete(jobId);
			};

			if (options.timeoutMs !== undefined) {
				waiter.timer = setTimeout(() => {
					cleanup();
					reject(new BroadcastWaitTimeoutError(jobId, options.timeoutMs ?? 0));
				}, options.timeoutMs);
			}

			if (options.signal) {
				if (options.signal.aborted) {
					cleanup();
					reject(options.signal.reason ?? new Error("broadcast wait aborted"));
					return;
				}

				waiter.onAbort = () => {
					cleanup();
					reject(options.signal?.reason ?? new Error("broadcast wait aborted"));
				};
				options.signal.addEventListener("abort", waiter.onAbort, { once: true });
			}

			waiters.add(waiter);
		});
	}

	async listJobs(filter?: BroadcastStorageJobFilter): Promise<BroadcastJobState[]> {
		return this.storage.listJobs(filter);
	}

	async listDeliveries(
		jobId: string,
		filter?: BroadcastStorageDeliveryFilter,
	): Promise<BroadcastDeliveryState[]> {
		return this.storage.listDeliveries(jobId, filter);
	}

	#registerInline<const Args extends readonly [unknown, number]>(
		type: string,
		run: (args: Args) => Awaitable<unknown>,
		options: {
			onError?: (error: unknown, args: Args, delivery: BroadcastDeliveryState) => unknown;
		} = {},
	): void {
		this.#types.set(type, {
			run: (args) => run(args as unknown as Args),
			key: (args) => stringifyKey(asKey(args[0])),
			priority: () => undefined,
			shouldSkip: (error) => this.#defaultShouldSkip(error),
			onError: options.onError
				? (error, args, delivery) => options.onError?.(error, args as unknown as Args, delivery)
				: undefined,
		});
	}

	async #enqueue(
		type: string,
		items: BroadcastInput<readonly unknown[]>,
		options: BroadcastStartOptions,
	): Promise<BroadcastJobHandle> {
		if (!this.#types.has(type)) throw new BroadcastTypeNotFoundError(type);

		const id = options.id ?? this.#options.id();
		const now = this.#options.now();
		const priority = options.priority ?? 0;
		const job: BroadcastJobState = {
			id,
			type,
			status: "creating",
			total: 0,
			sent: 0,
			failed: 0,
			skipped: 0,
			retried: 0,
			priority,
			createdAt: now,
			updatedAt: now,
			metadata: options.metadata,
		};

		await this.storage.createJob(job);
		this.#emit({ type: "job_created", job: cloneJob(job) });

		const entry = this.#types.get(type);
		if (!entry) throw new BroadcastTypeNotFoundError(type);

		const batchSize = Math.max(1, options.batchSize ?? 500);
		const batch: BroadcastDeliveryState[] = [];
		let total = 0;
		let index = 0;
		const dueAt = now + Math.max(0, options.delayMs ?? 0);
		const retry = options.retry ?? entry.retry ?? this.#options.retry;
		const maxAttempts =
			retry === false ? 1 : Math.max(1, retry?.attempts ?? DEFAULT_RETRY.attempts);

		for await (const args of toAsyncIterable(items)) {
			const deliveryPriority = entry.priority(args, index) ?? priority;
			const key = entry.key(args, index);
			batch.push({
				id: `${id}:${index}`,
				jobId: id,
				type,
				index,
				args: [...args],
				status: "queued",
				attempts: 0,
				maxAttempts,
				priority: deliveryPriority,
				dueAt,
				createdAt: now,
				updatedAt: now,
				key,
			});

			index++;
			total++;

			if (batch.length >= batchSize) {
				await this.storage.addDeliveries(id, batch.splice(0));
			}
		}

		if (batch.length > 0) await this.storage.addDeliveries(id, batch);
		this.#counts.queued += total;

		const queued: BroadcastJobState = {
			...job,
			status: total === 0 ? "completed" : "queued",
			total,
			updatedAt: this.#options.now(),
			completedAt: total === 0 ? this.#options.now() : undefined,
		};

		await this.storage.patchJob(id, queued);
		this.#emit(
			total === 0 ? { type: "job_completed", job: queued } : { type: "job_queued", job: queued },
		);
		if (total === 0) this.#resolveWaiters(id, resultFromJob(queued));
		else this.#schedule(0);

		return this.#handle(id, type);
	}

	#handle(id: string, type: string): BroadcastJobHandle {
		return {
			id,
			type,
			snapshot: () => this.snapshot(id),
			wait: (options) => this.wait(id, options),
			pause: () => this.pause(id),
			resume: () => this.resume(id),
			cancel: () => this.cancel(id),
		};
	}

	#schedule(delayMs: number): void {
		if (!this.#running) return;

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
		if (!this.#running) return;
		if (this.#pumping) {
			this.#pumpAgain = true;
			return;
		}

		this.#pumping = true;
		try {
			while (this.#running && this.#active < this.#options.concurrency) {
				let delivery: BroadcastDeliveryState | undefined;
				try {
					delivery = await this.storage.claim(
						this.#options.workerId,
						this.#options.now(),
						this.#options.leaseMs,
					);
				} catch (error) {
					this.#counts.storageErrors++;
					this.#emit({ type: "storage_error", error });
					this.#schedule(1_000);
					break;
				}

				if (!delivery) break;
				this.#active++;
				void this.#process(delivery).finally(() => {
					this.#active--;
					this.#schedule(0);
				});
			}

			if (this.#active < this.#options.concurrency) {
				const nextDueAt = await this.storage.nextDueAt(this.#options.now());
				if (nextDueAt !== undefined) this.#schedule(Math.max(1, nextDueAt - this.#options.now()));
			}
		} finally {
			this.#pumping = false;
			if (this.#pumpAgain) {
				this.#pumpAgain = false;
				this.#schedule(0);
			}
		}
	}

	async #process(delivery: BroadcastDeliveryState): Promise<void> {
		const entry = this.#types.get(delivery.type);
		if (!entry) {
			await this.#failDelivery(delivery, new BroadcastTypeNotFoundError(delivery.type));
			return;
		}

		try {
			const waitMs = this.#limiter?.take() ?? 0;
			if (waitMs > 0) {
				this.#counts.rateLimited++;
				this.#emit({ type: "rate_limited", waitMs, delivery: cloneDelivery(delivery) });
				await sleep(waitMs);
			}

			this.#counts.started++;
			this.#emit({ type: "delivery_started", delivery: cloneDelivery(delivery) });
			const result = await entry.run(delivery.args);

			await this.storage.patchDelivery(delivery.jobId, delivery.id, {
				status: "sent",
				finishedAt: this.#options.now(),
				updatedAt: this.#options.now(),
				lockedBy: undefined,
				lockUntil: undefined,
				result: undefined,
			});
			this.#counts.completed++;
			this.#emit({ type: "delivery_sent", delivery: cloneDelivery(delivery), result });
			await this.#finishDelivery(delivery.jobId, { sent: 1 });
		} catch (error) {
			if (entry.shouldSkip(error, delivery.args, delivery.attempts)) {
				const patch = {
					status: "skipped" as const,
					finishedAt: this.#options.now(),
					updatedAt: this.#options.now(),
					lockedBy: undefined,
					lockUntil: undefined,
					error: errorInfo(error),
				};
				await this.storage.patchDelivery(delivery.jobId, delivery.id, patch);
				const patched = { ...delivery, ...patch };
				this.#counts.skipped++;
				this.#emit({ type: "delivery_skipped", delivery: cloneDelivery(patched), error });
				await safeCall(entry.onError, error, patched.args, patched);
				await this.#finishDelivery(delivery.jobId, { skipped: 1 });
				return;
			}

			const retry = this.#retryFor(delivery.type);
			const decision = decideRetry(error, delivery.attempts, delivery.maxAttempts, retry);
			if (decision) {
				await this.storage.patchDelivery(delivery.jobId, delivery.id, {
					status: "queued",
					dueAt: this.#options.now() + decision.delayMs,
					updatedAt: this.#options.now(),
					lockedBy: undefined,
					lockUntil: undefined,
					error: errorInfo(error),
				});
				await this.storage.incrementJob(delivery.jobId, { retried: 1 });
				this.#counts.retried++;
				this.#emit({ type: "delivery_retry", delivery: cloneDelivery(delivery), error, decision });
				this.#schedule(decision.delayMs);
				return;
			}

			await this.#failDelivery(delivery, error, entry);
		}
	}

	async #failDelivery(
		delivery: BroadcastDeliveryState,
		error: unknown,
		entry = this.#types.get(delivery.type),
	): Promise<void> {
		const patch = {
			status: "failed" as const,
			finishedAt: this.#options.now(),
			updatedAt: this.#options.now(),
			lockedBy: undefined,
			lockUntil: undefined,
			error: errorInfo(error),
		};
		await this.storage.patchDelivery(delivery.jobId, delivery.id, patch);
		const patched = { ...delivery, ...patch };
		this.#counts.failed++;
		this.#emit({ type: "delivery_failed", delivery: cloneDelivery(patched), error });
		await safeCall(entry?.onError, error, patched.args, patched);
		await this.#finishDelivery(delivery.jobId, { failed: 1 });
	}

	async #finishDelivery(
		jobId: string,
		delta: Partial<Pick<BroadcastJobState, "sent" | "failed" | "skipped">>,
	): Promise<void> {
		const job = await this.storage.incrementJob(jobId, delta);
		if (!job || isTerminal(job.status)) return;

		const processed = job.sent + job.failed + job.skipped;
		if (processed < job.total) return;

		const completed: BroadcastJobState = {
			...job,
			status: "completed",
			updatedAt: this.#options.now(),
			completedAt: this.#options.now(),
		};

		await this.storage.patchJob(jobId, completed);
		this.#emit({ type: "job_completed", job: completed });
		this.#resolveWaiters(jobId, resultFromJob(completed));
	}

	#retryFor(type: string): BroadcastRetryOptions | false {
		return this.#types.get(type)?.retry ?? this.#options.retry;
	}

	#defaultShouldSkip(error: unknown): boolean {
		return error instanceof TelegramError && this.#options.ignoredErrorCodes.includes(error.code);
	}

	async #requireJob(jobId: string): Promise<BroadcastJobState> {
		const job = await this.storage.getJob(jobId);
		if (!job) throw new BroadcastJobNotFoundError(jobId);
		return job;
	}

	#resolveWaiters(jobId: string, result: BroadcastResult): void {
		const waiters = this.#waiters.get(jobId);
		if (!waiters) return;

		this.#waiters.delete(jobId);
		for (const waiter of waiters) {
			if (waiter.timer) clearTimeout(waiter.timer);
			if (waiter.signal && waiter.onAbort)
				waiter.signal.removeEventListener("abort", waiter.onAbort);
			waiter.resolve(result);
		}
	}

	#emit(event: BroadcastEvent): void {
		try {
			this.#options.onEvent?.(event);
		} catch {
			// observability hooks must never affect delivery.
		}
	}

	#inlineType(method: string): string {
		this.#inlineTypeId++;
		return `@yaebal/broadcast:${method}:${this.#inlineTypeId}`;
	}
}

export function createBroadcast<Types extends BroadcastTypes = Record<never, never>>(
	api: Api,
	options?: BroadcastClientOptions,
): Broadcast<Types> {
	return new Broadcast<Types>(api, options);
}

/** send a text message to many chats and wait until every delivery reaches a terminal state. */
export async function broadcast(
	api: Api,
	chatIds: BroadcastTargets<ChatId>,
	text: string,
	options: BroadcastOptions = {},
): Promise<BroadcastResult> {
	const client = new Broadcast(api, {
		concurrency: options.concurrency,
		rateLimit: options.rateLimit,
		retry: options.retry,
		onEvent: options.onEvent,
	});

	try {
		return await client.sendMessage(chatIds, text, options);
	} finally {
		await client.stop({ drain: true });
	}
}

export function decideRetry(
	error: unknown,
	attempt: number,
	maxAttempts: number,
	options: BroadcastRetryOptions | false = DEFAULT_RETRY,
): BroadcastRetryDecision | undefined {
	if (options === false || attempt >= maxAttempts) return undefined;

	const retry = normalizeRetry(options);
	if (error instanceof TelegramError) {
		if (error.code === 429) {
			const retryAfterMs = getRetryAfterMs(error);
			return {
				reason: retryAfterMs === undefined ? "rate_limit" : "retry_after",
				delayMs: withJitter(
					Math.min(
						(retryAfterMs ?? delayForAttempt(attempt, retry)) +
							(retryAfterMs === undefined ? 0 : retry.retryAfterPaddingMs),
						retry.maxDelayMs,
					),
					attempt,
					error,
					retry.jitter,
				),
				retryAfterMs,
			};
		}

		if (retry.retryOnServerError && error.code >= 500) {
			return {
				reason: "server",
				delayMs: withJitter(delayForAttempt(attempt, retry), attempt, error, retry.jitter),
			};
		}

		return undefined;
	}

	if (!retry.retryOnNetwork) return undefined;
	return {
		reason: "network",
		delayMs: withJitter(delayForAttempt(attempt, retry), attempt, error, retry.jitter),
	};
}

class LocalRateLimiter {
	readonly #limit: BroadcastRateLimit;
	readonly #now: () => number;
	readonly #stamps: number[] = [];

	constructor(limit: BroadcastRateLimit, now: () => number) {
		this.#limit = limit;
		this.#now = now;
	}

	take(): number {
		const now = this.#now();
		prune(this.#stamps, now, this.#limit.windowMs);

		if (this.#stamps.length < this.#limit.limit) {
			this.#stamps.push(now);
			return 0;
		}

		const first = this.#stamps[0] ?? now;
		const waitMs = Math.max(1, first + this.#limit.windowMs - now);
		this.#stamps.push(now + waitMs);
		return waitMs;
	}
}

function normalizeOptions(options: BroadcastClientOptions): NormalizedOptions {
	return {
		storage: options.storage ?? memoryBroadcastStorage(),
		concurrency: Math.max(1, options.concurrency ?? 1),
		rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
		retry: options.retry ?? DEFAULT_RETRY,
		ignoredErrorCodes: options.ignoredErrorCodes ?? [403],
		leaseMs: Math.max(1, options.leaseMs ?? 60_000),
		autoRun: options.autoRun ?? true,
		workerId: options.workerId ?? `worker:${Math.random().toString(36).slice(2)}`,
		now: options.now ?? (() => Date.now()),
		id: options.id ?? randomId,
		onEvent: options.onEvent,
	};
}

function normalizeRetry(options: BroadcastRetryOptions): NormalizedRetry {
	return {
		attempts: Math.max(1, options.attempts ?? DEFAULT_RETRY.attempts),
		baseDelayMs: Math.max(0, options.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs),
		maxDelayMs: Math.max(0, options.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs),
		fixedDelayMs: options.fixedDelayMs,
		retryAfterPaddingMs: Math.max(
			0,
			options.retryAfterPaddingMs ?? DEFAULT_RETRY.retryAfterPaddingMs ?? 0,
		),
		retryOnNetwork: options.retryOnNetwork ?? DEFAULT_RETRY.retryOnNetwork ?? true,
		retryOnServerError: options.retryOnServerError ?? DEFAULT_RETRY.retryOnServerError ?? true,
		jitter: options.jitter ?? DEFAULT_RETRY.jitter ?? 0,
	};
}

function delayForAttempt(attempt: number, retry: NormalizedRetry): number {
	if (retry.fixedDelayMs !== undefined) return Math.min(retry.fixedDelayMs, retry.maxDelayMs);
	return Math.min(2 ** Math.max(0, attempt - 1) * retry.baseDelayMs, retry.maxDelayMs);
}

function withJitter(
	delayMs: number,
	attempt: number,
	error: unknown,
	jitter: BroadcastRetryOptions["jitter"],
): number {
	if (typeof jitter === "function") return Math.max(0, Math.round(jitter(delayMs, attempt, error)));
	if (typeof jitter !== "number" || jitter <= 0) return Math.max(0, Math.round(delayMs));

	const spread = delayMs * jitter;
	const min = delayMs - spread;
	const max = delayMs + spread;
	return Math.max(0, Math.round(min + Math.random() * (max - min)));
}

function getRetryAfterMs(error: TelegramError): number | undefined {
	const retryAfter = error.parameters?.retry_after;
	if (typeof retryAfter !== "number" || !Number.isFinite(retryAfter) || retryAfter < 0)
		return undefined;
	return retryAfter * 1000;
}

function resultFromJob(job: BroadcastJobState): BroadcastResult {
	const processed = job.sent + job.failed + job.skipped;
	const durationMs = job.completedAt !== undefined ? job.completedAt - job.createdAt : undefined;

	return {
		jobId: job.id,
		type: job.type,
		total: job.total,
		sent: job.sent,
		failed: job.failed,
		skipped: job.skipped,
		retried: job.retried,
		cancelled: job.status === "cancelled" ? Math.max(0, job.total - processed) : 0,
		status: job.status,
		durationMs,
	};
}

function errorInfo(error: unknown): BroadcastErrorInfo {
	if (error instanceof TelegramError) {
		return {
			name: error.name,
			message: error.message,
			code: error.code,
			description: error.description,
			retryAfterMs: getRetryAfterMs(error),
		};
	}

	if (error instanceof Error) return { name: error.name, message: error.message };
	return { message: String(error) };
}

function cloneJob(job: BroadcastJobState): BroadcastJobState {
	return { ...job, metadata: job.metadata ? { ...job.metadata } : undefined };
}

function cloneDelivery(delivery: BroadcastDeliveryState): BroadcastDeliveryState {
	return {
		...delivery,
		args: [...delivery.args],
		error: delivery.error ? { ...delivery.error } : undefined,
	};
}

function matchesJob(job: BroadcastJobState, filter: BroadcastStorageJobFilter): boolean {
	if (filter.type !== undefined && job.type !== filter.type) return false;
	if (filter.status !== undefined) return includes(filter.status, job.status);
	return true;
}

function matchesDelivery(
	delivery: BroadcastDeliveryState,
	filter: BroadcastStorageDeliveryFilter,
): boolean {
	if (filter.status !== undefined) return includes(filter.status, delivery.status);
	return true;
}

function includes<T extends string>(value: T | readonly T[], item: T): boolean {
	return Array.isArray(value) ? value.includes(item) : value === item;
}

function isTerminal(status: BroadcastStatus): boolean {
	return status === "completed" || status === "cancelled";
}

async function* toAsyncIterable<T>(items: Iterable<T> | AsyncIterable<T>): AsyncIterable<T> {
	if (isAsyncIterable(items)) {
		for await (const item of items) yield item;
		return;
	}

	for (const item of items) yield item;
}

async function* indexedTargets<T>(
	targets: BroadcastTargets<T>,
): AsyncIterable<readonly [T, number]> {
	let index = 0;
	for await (const target of toAsyncIterable(targets)) yield [target, index++] as const;
}

function isAsyncIterable<T>(value: Iterable<T> | AsyncIterable<T>): value is AsyncIterable<T> {
	return typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function";
}

function prune(stamps: number[], now: number, windowMs: number): void {
	const cutoff = now - windowMs;
	let drop = 0;
	while (drop < stamps.length && (stamps[drop] ?? Number.POSITIVE_INFINITY) <= cutoff) drop++;
	if (drop > 0) stamps.splice(0, drop);
}

function stringifyKey(value: string | number | undefined): string | undefined {
	if (value === undefined) return undefined;
	return String(value);
}

function asKey(value: unknown): string | number | undefined {
	if (typeof value === "string" || typeof value === "number") return value;
	return undefined;
}

function randomId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function safeCall<Args extends readonly unknown[]>(
	fn: ((...args: Args) => unknown) | undefined,
	...args: Args
): Promise<void> {
	try {
		await fn?.(...args);
	} catch {
		// user hooks are observational by default.
	}
}
