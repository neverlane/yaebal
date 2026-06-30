import { type Api, createApi, type FileReader } from "./api.js";
import { Composer, type Middleware } from "./composer.js";
import { Context } from "./context.js";
import type { Update, UpdateName, User } from "./telegram-types.js";

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
	 * gigher-level packages (e.g. the `yaebal` meta-package) inject a factory here
	 * to produce richer per-update contexts with auto-generated shortcut methods.
	 */
	contextFactory?: (api: Api, update: Update, updateType: UpdateName) => Context;
}

type StartHandler = (info: User) => unknown | Promise<unknown>;
type StopHandler = () => unknown | Promise<unknown>;
type ErrorHandler = (error: unknown, ctx: Context) => unknown | Promise<unknown>;

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
	readonly #options: BotOptions;
	readonly #startHandlers: StartHandler[] = [];
	readonly #stopHandlers: StopHandler[] = [];
	#stopPromise?: Promise<void>;
	#errorHandler: ErrorHandler = (error) => {
		console.error("[yaebal] unhandled error in middleware:", error);
	};
	#handle?: Middleware<Context>;

	constructor(token: string, options: BotOptions = {}) {
		super();
		if (!token) throw new Error("Bot(token): token is required");

		this.#options = options;
		this.api = createApi(token, { apiRoot: options.apiRoot, readFile: options.readFile });
	}

	/** bot account info, available after `start()`. */
	get info(): User | undefined {
		return this.#info;
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
		(plugin as any)(this);
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
	 * run the middleware chain for a single update. this is the webhook entry
	 * point — call it from your HTTP handler. errors go to the error handler.
	 *
	 * the chain is realized (and frozen) on the first call, so register all
	 * middleware/plugins before the first `handleUpdate` / `start`.
	 */
	async handleUpdate(update: Update): Promise<void> {
		if (!this.#handle) this.#handle = this.toMiddleware() as unknown as Middleware<Context>;

		const updateType = detectUpdateType(update);
		const ctx = this.#options.contextFactory
			? this.#options.contextFactory(this.api, update, updateType)
			: new Context({ api: this.api, update, updateType });

		try {
			await this.#handle(ctx, async () => {});
		} catch (error) {
			await this.#errorHandler(error, ctx);
		}
	}

	/** start long polling. resolves only when `stop()` is called. */
	async start(): Promise<void> {
		if (this.#running) return;
		this.#running = true;
		this.#stopPromise = undefined;

		try {
			this.#info = await this.api.getMe();
			for (const handler of this.#startHandlers) await handler(this.#info);

			while (this.#running) {
				let updates: Update[];

				try {
					updates = await this.api.getUpdates({
						offset: this.#offset,
						timeout: 30,
						...(this.#options.allowedUpdates
							? { allowed_updates: this.#options.allowedUpdates }
							: {}),
					});
				} catch (error) {
					if (!this.#running) break;

					console.error("[yaebal] getUpdates failed, retrying in 3s:", error);

					await new Promise((r) => setTimeout(r, 3000));
					continue;
				}

				for (const update of updates) {
					this.#offset = update.update_id + 1;
					await this.handleUpdate(update);
				}
			}
		} finally {
			this.#running = false;
			await this.#runStopHandlers();
		}
	}

	/** stop the polling loop and run registered stop handlers once. */
	stop(): Promise<void> {
		this.#running = false;
		return this.#runStopHandlers();
	}

	#runStopHandlers(): Promise<void> {
		this.#stopPromise ??= (async () => {
			for (const handler of this.#stopHandlers) await handler();
		})();

		return this.#stopPromise;
	}
}
