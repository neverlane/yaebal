/**
 * @yaebal/test — testing utilities for yaebal bots, with zero dependency on any
 * test runner or assertion library. Works with `node:test`, vitest, bun:test,
 * jest, ava — anything that can `await` a promise and call `assert`.
 *
 * every plugin test used to hand-build fake updates and a mock api. this package
 * extracts that boilerplate: {@link mockApi} records every call (and can drive
 * real `before`/`after`/`onError` hooks and simulate failures), the `*Update`
 * factories produce real {@link Update} shapes for every update kind, and
 * {@link createContext} wraps one in a core {@link Context}.
 */

import {
	type AfterHook,
	type Api,
	type BeforeHook,
	type Composer,
	Context,
	type ErrorAction,
	type ErrorHook,
	type Message,
	type NextFn,
	type Update,
	type UpdateName,
	type UpdateSink,
} from "@yaebal/core";

/** the payload type for a given update kind — reuses core's `Update` shape, no extra types package needed. */
type Payload<K extends UpdateName> = NonNullable<Update[K]>;

/** a single recorded api call: the method name and the params it was given. */
export interface RecordedCall {
	method: string;
	params: Record<string, unknown> | undefined;
}

/** a canned result for one method: a static value, an `Error` to throw, or a function of `(params, attempt)`. */
export type MockResult =
	| unknown
	| Error
	| ((params: Record<string, unknown> | undefined, attempt: number) => unknown);

export interface MockApiOptions {
	/**
	 * per-method canned results/errors, keyed by method name — overrides the
	 * built-in defaults. a function receives `attempt`, a 1-based count of how
	 * many times that method has been called (including retries), so you can
	 * simulate "fails twice, then succeeds": `sendMessage: (p, a) => a <= 2 ? new
	 * TelegramError(...) : { message_id: 1 }`.
	 */
	results?: Record<string, MockResult>;
}

/** result of {@link mockApi}: the fake `api`, its recorded calls, and inspection helpers. */
export interface MockApi {
	api: Api;
	calls: RecordedCall[];
	/** hooks registered on `api` via `before`/`after`/`onError` — inspect them or invoke them yourself. */
	hooks: { before: BeforeHook[]; after: AfterHook[]; onError: ErrorHook[] };
	/** the most recent recorded call, optionally filtered to a method. */
	lastCall(method?: string): RecordedCall | undefined;
	/** every recorded call to a given method, in call order. */
	callsTo(method: string): RecordedCall[];
	/** set (or replace) the canned result/error for a method after creation. */
	setResult(method: string, result: MockResult): void;
	/** clear recorded calls and per-method attempt counters. keeps hooks and result overrides. */
	reset(): void;
}

/** default results for known methods; everything else resolves to `{}`. */
function builtinResult(method: string, nextMessageId: () => number): unknown {
	if (method.startsWith("send") || method === "copyMessage" || method === "forwardMessage") {
		return { message_id: nextMessageId() };
	}

	if (method === "answerCallbackQuery") return true;
	if (method === "getMe") return { id: 1, is_bot: true, first_name: "bot", username: "bot" };

	return {};
}

/**
 * a fake {@link Api} whose every method records `{ method, params }` into `calls`
 * and resolves to a sensible default (auto-incrementing `message_id` for `send*`,
 * `true` for `answerCallbackQuery`, `{}` otherwise) — or to whatever `options.results`
 * says. `before`/`after`/`onError` are real hook registrars (not no-ops): register
 * a hook the same way you would on the production `Api` and it actually runs,
 * including retries requested by an `onError` hook. the mock never actually waits
 * on a requested `delayMs` — retries settle instantly, so tests stay fast.
 */
