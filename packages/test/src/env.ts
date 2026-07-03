import type { Update } from "@yaebal/core";
import { type Api, type Composer, Context, type NextFn } from "@yaebal/core";
import type { RecordedCall } from "./api.js";
import { type MockApi, type MockResult, mockApi } from "./api.js";
import {
	attachBotMessageTracking,
	type BotMessage,
	type BotMessageTracker,
	type LastBotMessageQuery,
} from "./bot-messages.js";
import { ChatActor, type ChatType, type CreateChatOptions } from "./chat-actor.js";
import { installTestClock, type TestClock } from "./clock.js";
import type { ActorHost } from "./internal.js";
import { type BuildUserOptions, buildUser, createUpdate, detectUpdateType } from "./updates.js";
import { UserActor } from "./user-actor.js";

export type { ApiErrorSentinel, MockResult, OnApiOptions, RecordedCall } from "./api.js";
export { apiError, isApiErrorSentinel, TestApiError } from "./api.js";
export type { BotMessage, LastBotMessageQuery } from "./bot-messages.js";
export {
	ChatActor,
	type ChatMembership,
	type ChatType,
	type CreateChatOptions,
} from "./chat-actor.js";
export { installTestClock, type TestClock } from "./clock.js";
export {
	type MediaOptions,
	type MessageOptions,
	UserActor,
	UserInChatScope,
	UserOnMessageScope,
} from "./user-actor.js";

/** a satellite plugin's canned test fixtures — pass to {@link createTestEnv} via `options.packs`. explicit (you always list which packs apply), matching yaebal's "no implicit plugin wiring" rule. */
export interface TestPack<C extends Context = Context> {
	readonly name: string;
	setup(env: TestEnv<C>): void;
}

export interface TestEnvOptions<C extends Context = Context> {
	/** seed permanent per-method replies — same as calling `env.onApi(method, result)` for each entry. */
	results?: Record<string, MockResult>;
	/** throw instead of returning `{}` when a method has no builtin default and no override. default `false`. */
	strictApi?: boolean;
	/** throw if an actor-driven update falls through the whole bot with no handler consuming it. default `false`. */
	strictDispatch?: boolean;
	/** satellite-plugin test packs to apply (see {@link TestPack}). */
	packs?: TestPack<C>[];
}

/**
 * the actor-driven test environment: wraps a `Composer`/`Bot`, intercepts every outgoing api
 * call (no real HTTP), and hands out {@link UserActor}/{@link ChatActor} actors that dispatch
 * real updates through it — the way real Telegram users would.
 */
export class TestEnv<C extends Context = Context> implements ActorHost {
	readonly api: Api;
	readonly apiCalls: RecordedCall[];
	readonly hooks: MockApi["hooks"];
	readonly users: UserActor[] = [];
	readonly chats: ChatActor[] = [];

	private readonly bot: Composer<C>;
	private readonly mock: MockApi;
	private readonly botMessages: BotMessageTracker;
	private readonly strictDispatch: boolean;
	private readonly postDispatchHooks: Array<(update: Update) => void | Promise<void>> = [];
	private clock: TestClock | undefined;
	private messageIdCounter = 0;

	constructor(bot: Composer<C>, options: TestEnvOptions<C> = {}) {
		this.bot = bot;
		this.strictDispatch = options.strictDispatch ?? false;

		this.mock = mockApi({
			results: options.results,
			strictApi: options.strictApi,
			now: () => this.now(),
		});
		this.api = this.mock.api;
		this.apiCalls = this.mock.calls;
		this.hooks = this.mock.hooks;
		this.botMessages = attachBotMessageTracking(this.api, (chatId) => this.resolveChatType(chatId));

		for (const pack of options.packs ?? []) pack.setup(this);
	}

	/** the clock's current time if {@link advanceTime} has installed one, else the real `Date.now()`. */
	now(): number {
		return this.clock ? this.clock.now() : Date.now();
	}

	nextMessageId(): number {
		return ++this.messageIdCounter;
	}

	private resolveChatType(chatId: number): ChatType {
		for (const chat of this.chats) if (chat.id === chatId) return chat.type;
		for (const user of this.users) if (user.pmChat.id === chatId) return "private";

		return "private";
	}

	/** create a user actor. auto-allocates an id unless one is given. */
	createUser(options: BuildUserOptions = {}): UserActor {
		const user = new UserActor(this, buildUser(options));
		this.users.push(user);
		return user;
	}

