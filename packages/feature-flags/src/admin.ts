import { Composer } from "@yaebal/core";
import type { FlagsContext } from "./guard.js";
import type { FlagsCatalog } from "./types.js";

export interface FlagsAdminOptions<F extends FlagsCatalog> {
	/** only updates this predicate approves can use the admin commands. */
	isAdmin: (ctx: FlagsContext<F>) => boolean | Promise<boolean>;
	/** command name, without the leading slash. defaults to `"flags"`. */
	command?: string;
}

function parseValue(raw: string): boolean | number | string {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
	return raw;
}

function formatSnapshot(snapshot: Record<string, unknown>): string {
	const lines = Object.entries(snapshot).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
	return lines.length > 0 ? lines.join("\n") : "(no flags configured)";
}

/**
 * `bot.install(flagsAdmin({ isAdmin }))` — a telegram-native ops surface for the flags installed
 * by `featureFlags()`: list every flag's value for the calling bucket, force a global override,
 * or clear one — from a chat, with no separate dashboard or deploy. gated by `isAdmin` (check
 * `ctx.from?.id` against an allow-list, a database role, `@yaebal/session`, …).
 *
 * `@yaebal/panel` is a chat-inbox UI without a plugin/widget extension point, so this ships as
 * bot commands instead of a panel page — it works with or without the panel installed, and on
 * every runtime yaebal supports (including edge/serverless, where a custom HTTP dashboard is
 * more friction than a slash command).
 *
 * commands (default `/flags`):
 * - `/flags` — every flag's current value for your own bucket
 * - `/flags set <key> <value>` — global override; `true`/`false` for booleans, any token for a
 *   variant's value (parsed as a number when it looks like one, otherwise a string)
 * - `/flags clear <key>` — remove the global override
 *
 * isolated via `Composer.filter` (the same primitive {@link whenFlag} uses), not `guard` — a
 * rejected `isAdmin` check continues the *outer* chain instead of halting it, so installing this
 * doesn't gate any handler registered elsewhere on the same composer.
 */
export function flagsAdmin<F extends FlagsCatalog>(
	options: FlagsAdminOptions<F>,
): (composer: Composer<FlagsContext<F>>) => Composer<FlagsContext<F>> {
	const commandName = options.command ?? "flags";

	const branch = new Composer<FlagsContext<F>>().command(commandName, async (ctx) => {
		const [action, key, ...rest] = ctx.args;

		if (action === undefined) {
			const snapshot = await ctx.flags.snapshot();
			await ctx.reply(formatSnapshot(snapshot));
			return;
		}

		if (action === "set" && key !== undefined && rest.length > 0) {
			try {
				// biome-ignore lint/suspicious/noExplicitAny: the admin surface accepts any flag key at runtime
				await ctx.flags.setGlobalOverride(key as any, parseValue(rest.join(" ")) as any);
				await ctx.reply(`${key}: global override set`);
			} catch (error) {
				await ctx.reply(error instanceof Error ? error.message : String(error));
			}
			return;
		}

		if (action === "clear" && key !== undefined) {
			try {
				// biome-ignore lint/suspicious/noExplicitAny: the admin surface accepts any flag key at runtime
				await ctx.flags.clearGlobalOverride(key as any);
				await ctx.reply(`${key}: global override cleared`);
			} catch (error) {
				await ctx.reply(error instanceof Error ? error.message : String(error));
			}
			return;
		}

		await ctx.reply(
			`usage: /${commandName} | /${commandName} set <key> <value> | /${commandName} clear <key>`,
		);
	});

	return (composer) => composer.filter(options.isAdmin, branch.toMiddleware());
}
