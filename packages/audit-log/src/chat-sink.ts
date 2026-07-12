import type { Api } from "@yaebal/core";
import { formatError } from "./errors.js";
import type { AuditEvent, AuditLevel, AuditSink } from "./types.js";

const LEVEL_RANK: Record<AuditLevel, number> = { info: 0, warn: 1, error: 2 };

/** the subset of a bot {@link chatSink} needs to send its own messages. `Bot`/`Composer`
 * satisfy it structurally (both expose `.api`); pass `bot` itself. */
export interface ChatSinkTarget {
	api: Api;
}

export interface ChatSinkOptions {
	/** where alerts go — an admin chat id, or `@channelusername`. */
	chatId: number | string;
	/** only events at or above this severity are sent. default `"error"`. */
	minLevel?: AuditLevel;
	/** suppress a repeat of the same `kind`+method/updateType within this window, so a
	 * failure storm doesn't flood the chat with one message per occurrence. `0`
	 * disables dedupe. default `60_000` (1 minute). */
	dedupeWindowMs?: number;
	/** minimum gap between two sends, across every event — a hard ceiling independent
	 * of dedupe (protects against many *distinct* signatures firing at once). `0`
	 * disables throttling. default `3_000`. */
	throttleMs?: number;
	/** shape the telegram message text. defaults to a compact one-line summary per
	 * event kind. */
	format?: (event: AuditEvent) => string;
	/** injected clock, mainly for tests. */
	now?: () => number;
}

function defaultChatFormat(event: AuditEvent): string {
	switch (event.kind) {
		case "update":
			return event.error
				? `⚠️ update#${event.updateId} ${event.updateType}: ${formatError(event.error)}`
				: `update#${event.updateId} ${event.updateType}`;
		case "api.error":
			return `⚠️ ${event.method} failed (attempt ${event.attempt}): ${formatError(event.error)}`;
		case "api.call":
			return `-> ${event.method}`;
		case "api.result":
			return `<- ${event.method} ok`;
		case "bot.start":
			return "🟢 bot started";
		case "bot.stop":
			return "🔴 bot stopped";
	}
}

function eventSignature(event: AuditEvent): string {
	return "method" in event ? `${event.kind}:${event.method}` : event.kind;
}

/**
 * a telegram-native sink: ship audit events straight into an admin chat via the bot's
 * own `sendMessage` — no separate log aggregator to stand up for "page me when
 * something breaks." gated to `minLevel` (default: errors only), deduped by event
 * signature, and rate-limited, so a failure storm sends one alert, not one message per
 * occurrence.
 *
 * never loops on its own traffic: the `sendMessage` this sink makes is itself an
 * outgoing api call, which — if audit-log's own `api.*` logging is on — produces new
 * `api.call`/`api.result` events on the very same logger. this sink recognizes and
 * silently drops those (tracked by the `params` object reference it just sent) before
 * they'd otherwise re-trigger a send under a permissive `minLevel`.
 */
export function chatSink(target: ChatSinkTarget, options: ChatSinkOptions): AuditSink {
	const minRank = LEVEL_RANK[options.minLevel ?? "error"];
	const dedupeWindowMs = options.dedupeWindowMs ?? 60_000;
	const throttleMs = options.throttleMs ?? 3_000;
	const format = options.format ?? defaultChatFormat;
	const now = options.now ?? Date.now;

	const ownParams = new WeakSet<object>();
	const lastSeenBySignature = new Map<string, number>();
	let lastSentAt = 0;

	return {
		async write(_entry, event) {
			if (LEVEL_RANK[event.level] < minRank) return;

			if (
				(event.kind === "api.call" || event.kind === "api.result" || event.kind === "api.error") &&
				event.params !== undefined &&
				ownParams.has(event.params)
			) {
				return;
			}

			const t = now();
			const signature = eventSignature(event);
			const lastSeen = lastSeenBySignature.get(signature);
			if (dedupeWindowMs > 0 && lastSeen !== undefined && t - lastSeen < dedupeWindowMs) return;
			if (throttleMs > 0 && t - lastSentAt < throttleMs) return;

			lastSeenBySignature.set(signature, t);
			lastSentAt = t;

			const params = { chat_id: options.chatId, text: format(event) };
			ownParams.add(params);
			await target.api.sendMessage(params);
		},
	};
}
