import { type Api, type FileReader, createApi } from "./api.js";
import { Composer, type Middleware } from "./composer.js";
import { Context } from "./context.js";
import type { Update, UpdateName, User } from "./telegram-types.js";

export interface BotOptions {
	apiRoot?: string;
	/**
	 * Resolve `media.path()` into bytes. Injected per runtime so core stays free of any
	 * `node:` import. The `yaebal` package wires an auto-detecting default; on bare core
	 * (or edge) leave it unset and `media.path()` throws — send `media.buffer()`/`url()`.
	 */
	readFile?: FileReader;
	/** Update types to request; `undefined` = Telegram default. */
	allowedUpdates?: UpdateName[];
	/**
	 * Build the context for each update. Defaults to the base {@link Context}.
	 * Higher-level packages (e.g. the `yaebal` meta-package) inject a factory here
	 * to produce richer per-update contexts with auto-generated shortcut methods.
	 */
	contextFactory?: (api: Api, update: Update, updateType: UpdateName) => Context;
}

type StartHandler = (info: User) => unknown | Promise<unknown>;
type ErrorHandler = (error: unknown, ctx: Context) => unknown | Promise<unknown>;

function detectUpdateType(update: Update): UpdateName {
	for (const key of Object.keys(update)) {
		if (key === "update_id") continue;
		return key as UpdateName;
	}
	return "message" as UpdateName;
}

/**
 * The bot. Extends {@link Composer}, so the whole chainable, type-accumulating
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

	/** Bot account info, available after `start()`. */
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
	): Bot<C & Add> {
		plugin(this);
		return this as unknown as Bot<C & Add>;
	}

	/** Register a callback fired once the bot has started. */
	onStart(handler: StartHandler): this {
		this.#startHandlers.push(handler);
		return this;
	}

	/** Replace the default error handler. */
	onError(handler: ErrorHandler): this {
		this.#errorHandler = handler;
		return this;
	}

	/**
	 * Run the middleware chain for a single update. This is the webhook entry
	 * point — call it from your HTTP handler. Errors go to the error handler.
	 *
	 * The chain is realized (and frozen) on the first call, so register all
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

	/** Start long polling. Resolves only when `stop()` is called. */
	async start(): Promise<void> {
		if (this.#running) return;
		this.#running = true;

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
	}

	/** Stop the polling loop. */
	stop(): void {
		this.#running = false;
	}
}
