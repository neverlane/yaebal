import { Composer, type Context } from "@yaebal/core";
import type { AuditLoggerStats } from "./types.js";

/** the subset of {@link AuditLogger}/`AuditLogPlugin`/`AuditLogHandle` {@link auditAdmin}
 * needs. */
export interface AuditAdminLogger {
	stats(): AuditLoggerStats;
	flush(): Promise<void>;
}

export interface AuditAdminOptions<C extends Context = Context> {
	/** the logger (or `AuditLogPlugin`/`AuditLogHandle`) to report on and flush. */
	logger: AuditAdminLogger;
	/** only updates this predicate approves can use the admin command. */
	isAdmin: (ctx: C) => boolean | Promise<boolean>;
	/** command name, without the leading slash. defaults to `"audit"`. */
	command?: string;
}

function formatStats(stats: AuditLoggerStats): string {
	const errorLines = Object.entries(stats.errors)
		.filter(([, count]) => count > 0)
		.map(([stage, count]) => `  ${stage}: ${count}`)
		.join("\n");

	return [
		`received: ${stats.received}`,
		`written: ${stats.written}`,
		`filtered: ${stats.filtered}`,
		`sampled out: ${stats.sampledOut}`,
		errorLines ? `errors:\n${errorLines}` : "errors: none",
	].join("\n");
}

/**
 * `bot.install(auditAdmin({ logger: plugin, isAdmin }))` — a telegram-native ops
 * surface for {@link auditLog}'s running counters: no separate dashboard or metrics
 * scrape needed to answer "is the audit pipeline healthy" from a chat.
 *
 * commands (default `/audit`):
 * - `/audit` — a snapshot of {@link AuditLoggerStats}: received/written/filtered/sampled
 *   counts and a per-stage error breakdown
 * - `/audit flush` — force `logger.flush()` now, and confirm
 *
 * isolated via `Composer.filter` (the same pattern `@yaebal/feature-flags`'
 * `flagsAdmin` uses), not `guard` — a rejected `isAdmin` check continues the *outer*
 * chain instead of halting it, so installing this doesn't gate any handler registered
 * elsewhere on the same composer.
 */
export function auditAdmin<C extends Context>(
	options: AuditAdminOptions<C>,
): (composer: Composer<C>) => Composer<C> {
	const commandName = options.command ?? "audit";

	const branch = new Composer<C>().command(commandName, async (ctx) => {
		const [action] = ctx.args;

		if (action === "flush") {
			await options.logger.flush();
			await ctx.reply("flushed.");
			return;
		}

		await ctx.reply(formatStats(options.logger.stats()));
	});

	return (composer) => composer.filter(options.isAdmin, branch.toMiddleware());
}
