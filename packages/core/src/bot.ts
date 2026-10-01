import { type Api, createApi, type FileReader, withReplyEnvelope } from "./api.js";
import { Composer, type Middleware } from "./composer.js";
import { Context } from "./context.js";
import { delay } from "./delay.js";
import type { Update, UpdateName, User } from "./telegram-types.js";
import type { HandleUpdateOptions } from "./webhook.js";

export type BotPlugin<In extends Context = Context, Out extends object = Record<never, never>> = <
	C extends In,
>(
	bot: Bot<C>,
) => Bot<C & Out>;

export interface BotOptions {
	apiRoot?: string;
	/**
	 * resolve `media.path()` into bytes. injected per runtime so core stays free of any
	 * `node:` import. the `yaebal` package wires an auto-detecting default; on bare core
	 * (or edge) leave it unset and `media.path()` throws — send `media.buffer()`/`url()`.
	 */
	readFile?: FileReader;
	/** update types to request; `undefined` = telegram default. */
	allowedUpdates?: UpdateName[];
	/**
	 * build the context for each update. defaults to the base {@link Context}.
	 * higher-level packages (e.g. the `yaebal` meta-package) inject a factory here
	 * to produce richer per-update contexts with auto-generated shortcut methods.
	 * `me` is the bot's own account when known (long polling fills it after `getMe`).
	 */
	contextFactory?: (api: Api, update: Update, updateType: UpdateName, me?: User) => Context;
	/**
	 * the bot's own account, if already known — skips the `getMe` that `init()` /
	 * `start()` would otherwise fire. worth passing on serverless webhooks to
	 * shave a round trip off the cold start.
	 */
	botInfo?: User;
}

type StartHandler = (info: User) => unknown | Promise<unknown>;
type StopHandler = () => unknown | Promise<unknown>;
type ErrorHandler = (error: unknown, ctx: Context) => unknown | Promise<unknown>;
/** what the polling loop knows about a failure when it hands it to {@link Bot.onPollingError}. */
export interface PollingErrorInfo {
	/** how many consecutive `getUpdates` calls have failed, this one included. resets on success. */
	attempt: number;
	/** how long the loop waits before the next attempt. */
	retryInMs: number;
	/** true when the poll was aborted (the hang timer fired) rather than failing on the wire. */
	aborted: boolean;
}

type PollingErrorHandler = (error: unknown, info: PollingErrorInfo) => unknown | Promise<unknown>;

/** server-side long-poll window (seconds) requested from getUpdates. */
const POLL_TIMEOUT_S = 30;
/** grace on top of the window before a silent, hung connection is aborted and retried. */
const POLL_GRACE_MS = 15_000;
/** pause before retrying after a failed getUpdates — doubles per consecutive failure. */
const POLL_RETRY_MS = 3_000;
/** ceiling for that backoff, so a long outage retries every 30s instead of every 3s. */
const POLL_RETRY_MAX_MS = 30_000;
/**
 * consecutive hang-timeout aborts tolerated quietly. one abort is the normal recovery from a
 * connection the proxy dropped without closing — reporting it as an error trains operators to
 * ignore the channel. a run of them means the link is actually broken, and that is worth hearing.
 */
const POLL_QUIET_ABORTS = 3;

/** an abort (stop, or the hang timer) rather than a real transport/API failure. */
function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function detectUpdateType(update: Update): UpdateName {
	for (const key of Object.keys(update)) {
		if (key === "update_id") continue;
		return key as UpdateName;
	}

	return "message" as UpdateName;
}

/**
 * the bot. extends {@link Composer}, so the whole chainable, type-accumulating
 * surface is available — and `derive` / `decorate` / `extend` keep returning a
 * `Bot` (not a bare `Composer`) so lifecycle methods stay reachable down the chain.
 */
