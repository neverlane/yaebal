import type { Cache, CacheOptions } from "@yaebal/cache";
import { createCache } from "@yaebal/cache";
import type { Composer, Context, Plugin } from "@yaebal/core";
import { GUARDS_CACHE, type GuardsCache } from "./member.js";

export interface MembershipOptions
	extends Pick<CacheOptions, "ttl" | "storage" | "scope" | "now" | "onEvent"> {
	/**
	 * reuse an existing `@yaebal/cache` client (e.g. one already shared with `cache()`) instead
	 * of building a dedicated one — the other options are ignored when this is set.
	 */
	cache?: Cache;
	/**
	 * observe a cache-invalidation failure (the `chat_member`/`my_chat_member` delete below
	 * rejecting — a storage-layer problem). lookup failures that aren't a legitimate deny
	 * (network errors, …) are a separate concern: `resolveMember` re-throws those through the
	 * predicate itself rather than routing them here, so they surface through the bot's normal
	 * error handling instead of being swallowed.
	 */
	onError?: (error: unknown, ctx: Context) => unknown | Promise<unknown>;
}

export interface MembershipPlugin extends Plugin<Context> {
	/** the underlying cache client — read/pre-warm it outside a handler, or share it elsewhere. */
	readonly cache: Cache;
}

function memberKey(chatId: number, userId: number): string {
	return `${chatId}:${userId}`;
}

/**
 * cache `getChatMember` lookups so `isAdmin`/`hasPermission`/… don't hit the Bot API on every
 * update that flows past them — without this, `bot.guard(isAdmin)` gated by nothing narrower
 * calls `getChatMember` once per update; with it, once per `(chat, user)` per `ttl`. entries are
 * also invalidated the instant telegram reports the membership actually changed (`chat_member`/
 * `my_chat_member`), so a fresh promotion/demotion is never served stale — a plain TTL alone
 * can't offer that.
 *
 * every guard in this package works without this plugin too, falling back to a direct
 * `getChatMember` call — this is a pure opt-in optimization: `bot.install(membership())`.
 */
export function membership(options: MembershipOptions = {}): MembershipPlugin {
	const cache =
		options.cache ??
		createCache({
			ttl: options.ttl,
			storage: options.storage,
			scope: options.scope,
			now: options.now,
			onEvent: options.onEvent,
		});

	const resolver: GuardsCache = {
		get(ctx, chatId, userId) {
			return cache.wrap(memberKey(chatId, userId), () =>
				ctx.api.getChatMember({ chat_id: chatId, user_id: userId }),
			);
		},
	};

	const plugin = ((composer: Composer<Context>) =>
		composer.decorate({ [GUARDS_CACHE]: resolver }).use(async (ctx, next) => {
			const update = ctx.update.chat_member ?? ctx.update.my_chat_member;

			if (update !== undefined) {
				await cache
					.delete(memberKey(update.chat.id, update.new_chat_member.user.id))
					.catch((error: unknown) => options.onError?.(error, ctx));
			}

			return next();
		})) as unknown as MembershipPlugin;

	Object.defineProperty(plugin, "cache", { value: cache, enumerable: true });

	return plugin;
}
