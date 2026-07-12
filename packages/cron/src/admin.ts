import { Composer, type Context } from "@yaebal/core";
import type { Cron, CronJobState } from "./scheduler.js";

/** the context shape `cronAdmin` needs — added by the `cron()` plugin's `ctx.cron` decoration. */
export interface CronContext<Jobs extends string = string> extends Context {
	cron: Cron<Jobs>;
}

export interface CronAdminOptions<Jobs extends string = string> {
	/** only updates this predicate approves can use the admin commands. */
	isAdmin: (ctx: CronContext<Jobs>) => boolean | Promise<boolean>;
	/** command name, without the leading slash. defaults to `"cron"`. */
	command?: string;
}

function formatState(state: CronJobState): string {
	const lines = [
		`${state.name}${state.paused ? " (paused)" : ""}${state.running ? " (running)" : ""}`,
	];
	lines.push(`  runs: ${state.runs} · failures: ${state.failures}`);
	if (state.nextRunAt !== undefined)
		lines.push(`  next: ${new Date(state.nextRunAt).toISOString()}`);
	if (state.lastRunAt !== undefined)
		lines.push(`  last: ${new Date(state.lastRunAt).toISOString()}`);
	if (state.lastError !== undefined) {
		const message =
			state.lastError instanceof Error ? state.lastError.message : String(state.lastError);
		lines.push(`  last error: ${message}`);
	}
	return lines.join("\n");
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * `bot.install(cronAdmin({ isAdmin }))` — a telegram-native ops surface for the jobs installed by
 * `cron()`: list every job's state, run one on demand, pause/resume its automatic schedule, or
 * preview its next few fire times — from a chat, with no separate dashboard or deploy. gated by
 * `isAdmin` (check `ctx.from?.id` against an allow-list, a database role, `@yaebal/session`, …).
 *
 * commands (default `/cron`):
 * - `/cron` — every job's state: paused/running, run/failure counts, next and last run, last error
 * - `/cron run <name>` — trigger a job immediately, respecting its overlap policy
 * - `/cron pause <name>` / `/cron resume <name>` — stop/restart its automatic schedule
 * - `/cron next <name>` — preview its next 3 scheduled fire times
 *
 * isolated via `Composer.filter` (the same primitive `@yaebal/feature-flags`' `flagsAdmin` uses),
 * not `guard` — a rejected `isAdmin` check continues the *outer* chain instead of halting it, so
 * installing this doesn't gate any handler registered elsewhere on the same composer.
 */
export function cronAdmin<Jobs extends string = string>(
	options: CronAdminOptions<Jobs>,
): (composer: Composer<CronContext<Jobs>>) => Composer<CronContext<Jobs>> {
	const commandName = options.command ?? "cron";
	const usage =
		`usage: /${commandName} | /${commandName} run <name> | /${commandName} pause <name> | ` +
		`/${commandName} resume <name> | /${commandName} next <name>`;

	const branch = new Composer<CronContext<Jobs>>().command(commandName, async (ctx) => {
		const [action, rawName] = ctx.args;
		const name = rawName as Jobs | undefined;

		if (action === undefined) {
			const states = ctx.cron.states();
			await ctx.reply(
				states.length > 0 ? states.map(formatState).join("\n\n") : "(no jobs registered)",
			);
			return;
		}

		if (action === "run" && name !== undefined) {
			try {
				const outcome = await ctx.cron.trigger(name);
				await ctx.reply(`${name}: ${outcome}`);
			} catch (error) {
				await ctx.reply(formatError(error));
			}
			return;
		}

		if (action === "pause" && name !== undefined) {
			try {
				ctx.cron.pause(name);
				await ctx.reply(`${name}: paused`);
			} catch (error) {
				await ctx.reply(formatError(error));
			}
			return;
		}

		if (action === "resume" && name !== undefined) {
			try {
				ctx.cron.resume(name);
				await ctx.reply(`${name}: resumed`);
			} catch (error) {
				await ctx.reply(formatError(error));
			}
			return;
		}

		if (action === "next" && name !== undefined) {
			try {
				const next = ctx.cron.nextRuns(name, 3);
				await ctx.reply(
					next.length > 0
						? next.map((date) => date.toISOString()).join("\n")
						: `${name}: no upcoming runs`,
				);
			} catch (error) {
				await ctx.reply(formatError(error));
			}
			return;
		}

		await ctx.reply(usage);
	});

	return (composer) => composer.filter(options.isAdmin, branch.toMiddleware());
}