	/** create a chat actor (group/supergroup/channel/private). */
	createChat(options: CreateChatOptions): ChatActor {
		const chat = new ChatActor(this, options);
		this.chats.push(chat);
		return chat;
	}

	/**
	 * dispatch a raw {@link Update} through the bot — the escape hatch beneath every actor
	 * method, for update shapes the actors don't cover (business connections, exotic service
	 * messages, whatever ships in the next Bot API release before the actors catch up).
	 */
	async dispatch(update: Update): Promise<void> {
		const ctx = new Context({
			api: this.api,
			update,
			updateType: detectUpdateType(update),
		}) as unknown as C;

		let reachedEnd = false;
		const sentinel: NextFn = async () => {
			reachedEnd = true;
		};

		await this.bot.toMiddleware()(ctx, sentinel);

		if (this.strictDispatch && reachedEnd) {
			throw new Error(
				`TestEnv: no handler consumed a "${detectUpdateType(update)}" update (strictDispatch is on)`,
			);
		}

		for (const hook of this.postDispatchHooks) await hook(update);
	}

	/** alias for {@link dispatch} — ships an arbitrary update payload, puregram-style naming. */
	inject(update: Update): Promise<void> {
		return this.dispatch(update);
	}

	/** run `fn` after every actor-driven (or `dispatch`ed) update finishes. hooks compose in registration order. */
	onPostDispatch(fn: (update: Update) => void | Promise<void>): void {
		this.postDispatchHooks.push(fn);
	}

	/** override a method's reply. permanent unless `opts.times` is given. */
	onApi(...args: Parameters<MockApi["onApi"]>): void {
		this.mock.onApi(...args);
	}

	/** drop a method's overrides (or every method's, if none given). */
	offApi(method?: string): void {
		this.mock.offApi(method);
	}

	/** the most recent recorded call, optionally filtered to a method. */
	lastApiCall(method?: string): RecordedCall | undefined {
		return this.mock.lastCall(method);
	}

	/** every recorded call to a given method, in call order. */
	callsTo(method: string): RecordedCall[] {
		return this.mock.callsTo(method);
	}

	/** empty `apiCalls` and drop tracked bot messages — useful between logical phases of a test. */
	clearApiCalls(): void {
		this.mock.reset();
		this.botMessages.clear();
	}

	/** the bot's most recent `send*`/`forwardMessage`/`copyMessage`, optionally filtered; kept in sync with later edits. */
	lastBotMessage(query?: LastBotMessageQuery): BotMessage | undefined {
		return this.botMessages.lastBotMessage(query);
	}

	/** look up a specific bot message by `(chat_id, message_id)`. */
	botMessage(chatId: number, messageId: number): BotMessage | undefined {
		return this.botMessages.botMessage(chatId, messageId);
	}

	/**
	 * arm the virtual clock (a no-op if one is already installed) — call this *before* triggering
	 * the code that schedules the timer you plan to fast-forward with {@link advanceTime}, the
	 * same way you'd call `vi.useFakeTimers()` before the code under test runs. a timer scheduled
	 * against the real clock before this call is invisible to `advanceTime` — it was never handed
	 * to the virtual scheduler.
	 */
	useFakeTimers(): void {
		this.clock ??= installTestClock();
	}

	/** advance the (auto-armed) virtual clock by `ms`, firing due timers. see {@link installTestClock}. */
	async advanceTime(ms: number): Promise<void> {
		this.useFakeTimers();
		await (this.clock as TestClock).advance(ms);
	}

	/** did the bot answer `answerPreCheckoutQuery` for `preCheckoutQueryId` with `ok: true`? used by `sendSuccessfulPayment`. */
	answeredPreCheckoutQuery(preCheckoutQueryId: string): boolean {
		return this.callsTo("answerPreCheckoutQuery").some(
			(call) =>
				!call.error &&
				call.params?.pre_checkout_query_id === preCheckoutQueryId &&
				call.params?.ok === true,
		);
	}

	/** restore the virtual clock (if one was installed) to real timers. call in `afterEach`/teardown. */
	shutdown(): void {
		this.clock?.restore();
		this.clock = undefined;
	}
}

/** create a {@link TestEnv} wrapping `bot` — the main entry point of `@yaebal/test`. */
export function createTestEnv<C extends Context = Context>(
	bot: Composer<C>,
	options?: TestEnvOptions<C>,
): TestEnv<C> {
	return new TestEnv(bot, options);
}

export { createUpdate };
