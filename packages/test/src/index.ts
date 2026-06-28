/**
 * @yaebal/test — testing utilities for yaebal bots.
 *
 * every plugin test used to hand-build fake updates and a mock api. this package
 * extracts that boilerplate: {@link mockApi} records every call, the `*Update`
 * factories produce real {@link Update} shapes, and {@link createContext} wraps
 * one in a core {@link Context}.
 */

import {
	type Api,
	type Composer,
	Context,
	type Message,
	type NextFn,
	type Update,
	type UpdateName,
} from "@yaebal/core";

/** a single recorded api call: the method name and the params it was given. */
export interface RecordedCall {
	method: string;
	params: Record<string, unknown> | undefined;
}

/** result of {@link mockApi}: the fake `api` plus the array it records into. */
export interface MockApi {
	api: Api;
	calls: RecordedCall[];
}

/** default results for known methods; everything else resolves to `{}`. */
function defaultResult(method: string): unknown {
	if (method.startsWith("send") || method === "copyMessage" || method === "forwardMessage") {
		return { message_id: 1 };
	}

	if (method === "answerCallbackQuery") return true;
	if (method === "getMe") return { id: 1, is_bot: true, first_name: "bot", username: "bot" };

	return {};
}

/**
 * a fake {@link Api} whose every method records `{ method, params }` into `calls`
 * and resolves to a sensible default (`{ message_id: 1 }` for `send*`, `true` for
 * `answerCallbackQuery`, `{}` otherwise). hook registrars (`before`/`after`/
 * `onError`) are no-ops that return the api for chaining.
 */
export function mockApi(): MockApi {
	const calls: RecordedCall[] = [];

	const record = (method: string, params?: Record<string, unknown>): Promise<never> => {
		calls.push({ method, params });
		return Promise.resolve(defaultResult(method) as never);
	};

	const registrar: Record<string, unknown> = {
		call: (method: string, params?: Record<string, unknown>) => record(method, params),
		fileUrl: (filePath: string) => `https://example.invalid/file/${filePath}`,
		before: () => api,
		after: () => api,
		onError: () => api,
	};

	const api = new Proxy(registrar, {
		get(obj, prop: string) {
			if (prop in obj) return obj[prop];

			const method = (params?: Record<string, unknown>) => record(prop, params);
			obj[prop] = method;

			return method;
		},
	}) as unknown as Api;

	return { api, calls };
}

let updateIdCounter = 0;

/** build an {@link Update} from a partial, filling in a fresh `update_id`. */
export function createUpdate(partial: Partial<Update> = {}): Update {
	return { update_id: ++updateIdCounter, ...partial };
}

/** options for {@link messageUpdate}. */
export interface MessageUpdateOptions {
	text?: string;
	chatId?: number;
	fromId?: number;
	chatType?: "private" | "group" | "supergroup" | "channel";
}

/** build a message {@link Update}. */
export function messageUpdate(options: MessageUpdateOptions = {}): Update {
	const { text = "", chatId = 1, fromId = chatId, chatType = "private" } = options;

	return createUpdate({
		message: {
			message_id: 1,
			date: 0,
			chat: { id: chatId, type: chatType },
			from: { id: fromId, is_bot: false, first_name: "u" },
			text,
		},
	});
}

/** options for {@link callbackUpdate}. */
export interface CallbackUpdateOptions {
	data?: string;
	chatId?: number;
	fromId?: number;
}

/** build a callback_query {@link Update}. */
export function callbackUpdate(options: CallbackUpdateOptions = {}): Update {
	const { data = "", chatId = 1, fromId = chatId } = options;

	return createUpdate({
		callback_query: {
			id: "1",
			chat_instance: "0",
			from: { id: fromId, is_bot: false, first_name: "u" },
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
			},
			data,
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

const noop: NextFn = async () => {};

/** run a composer's middleware against a context. resolves when the chain settles. */
export async function runMiddleware<C extends Context>(
	composer: Composer<C>,
	ctx: C,
): Promise<void> {
	await composer.toMiddleware()(ctx, noop);
}

export type { Message };
