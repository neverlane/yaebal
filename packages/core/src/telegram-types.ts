/**
 * Telegram Bot API types — re-exported from the code-generated `@yaebal/types`,
 * the single source of truth (generated from the official schema on every API
 * release). Core only keeps the API-response envelope and the `UpdateName`
 * helper, which aren't part of the object schema.
 */
import type { Update } from "@yaebal/types";

export type { User, Chat, MessageEntity, Message, CallbackQuery, Update } from "@yaebal/types";

/** The keys of `Update` that carry a payload (everything except `update_id`). */
export type UpdateName = Exclude<keyof Update, "update_id" | symbol | number>;

export interface ApiResponseOk<T> {
	ok: true;
	result: T;
}

export interface ApiResponseError {
	ok: false;
	error_code: number;
	description: string;
}

export type ApiResponse<T> = ApiResponseOk<T> | ApiResponseError;