export function mockApi(options: MockApiOptions = {}): MockApi {
	const calls: RecordedCall[] = [];
	const overrides: Record<string, MockResult> = { ...options.results };
	const attempts = new Map<string, number>();
	let nextMessageId = 1;

	const hooks = {
		before: [] as BeforeHook[],
		after: [] as AfterHook[],
		onError: [] as ErrorHook[],
	};

	function resolveResult(method: string, params: Record<string, unknown> | undefined): unknown {
		const attempt = (attempts.get(method) ?? 0) + 1;
		attempts.set(method, attempt);

		const override = overrides[method];
		if (typeof override === "function") {
			return (override as (p: typeof params, a: number) => unknown)(params, attempt);
		}

		return override !== undefined ? override : builtinResult(method, () => nextMessageId++);
	}

	const call = async (method: string, params?: Record<string, unknown>): Promise<never> => {
		let p = params;
		for (const hook of hooks.before) {
			const next = await hook(method, p);
			if (next !== undefined) p = next;
		}

		for (let attempt = 1; ; attempt++) {
			calls.push({ method, params: p });

			let result: unknown;
			try {
				result = resolveResult(method, p);
				if (result instanceof Error) throw result;
			} catch (error) {
				let retry: ErrorAction | undefined;
				for (const hook of hooks.onError) {
					const action = await hook(method, error, attempt);
					if (action?.retry) {
						retry = action;
						break;
					}
				}

				if (!retry) throw error;
				continue; // the mock never actually waits on retry.delayMs
			}

			for (const hook of hooks.after) {
				const next = await hook(method, p, result);
				if (next !== undefined) result = next;
			}

			return result as never;
		}
	};

	const registrar: Record<string, unknown> = {
		call: (method: string, params?: Record<string, unknown>) => call(method, params),
		fileUrl: (filePath: string) => `https://example.invalid/file/${filePath}`,
		before(hook: BeforeHook) {
			hooks.before.push(hook);
			return api;
		},
		after(hook: AfterHook) {
			hooks.after.push(hook);
			return api;
		},
		onError(hook: ErrorHook) {
			hooks.onError.push(hook);
			return api;
		},
	};

	const api = new Proxy(registrar, {
		get(obj, prop: string) {
			if (prop in obj) return obj[prop];

			const method = (params?: Record<string, unknown>) => call(prop, params);
			obj[prop] = method;

			return method;
		},
	}) as unknown as Api;

	return {
		api,
		calls,
		hooks,
		lastCall: (method) =>
			method ? [...calls].reverse().find((c) => c.method === method) : calls.at(-1),
		callsTo: (method) => calls.filter((c) => c.method === method),
		setResult: (method, result) => {
			overrides[method] = result;
		},
		reset: () => {
			calls.length = 0;
			attempts.clear();
			nextMessageId = 1;
		},
	};
}

let updateIdCounter = 0;

/** build an {@link Update} from a partial, filling in a fresh `update_id`. */
export function createUpdate(partial: Partial<Update> = {}): Update {
	return { update_id: ++updateIdCounter, ...partial };
}

const stubUser = (id: number) => ({ id, is_bot: false, first_name: "u" });

/** options shared by the message-shaped factories (`message`, `edited_message`, `channel_post`, ...). */
export interface MessageUpdateOptions {
	text?: string;
	chatId?: number;
	fromId?: number;
	chatType?: "private" | "group" | "supergroup" | "channel";
}

function buildMessage(
	options: MessageUpdateOptions,
	defaultChatType: NonNullable<MessageUpdateOptions["chatType"]>,
): Message {
	const { text = "", chatId = 1, fromId = chatId, chatType = defaultChatType } = options;

	return {
		message_id: 1,
		date: 0,
		chat: { id: chatId, type: chatType },
		from: stubUser(fromId),
		text,
	};
}

/** build a `message` {@link Update}. */
export function messageUpdate(options: MessageUpdateOptions = {}): Update {
	return createUpdate({ message: buildMessage(options, "private") });
}

/** build an `edited_message` {@link Update}. */
export function editedMessageUpdate(options: MessageUpdateOptions = {}): Update {
	return createUpdate({ edited_message: buildMessage(options, "private") });
}

/** build a `channel_post` {@link Update}. */
export function channelPostUpdate(options: MessageUpdateOptions = {}): Update {
	return createUpdate({ channel_post: buildMessage(options, "channel") });
}

/** build an `edited_channel_post` {@link Update}. */
export function editedChannelPostUpdate(options: MessageUpdateOptions = {}): Update {
	return createUpdate({ edited_channel_post: buildMessage(options, "channel") });
}

/** options for {@link callbackUpdate}. */
export interface CallbackUpdateOptions {
	data?: string;
	chatId?: number;
	fromId?: number;
}

/** build a `callback_query` {@link Update}. */
export function callbackUpdate(options: CallbackUpdateOptions = {}): Update {
	const { data = "", chatId = 1, fromId = chatId } = options;

	return createUpdate({
		callback_query: {
			id: "1",
			chat_instance: "0",
			from: stubUser(fromId),
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
			},
			data,
		},
	});
}

/** options for {@link inlineQueryUpdate}. */
export interface InlineQueryUpdateOptions {
	query?: string;
	fromId?: number;
	id?: string;
	offset?: string;
	chatType?: Payload<"inline_query">["chat_type"];
}

/** build an `inline_query` {@link Update}. */
export function inlineQueryUpdate(options: InlineQueryUpdateOptions = {}): Update {
	const { query = "", fromId = 1, id = "1", offset = "", chatType } = options;

	return createUpdate({
		inline_query: {
			id,
			from: stubUser(fromId),
			query,
			offset,
			...(chatType ? { chat_type: chatType } : {}),
		},
	});
}

/** options for {@link chosenInlineResultUpdate}. */
export interface ChosenInlineResultUpdateOptions {
	resultId?: string;
	fromId?: number;
	query?: string;
	inlineMessageId?: string;
}

