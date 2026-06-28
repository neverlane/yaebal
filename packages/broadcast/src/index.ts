import type { Api } from "@yaebal/core";

export interface BroadcastResult {
	sent: number;
	failed: number;
}

export interface BroadcastOptions {
	/** Extra params merged into every `sendMessage` (parse_mode, reply_markup, …). */
	extra?: Record<string, unknown>;
	/** Called for each chat that failed (blocked the bot, deleted account, …). */
	onError?: (chatId: number | string, error: unknown) => void;
}

/**
 * Send `text` to many chats, one at a time, counting successes and failures.
 * Failures (a user blocked the bot, etc.) are swallowed so one bad chat doesn't
 * abort the run. Pair with `@yaebal/throttle` to stay under Telegram's rate limit.
 */
export async function broadcast(
	api: Api,
	chatIds: Array<number | string>,
	text: string,
	options: BroadcastOptions = {},
): Promise<BroadcastResult> {
	let sent = 0;
	let failed = 0;

	for (const chatId of chatIds) {
		try {
			// extra first so the per-chat fields always win (extra can't clobber chat_id/text)
			await api.sendMessage({ ...options.extra, chat_id: chatId, text });
			sent += 1;
		} catch (error) {
			failed += 1;
			options.onError?.(chatId, error);
		}
	}
	
	return { sent, failed };
}
