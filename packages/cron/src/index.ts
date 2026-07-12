import type { Bot, Context } from "@yaebal/core";
import type { CronClientOptions, CronJobDefinition } from "./scheduler.js";
import { Cron } from "./scheduler.js";

export { type CronAdminOptions, type CronContext, cronAdmin } from "./admin.js";
export {
	type CronSchedule,
	parseCron,
} from "./parser.js";
export {
	type Awaitable,
	Cron,
	type CronClientOptions,
	type CronEvent,
	CronExpressionError,
	type CronJobDefinition,
	CronJobExistsError,
	CronJobNotFoundError,
	type CronJobOptions,
	type CronJobState,
	type CronRunContext,
	type CronStopOptions,
	CronStoppedError,
	type CronStoreAdapter,
	type CronTask,
	CronTimeoutError,
	type MaybePromise,
} from "./scheduler.js";
export { validateTimeZone, type ZonedFields, zonedFields, zonedTimeToUtc } from "./timezone.js";

/** create a standalone scheduler, independent of any bot — call `.start()`/`.stop()` yourself. */
export function createCron<Jobs extends string = never>(
	options: CronClientOptions = {},
): Cron<Jobs> {
	return new Cron<Jobs>(options);
}

export interface CronPlugin<Jobs extends string = string> {
	<C extends Context>(bot: Bot<C>): Bot<C & { cron: Cron<Jobs> }>;
	readonly handle: Cron<Jobs>;
}

type CronPluginOptions = Omit<CronClientOptions, "jobs">;

interface CronPluginOptionsWithJobs<J extends Record<string, CronJobDefinition>>
	extends CronPluginOptions {
	jobs: J;
}

/**
 * create an installable bot plugin: `bot.install(cron({ jobs: { ... } }))`. wires the scheduler to
 * `bot.onStart`/`bot.onStop` — jobs arm once the bot starts polling, and `bot.stop()` won't resolve
 * until in-flight runs drain (see `graceful`/`drainTimeoutMs`). also decorates `ctx.cron` with the
 * same handle (for `cronAdmin()`, or any handler that wants `trigger`/`pause`/`states` at hand);
 * `plugin.handle` still works too, for code that runs before the bot exists.
 *
 * for webhook/serverless deployments, where `bot.onStart`/`onStop` never fire, use
 * {@link createCron} and call `start()`/`stop()` yourself.
 */
// two overloads, `jobs`-requiring one first: a plain `Omit<...> & { jobs?: J }` intersection
// with `jobs` optional silently defeats contextual typing of `task`/`onError`'s parameters
// inside the object literal (a real, reproduced TS inference gap, not a style preference) —
// splitting "jobs present" from "jobs absent" into separate signatures, with the required-jobs
// one checked first, keeps `ctx` properly typed at every call site.
export function cron<const J extends Record<string, CronJobDefinition>>(
	options: CronPluginOptionsWithJobs<J>,
): CronPlugin<Extract<keyof J, string>>;
export function cron(options?: CronPluginOptions): CronPlugin<never>;
export function cron(
	options: CronPluginOptions & { jobs?: Record<string, CronJobDefinition> } = {},
): CronPlugin<string> {
	const handle = new Cron<string>(options as CronClientOptions);

	const install = <C extends Context>(bot: Bot<C>): Bot<C & { cron: Cron<string> }> => {
		bot.onStart(() => {
			handle.start();
		});
		bot.onStop(() => handle.stop());
		return bot.decorate({ cron: handle });
	};

	const plugin = install as CronPlugin<string>;
	Object.defineProperty(plugin, "handle", { value: handle, enumerable: true });

	return plugin;
}