/** build a `chosen_inline_result` {@link Update}. */
export function chosenInlineResultUpdate(options: ChosenInlineResultUpdateOptions = {}): Update {
	const { resultId = "1", fromId = 1, query = "", inlineMessageId } = options;

	return createUpdate({
		chosen_inline_result: {
			result_id: resultId,
			from: stubUser(fromId),
			query,
			...(inlineMessageId ? { inline_message_id: inlineMessageId } : {}),
		},
	});
}

/** options for {@link shippingQueryUpdate}. */
export interface ShippingQueryUpdateOptions {
	id?: string;
	fromId?: number;
	invoicePayload?: string;
	shippingAddress?: Partial<Payload<"shipping_query">["shipping_address"]>;
}

/** build a `shipping_query` {@link Update}. */
export function shippingQueryUpdate(options: ShippingQueryUpdateOptions = {}): Update {
	const { id = "1", fromId = 1, invoicePayload = "", shippingAddress = {} } = options;

	return createUpdate({
		shipping_query: {
			id,
			from: stubUser(fromId),
			invoice_payload: invoicePayload,
			shipping_address: {
				country_code: "US",
				state: "",
				city: "New York",
				street_line1: "",
				street_line2: "",
				post_code: "10001",
				...shippingAddress,
			},
		},
	});
}

/** options for {@link preCheckoutQueryUpdate}. */
export interface PreCheckoutQueryUpdateOptions {
	id?: string;
	fromId?: number;
	currency?: string;
	totalAmount?: number;
	invoicePayload?: string;
}

/** build a `pre_checkout_query` {@link Update}. */
export function preCheckoutQueryUpdate(options: PreCheckoutQueryUpdateOptions = {}): Update {
	const {
		id = "1",
		fromId = 1,
		currency = "USD",
		totalAmount = 100,
		invoicePayload = "",
	} = options;

	return createUpdate({
		pre_checkout_query: {
			id,
			from: stubUser(fromId),
			currency,
			total_amount: totalAmount,
			invoice_payload: invoicePayload,
		},
	});
}

/** options for {@link pollUpdate}. */
export interface PollUpdateOptions {
	id?: string;
	question?: string;
	options?: string[];
	isClosed?: boolean;
}

/** build a `poll` {@link Update}. */
export function pollUpdate(options: PollUpdateOptions = {}): Update {
	const { id = "1", question = "", options: choices = ["yes", "no"], isClosed = false } = options;

	return createUpdate({
		poll: {
			id,
			question,
			options: choices.map((text, i) => ({ persistent_id: String(i), text, voter_count: 0 })),
			total_voter_count: 0,
			is_closed: isClosed,
			is_anonymous: true,
			type: "regular",
			allows_multiple_answers: false,
			allows_revoting: false,
			members_only: false,
		},
	});
}

/** options for {@link pollAnswerUpdate}. */
export interface PollAnswerUpdateOptions {
	pollId?: string;
	fromId?: number;
	optionIds?: number[];
}

/** build a `poll_answer` {@link Update}. */
export function pollAnswerUpdate(options: PollAnswerUpdateOptions = {}): Update {
	const { pollId = "1", fromId = 1, optionIds = [0] } = options;

	return createUpdate({
		poll_answer: {
			poll_id: pollId,
			user: stubUser(fromId),
			option_ids: optionIds,
			option_persistent_ids: optionIds.map(String),
		},
	});
}

/** options for {@link myChatMemberUpdate} / {@link chatMemberUpdate}. */
export interface ChatMemberUpdateOptions {
	chatId?: number;
	fromId?: number;
	userId?: number;
	oldStatus?: string;
	newStatus?: string;
}

function buildChatMemberUpdate(options: ChatMemberUpdateOptions): Payload<"my_chat_member"> {
	const {
		chatId = 1,
		fromId = chatId,
		userId = fromId,
		oldStatus = "member",
		newStatus = "member",
	} = options;
	const user = stubUser(userId);

	return {
		chat: { id: chatId, type: "group" },
		from: stubUser(fromId),
		date: 0,
		old_chat_member: { status: oldStatus, user },
		new_chat_member: { status: newStatus, user },
	};
}

/** build a `my_chat_member` {@link Update} (the bot's own membership changed). */
export function myChatMemberUpdate(options: ChatMemberUpdateOptions = {}): Update {
	return createUpdate({ my_chat_member: buildChatMemberUpdate(options) });
}

/** build a `chat_member` {@link Update} (another member's membership changed). */
export function chatMemberUpdate(options: ChatMemberUpdateOptions = {}): Update {
	return createUpdate({ chat_member: buildChatMemberUpdate(options) });
}

/** options for {@link chatJoinRequestUpdate}. */
export interface ChatJoinRequestUpdateOptions {
	chatId?: number;
	fromId?: number;
	userChatId?: number;
	bio?: string;
}

