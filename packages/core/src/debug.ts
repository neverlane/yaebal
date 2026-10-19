/**
 * opt-in debug logging, switched on by the `YAEBAL_DEBUG` env var — a comma-separated list of
 * namespaces, each exact or a `*`-suffixed prefix:
 *
 *   YAEBAL_DEBUG='yaebal:*' node bot.js            # everything
 *   YAEBAL_DEBUG='yaebal:api,yaebal:update' node bot.js
 *
 * namespaces: `yaebal:api` (one line per call: method, outcome, duration), `yaebal:api:raw`
 * (params and result bodies — noisy), `yaebal:update` (each dispatched update and how long it
 * took), `yaebal:polling` (long-poll batches and failures). lines go to stderr via
 * `console.error`. read without any `node:` import, so a runtime with no env (an edge worker)
 * simply has it off; the bot token never appears in a line.
 */

export type DebugNamespace = "yaebal:api" | "yaebal:api:raw" | "yaebal:update" | "yaebal:polling";

export type DebugLogger = ((...args: unknown[]) => void) | undefined;

function readEnv(): string | undefined {
	const g = globalThis as {
		process?: { env?: Record<string, string | undefined> };
		Deno?: { env?: { get(name: string): string | undefined } };
	};

	try {
		return g.process?.env?.YAEBAL_DEBUG ?? g.Deno?.env?.get("YAEBAL_DEBUG");
	} catch {
		// deno without --allow-env throws on env access — debug output just stays off
		return undefined;
	}
}

/** does `spec` (the env var's value) switch `namespace` on? exported for testing. */
export function debugEnabled(namespace: string, spec: string | undefined = readEnv()): boolean {
	if (!spec) return false;

	return spec.split(",").some((raw) => {
		const pattern = raw.trim();
		if (pattern === "") return false;
		return pattern.endsWith("*")
			? namespace.startsWith(pattern.slice(0, -1))
			: pattern === namespace;
	});
}

/**
 * a logger for `namespace`, or `undefined` when it's off — so call sites stay a cheap
 * `log?.(…)` and build no strings at all while disabled. resolved once per call site owner
 * (an api client, a bot), not per line.
 */
export function createDebug(namespace: DebugNamespace, spec?: string): DebugLogger {
	if (!debugEnabled(namespace, spec ?? readEnv())) return undefined;
	return (...args) => console.error(`[${namespace}]`, ...args);
}
