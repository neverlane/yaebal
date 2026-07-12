import { Composer, type Context } from "@yaebal/core";
import type { AnalyticsAdapter, AnalyticsReport } from "./types.js";

const WINDOWS: Record<string, number> = {
	"1h": 3_600_000,
	"24h": 86_400_000,
	"7d": 7 * 86_400_000,
	"30d": 30 * 86_400_000,
};

const DEFAULT_WINDOW_LABEL = "24h";

export interface AnalyticsAdminOptions {
	/** only updates this predicate approves can use the admin commands. */
	isAdmin: (ctx: Context) => boolean | Promise<boolean>;
	/** command name, without the leading slash. defaults to `"analytics"`. */
	command?: string;
	/** where `/analytics` reads reports from — must implement `query()` (`memoryAdapter`,
	 * `sqliteAdapter`, and `clickhouseAdapter` all do; `posthogAdapter`/`plausibleAdapter` don't,
	 * since neither exposes a read api this package can query). pass the SAME instance given to
	 * `analytics({ adapters: [...] })` so reports reflect what's actually been tracked. */
	adapter: AnalyticsAdapter;
	/** default lookback window when no argument is given. defaults to `"24h"`; accepts anything
	 * also valid as a command argument (`"1h"`, `"24h"`, `"7d"`, `"30d"`). */
	defaultWindow?: keyof typeof WINDOWS;
}

function formatReport(report: AnalyticsReport, windowLabel: string): string {
	const lines = [`events in the last ${windowLabel}: ${report.total}`];

	if (report.topEvents.length === 0) {
		lines.push("(none)");
	} else {
		lines.push("", "top events:");
		for (const { name, count } of report.topEvents) lines.push(`  ${name}: ${count}`);
	}

	return lines.join("\n");
}

/**
 * `bot.install(analyticsAdmin({ isAdmin, adapter }))` — a telegram-native ops surface for the
 * events `analytics()` tracks: total count and top event names over a window, from a chat, with
 * no separate dashboard or deploy. gated by `isAdmin`, the same pattern as
 * `@yaebal/feature-flags`' `flagsAdmin`.
 *
 * commands (default `/analytics`):
 * - `/analytics` — top events over the last 24h
 * - `/analytics 1h` | `7d` | `30d` — same, over a different window
 *
 * isolated via `Composer.filter` (not `guard`) — a rejected `isAdmin` check continues the *outer*
 * chain instead of halting it, so installing this doesn't gate any handler registered elsewhere
 * on the same composer.
 */
export function analyticsAdmin<C extends Context>(
	options: AnalyticsAdminOptions,
): (composer: Composer<C>) => Composer<C> {
	const commandName = options.command ?? "analytics";
	const { adapter } = options;
	const defaultWindow = options.defaultWindow ?? DEFAULT_WINDOW_LABEL;

	if (!adapter.query) {
		throw new Error(
			"analyticsAdmin: `adapter` has no `query()` — pass a queryable adapter (memoryAdapter, " +
				"sqliteAdapter, or clickhouseAdapter), the same instance given to `analytics({ adapters })`",
		);
	}
	const query = adapter.query.bind(adapter);

	const branch = new Composer<C>().command(commandName, async (ctx) => {
		const [arg] = ctx.args;
		const windowLabel = arg && arg in WINDOWS ? arg : defaultWindow;
		const windowMs = WINDOWS[windowLabel] ?? WINDOWS[DEFAULT_WINDOW_LABEL] ?? 0;

		if (arg && !(arg in WINDOWS)) {
			await ctx.reply(
				`usage: /${commandName} | /${commandName} <${Object.keys(WINDOWS).join("|")}>`,
			);
			return;
		}

		const report = await query({ since: Date.now() - windowMs, limit: 10 });
		await ctx.reply(formatReport(report, windowLabel));
	});

	return (composer) => composer.filter(options.isAdmin, branch.toMiddleware());
}