/** build a `chat_join_request` {@link Update}. */
export function chatJoinRequestUpdate(options: ChatJoinRequestUpdateOptions = {}): Update {
	const { chatId = 1, fromId = 1, userChatId = fromId, bio } = options;

	return createUpdate({
		chat_join_request: {
			chat: { id: chatId, type: "group" },
			from: stubUser(fromId),
			user_chat_id: userChatId,
			date: 0,
			...(bio ? { bio } : {}),
		},
	});
}

/** infer which payload key an update carries; defaults to `"message"`. */
export function detectUpdateType(update: Update): UpdateName {
	if (update.message) return "message";
	if (update.edited_message) return "edited_message";
	if (update.channel_post) return "channel_post";
	if (update.callback_query) return "callback_query";

	const bag = update as unknown as Record<string, unknown>;
	for (const key of Object.keys(bag)) {
		if (key !== "update_id" && bag[key] !== undefined) return key as UpdateName;
	}

	return "message";
}

/**
 * wrap an {@link Update} in a core {@link Context}. the api defaults to a fresh
 * {@link mockApi}; pass `updateType` to override the auto-detected one.
 */
export function createContext(update: Update, api?: Api, updateType?: UpdateName): Context {
	return new Context({
		api: api ?? mockApi().api,
		update,
		updateType: updateType ?? detectUpdateType(update),
	});
}

/** shortcut: build a `message` update and wrap it in a {@link Context} in one call. */
export function messageContext(options: MessageUpdateOptions = {}, api?: Api): Context {
	return createContext(messageUpdate(options), api);
}

/** shortcut: build a `callback_query` update and wrap it in a {@link Context} in one call. */
export function callbackContext(options: CallbackUpdateOptions = {}, api?: Api): Context {
	return createContext(callbackUpdate(options), api);
}

const noop: NextFn = async () => {};

/** run a composer's middleware against a context. resolves when the chain settles. */
export async function runMiddleware<C extends Context>(
	composer: Composer<C>,
	ctx: C,
): Promise<void> {
	await composer.toMiddleware()(ctx, noop);
}

/** an inline keyboard button found by {@link findButton}, with its position. */
export interface FoundButton {
	text: string;
	row: number;
	col: number;
	[key: string]: unknown;
}

/**
 * search an inline keyboard (a `reply_markup`-shaped object, e.g. from a
 * recorded `sendMessage` call's params) for a button whose text matches a
 * string or regex. returns the button (plus its `row`/`col`) or `undefined`.
 */
export function findButton(
	markup: { inline_keyboard?: Array<Array<Record<string, unknown>>> } | undefined,
	match: string | RegExp,
): FoundButton | undefined {
	const rows = markup?.inline_keyboard ?? [];

	for (let row = 0; row < rows.length; row++) {
		const cols = rows[row] ?? [];

		for (let col = 0; col < cols.length; col++) {
			const button = cols[col];
			if (!button) continue;

			const text = typeof button.text === "string" ? button.text : "";
			const matches = typeof match === "string" ? text === match : match.test(text);

			if (matches) return { ...button, text, row, col };
		}
	}

	return undefined;
}

/** result of {@link collectUpdates}: an {@link UpdateSink} plus the updates it received, in order. */
export interface UpdateCollector {
	sink: UpdateSink;
	updates: Update[];
}

/** a minimal {@link UpdateSink} (the `{ handleUpdate }` shape `webhookCallback`/runners expect) that just records. */
export function collectUpdates(): UpdateCollector {
	const updates: Update[] = [];

	return {
		sink: {
			handleUpdate: async (update) => {
				updates.push(update);
			},
		},
		updates,
	};
}

/** options for {@link webhookRequest}. */
export interface WebhookRequestOptions {
	url?: string;
	method?: string;
	secretToken?: string;
	headers?: Record<string, string>;
}

/** build a `Request` carrying `update` as JSON, as telegram would POST it to a webhook handler. */
export function webhookRequest(update: Update, options: WebhookRequestOptions = {}): Request {
	const {
		url = "https://example.invalid/webhook",
		method = "POST",
		secretToken,
		headers = {},
	} = options;

	const finalHeaders: Record<string, string> = { "content-type": "application/json", ...headers };
	if (secretToken) finalHeaders["x-telegram-bot-api-secret-token"] = secretToken;

	return new Request(url, {
		method,
		headers: finalHeaders,
		body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(update),
	});
}

/** stub `globalThis.fetch` for the duration of `fn`, restoring the original afterwards (even on throw). */
export async function withFetch<T>(handler: typeof fetch, fn: () => T | Promise<T>): Promise<T> {
	const realFetch = globalThis.fetch;
	globalThis.fetch = handler;

	try {
		return await fn();
	} finally {
		globalThis.fetch = realFetch;
	}
}

export type { Message };
