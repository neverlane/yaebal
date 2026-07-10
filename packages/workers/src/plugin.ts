/**
 * @yaebal/workers/plugin — wire a pool into the bot: handlers get it on the context and
 * its lifecycle follows the bot's.
 *
 *   import { tasks } from "@yaebal/workers/plugin";
 *   const bot = new Bot(token).install(tasks(pool));
 *   bot.on("message:photo", (ctx) => ctx.tasks.run("resize", …));
 *
 * kept out of the main entry so worker threads importing `@yaebal/workers` never load
 * @yaebal/core (the import below is type-only and erased at build).
 */

import type { Composer, Context, Plugin } from "@yaebal/core";
import type { Pool } from "./pool.js";
import type { TaskDefinitions } from "./types.js";

export interface TasksPluginOptions<Key extends string = "tasks"> {
	/** context property the pool is exposed as. @default "tasks" */
	key?: Key;
	/** what happens to the pool when the bot stops: graceful drain, immediate kill, or nothing. @default "close" */
	onStop?: "close" | "destroy" | false;
	/** ms to let close() drain before forcing (forwarded to pool.close). @default wait forever */
	closeTimeout?: number;
}

/**
 * expose `pool` on the context (as `ctx.tasks` by default) and shut it down when the bot
 * stops. install it on the `Bot` itself — on a detached composer there is no `onStop` to
 * hook, so the pool's lifecycle stays yours.
 */
export function tasks<Tasks extends TaskDefinitions, Key extends string = "tasks">(
	pool: Pool<Tasks>,
	options: TasksPluginOptions<Key> = {},
): Plugin<Context, Record<Key, Pool<Tasks>>> {
	const key = options.key ?? "tasks";
	const onStop = options.onStop ?? "close";

	return ((composer: Composer<Context>) => {
		const bot = composer as unknown as { onStop?: (handler: () => Promise<void>) => unknown };
		if (onStop !== false && typeof bot.onStop === "function") {
			bot.onStop(() =>
				onStop === "destroy" ? pool.destroy() : pool.close({ timeout: options.closeTimeout }),
			);
		}
		return composer.decorate({ [key]: pool });
	}) as unknown as Plugin<Context, Record<Key, Pool<Tasks>>>;
}
