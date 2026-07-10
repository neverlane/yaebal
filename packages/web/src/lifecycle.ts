import { assertSecretToken, type MediaSource, type WebhookInfo } from "@yaebal/core";

/** minimal bot surface the lifecycle helpers need — just the api client. */
export interface ApiBot {
	api: { call(method: string, params?: Record<string, unknown>): Promise<unknown> };
}

export interface SetWebhookOptions {
	/** secret token telegram echoes back in `X-Telegram-Bot-Api-Secret-Token` (pass the same to `webhook`). */
	secretToken?: string;
	/** restrict the update types telegram sends (e.g. `["message", "callback_query"]`). */
	allowedUpdates?: string[];
	/** drop updates that piled up while the webhook was unset. */
	dropPendingUpdates?: boolean;
	/** max simultaneous HTTPS connections telegram opens (1–100, default 40). */
	maxConnections?: number;
	/** fix the delivering ip (IPv4) — pins telegram to one address. */
	ipAddress?: string;
	/** your public-key certificate, for a self-signed webhook. accepts any `media.*` source. */
	certificate?: MediaSource;
}

/**
 * register this bot's webhook with telegram — call once on deploy. the
 * `secretToken` must match the one you pass to `webhook()` / `serve()`; it's
 * validated locally so a bad value fails here, not silently at telegram.
 */
export async function setWebhook(
	bot: ApiBot,
	url: string,
	options: SetWebhookOptions = {},
): Promise<void> {
	assertSecretToken(options.secretToken);

	await bot.api.call("setWebhook", {
		url,
		secret_token: options.secretToken,
		allowed_updates: options.allowedUpdates,
		drop_pending_updates: options.dropPendingUpdates,
		max_connections: options.maxConnections,
		ip_address: options.ipAddress,
		certificate: options.certificate,
	});
}

export interface DeleteWebhookOptions {
	/** drop updates that piled up, instead of replaying them over long polling. */
	dropPendingUpdates?: boolean;
}

/**
 * remove this bot's webhook (e.g. to switch back to long-polling). accepts an
 * options object; a bare boolean is still honored for the old
 * `deleteWebhook(bot, true)` shape.
 */
export async function deleteWebhook(
	bot: ApiBot,
	options: DeleteWebhookOptions | boolean = {},
): Promise<void> {
	const dropPendingUpdates = typeof options === "boolean" ? options : options.dropPendingUpdates;

	await bot.api.call("deleteWebhook", { drop_pending_updates: dropPendingUpdates });
}

/**
 * current webhook status — the first thing to check when deliveries stall.
 * `last_error_message` / `last_error_date` explain why telegram gave up, and
 * `pending_update_count` shows the backlog. an empty `url` means the bot is on
 * long polling.
 */
export function getWebhookInfo(bot: ApiBot): Promise<WebhookInfo> {
	return bot.api.call("getWebhookInfo") as Promise<WebhookInfo>;
}
