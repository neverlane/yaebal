import { type Bot, type Context, type Update, updateNames } from "@yaebal/core";

/**
 * which handler files to emit. `registered` is what the bot named via `on()` —
 * a lower bound, so `command()` / `hears()` (they don't record a type) still
 * need `message` and anything passed in `extra`.
 */
export function handlerTypes(bot: Bot<Context>, extra: readonly string[] = []): string[] {
	const types = new Set<string>(["message", ...extra]);
	for (const name of bot.registeredUpdates()) types.add(name);
	// keep the canonical update order so diffs stay stable across builds.
	const known = updateNames.filter((name) => types.has(name));
	const rest = [...types].filter(
		(name) => !updateNames.includes(name as (typeof updateNames)[number]),
	);
	rest.sort();
	return [...known, ...rest];
}

/** the second argument tgcloud passes a handler: the raw update lives on `ctx.update`. */
export interface TgcloudHandlerContext {
	update?: Update;
}

/**
 * rebuild the `Update` a handler was split out of. tgcloud unwraps it and hands
 * the payload as the first argument, so the handler type has to be put back.
 */
export function updateFromHandler(
	type: string,
	payload: unknown,
	ctx: TgcloudHandlerContext | undefined,
): Update {
	const update = ctx?.update;
	if (update && type in update) return update;
	return { update_id: update?.update_id ?? 0, [type]: payload } as Update;
}
