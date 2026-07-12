import type { Context, Middleware } from "@yaebal/core";

/**
 * gate the rest of the chain behind `predicate`, like `bot.guard()` — but call `onDeny` instead
 * of silently dropping the update when it fails. `bot.guard()` alone is right for background
 * filtering (e.g. "only handle messages from admins at all"); `guardOr` is for user-facing
 * commands, where a `/ban` from a non-admin should get a reply, not silence.
 *
 *   bot.use(guardOr(isAdmin, (ctx) => ctx.reply("admins only"))).command("ban", banHandler);
 */
export function guardOr<C extends Context>(
	predicate: (ctx: C) => boolean | Promise<boolean>,
	onDeny: (ctx: C) => unknown | Promise<unknown>,
): Middleware<C> {
	return async (ctx, next) => {
		if (await predicate(ctx)) {
			await next();
			return;
		}

		await onDeny(ctx);
	};
}