export class Bot<C extends Context = Context> extends Composer<C> {
	readonly api: Api;
	#running = false;
	#offset = 0;
	#info?: User;
	#pollAbort?: AbortController;
	readonly #options: BotOptions;
	readonly #startHandlers: StartHandler[] = [];
	readonly #stopHandlers: StopHandler[] = [];
	#stopPromise?: Promise<void>;
	#errorHandler: ErrorHandler = (error) => {
		console.error("[yaebal] unhandled error in middleware:", error);
	};
	#pollingErrorHandler: PollingErrorHandler = (error, info) => {
		console.error(
			`[yaebal] getUpdates failed (attempt ${info.attempt}), retrying in ${info.retryInMs / 1000}s:`,
			error,
		);
	};
	#handle?: Middleware<Context>;
	#initPromise?: Promise<User>;

	constructor(token: string, options: BotOptions = {}) {
		super();
		if (!token) throw new Error("Bot(token): token is required");

		this.#options = options;
		this.#info = options.botInfo;
		this.api = createApi(token, { apiRoot: options.apiRoot, readFile: options.readFile });
	}

	/** bot account info, available after `init()` / `start()` (or via the `botInfo` option). */
	get info(): User | undefined {
		return this.#info;
	}

	/**
	 * resolve the bot's own account via `getMe` — cached, concurrent calls
	 * coalesce, and the `botInfo` option skips the request entirely. `start()`
	 * runs this; webhook handlers run it lazily on the first update so
	 * `ctx.me` and `/cmd@botname` addressing work without long polling.
	 */
	async init(): Promise<User> {
		if (this.#info) return this.#info;

		this.#initPromise ??= this.api.getMe().then(
			(me) => {
				this.#info = me;
				return me;
			},
			(error) => {
				this.#initPromise = undefined; // a failed probe shouldn't poison later attempts
				throw error;
			},
		);

		return this.#initPromise;
	}

	override derive<D extends object>(fn: (ctx: C) => D | Promise<D>): Bot<C & D>;
	override derive<D extends object>(
		updates: UpdateName | UpdateName[],
		fn: (ctx: C) => D | Promise<D>,
	): Bot<C & Partial<D>>;
	// biome-ignore lint/suspicious/noExplicitAny: overload implementation
	override derive(a: any, b?: any): any {
		// biome-ignore lint/suspicious/noExplicitAny: forwarding to the overloaded base
		(super.derive as any)(a, b);
		return this;
	}

	override decorate<D extends object>(value: D): Bot<C & D> {
		super.decorate(value);
		return this as unknown as Bot<C & D>;
	}

	override guard<C2 extends C>(predicate: (ctx: C) => ctx is C2): Bot<C2>;
	override guard(predicate: (ctx: C) => boolean | Promise<boolean>): this;
	// biome-ignore lint/suspicious/noExplicitAny: overload implementation forwards to the base
	override guard(predicate: (ctx: C) => boolean | Promise<boolean>): any {
		super.guard(predicate);
		return this;
	}

	override extend<C2 extends Context>(other: Composer<C2>): Bot<C & C2> {
		super.extend(other);
		return this as unknown as Bot<C & C2>;
	}

	override install<Add extends object>(
		plugin: (composer: Composer<C>) => Composer<C & Add>,
	): Bot<C & Add>;
	override install<Add extends object>(plugin: (bot: Bot<C>) => Bot<C & Add>): Bot<C & Add>;
	override install<Add extends object>(
		plugin: ((composer: Composer<C>) => Composer<C & Add>) | ((bot: Bot<C>) => Bot<C & Add>),
	): Bot<C & Add> {
		// biome-ignore lint/suspicious/noExplicitAny: overloaded plugin entry point
		const out = (plugin as any)(this);

		if (out !== this) {
			throw new Error(
				"install(): the plugin must chain on (and return) the composer it was given — returning a different composer would silently detach its middleware",
			);
		}

		return this as unknown as Bot<C & Add>;
	}

	/** register a callback fired once the bot has started. */
	onStart(handler: StartHandler): this {
		this.#startHandlers.push(handler);
		return this;
	}

	/** register a callback fired when `stop()` is requested or polling exits. */
	onStop(handler: StopHandler): this {
		this.#stopHandlers.push(handler);
		return this;
	}

	/** replace the default error handler. */
	onError(handler: ErrorHandler): this {
		this.#errorHandler = handler;
		return this;
	}

	/**
	 * replace the default polling-error handler (a `console.error`). called when a `getUpdates`
	 * long poll fails; polling retries either way, backing off 3s → 30s while failures repeat and
	 * resetting on the first success. the second argument carries the consecutive-failure count and
	 * the wait before the next attempt, so an alerting handler can throttle itself.
	 *
	 * the routine hang-timeout abort (a connection a proxy dropped without closing) is retried
	 * silently the first {@link POLL_QUIET_ABORTS} times — only a run of them reaches the handler.
	 */
	onPollingError(handler: PollingErrorHandler): this {
		this.#pollingErrorHandler = handler;
		return this;
	}

	/**
	 * run the middleware chain for a single update. this is the webhook entry
	 * point — call it from your HTTP handler. errors go to the error handler.
	 *
	 * the chain is realized (and frozen) on the first call, so register all
	 * middleware/plugins before the first `handleUpdate` / `start`.
	 */
	async handleUpdate(update: Update, options?: HandleUpdateOptions): Promise<void> {
		if (!this.#handle) this.#handle = this.toMiddleware() as unknown as Middleware<Context>;

		const api = options?.replyEnvelope
			? withReplyEnvelope(this.api, options.replyEnvelope)
			: this.api;
		const updateType = detectUpdateType(update);
		let ctx: Context | undefined;

		try {
			ctx = this.#options.contextFactory
				? this.#options.contextFactory(api, update, updateType, this.#info)
				: new Context({ api, update, updateType, me: this.#info });
			await this.#handle(ctx, async () => {});
		} catch (error) {
			// a throwing contextFactory lands here too — hand the error handler a
			// bare context so it still sees the update.
			await this.#errorHandler(
				error,
				ctx ?? new Context({ api, update, updateType, me: this.#info }),
			);
		}
	}

	/**
	 * start long polling. resolves only when `stop()` is called — it is the loop itself, not a
	 * fire-and-forget kick, so hold the promise (`const polling = bot.start()`) if anything else
	 * has to run after it.
	 *
	 * updates in a batch are handled strictly one after another. that keeps ordering trivial, but
	 * one slow handler delays every update behind it — long enough and telegram rejects the
	 * follow-up with "query is too old and response timeout expired" (callback queries) or drops
	 * an inline answer. install `@yaebal/runner` for bounded concurrency (per-chat order kept)
	 * when handlers do real work.
	 */
	async start(): Promise<void> {
		if (this.#running) return;
		this.#running = true;
		this.#stopPromise = undefined;
		this.#pollAbort = new AbortController();

		try {
			const info = await this.init();
			for (const handler of this.#startHandlers) await handler(info);

			// consecutive getUpdates failures — drives the backoff and the quiet-abort window
			let failures = 0;

			while (this.#running) {
				let updates: Update[];

				// per-request signal: aborted by stop() (so start() resolves promptly instead
				// of waiting out the poll window) OR by the hang timeout — a connection that
				// stays silent past the long-poll window + grace would otherwise stall the
				// bot forever, since fetch itself never times out. (manual composition —
				// AbortSignal.any needs node >= 20.3.)
				const poll = new AbortController();
				const onStop = () => poll.abort();
				this.#pollAbort.signal.addEventListener("abort", onStop, { once: true });
				const hangTimer = setTimeout(() => poll.abort(), POLL_TIMEOUT_S * 1000 + POLL_GRACE_MS);

				try {
					updates = await this.api.call<Update[]>(
						"getUpdates",
						{
							offset: this.#offset,
							timeout: POLL_TIMEOUT_S,
							...(this.#options.allowedUpdates
								? { allowed_updates: this.#options.allowedUpdates }
								: {}),
						},
						{ signal: poll.signal },
					);
				} catch (error) {
					if (!this.#running) break;

					const aborted = isAbortError(error);
					failures++;
					// a hang abort already cost the full poll window — go straight back out on the
					// wire instead of adding a pause on top; a real failure backs off exponentially.
					const retryInMs = aborted
						? 0
						: Math.min(POLL_RETRY_MS * 2 ** (failures - 1), POLL_RETRY_MAX_MS);

					// the first couple of hang aborts are routine recovery, not news
					if (!aborted || failures > POLL_QUIET_ABORTS)
						await this.#pollingErrorHandler(error, { attempt: failures, retryInMs, aborted });

					if (retryInMs) await delay(retryInMs, this.#pollAbort.signal);
					continue;
				} finally {
					clearTimeout(hangTimer);
					this.#pollAbort.signal.removeEventListener("abort", onStop);
				}

				failures = 0;

				for (const update of updates) {
					this.#offset = update.update_id + 1;
					await this.handleUpdate(update);
				}
			}
		} finally {
			this.#running = false;
			this.#pollAbort = undefined;
			await this.#runStopHandlers();
		}
	}

	/** stop the polling loop (aborting the in-flight long poll) and run registered stop handlers once. */
	stop(): Promise<void> {
		this.#running = false;
		this.#pollAbort?.abort();
		return this.#runStopHandlers();
	}

	#runStopHandlers(): Promise<void> {
		this.#stopPromise ??= (async () => {
			for (const handler of this.#stopHandlers) await handler();
		})();

		return this.#stopPromise;
	}
}
