import {
	type Chat,
	COMMAND_UPDATES,
	type Context,
	type Filter,
	matchOf,
	messageOf,
} from "@yaebal/core";
import { and } from "./logic.js";
import { isGroup, isPrivate } from "./peer.js";

/**
 * command filters. same routing rules as `composer.command()` — fresh messages
 * only (an edited `/cmd` doesn't re-fire), message *text* only (a caption is
 * not a command), `@mention` checked against `ctx.me` when known, names
 * matched case-insensitively — plus multiple names, custom prefixes and
 * regex names on top.
 */

export interface CommandOptions {
	/** accepted command prefixes (default `"/"`). */
	prefixes?: string | readonly string[];
	/** match string names exactly instead of case-insensitively. */
	caseSensitive?: boolean;
}

/** what a matched `command()` stages: the name, whitespace-split args, and the raw trimmed remainder. */
export type CommandAdd = { command: string; args: string[]; payload: string };

/** any `/command`. */
export function command(): Filter<Context, CommandAdd>;
/** a `/command` with one of the given names. */
export function command(
	name: string | readonly string[],
	options?: CommandOptions,
): Filter<Context, CommandAdd>;
/** a `/command` whose name fully matches `re`; also stages `ctx.match` (with the groups). */
export function command(
	name: RegExp,
	options?: CommandOptions,
): Filter<Context, CommandAdd & { match: RegExpMatchArray }>;
export function command(
	name?: string | readonly string[] | RegExp,
	options: CommandOptions = {},
): Filter<Context, CommandAdd> {
	const { caseSensitive = false } = options;
	const prefixes =
		typeof options.prefixes === "string" ? [options.prefixes] : (options.prefixes ?? ["/"]);
	const names =
		name === undefined || name instanceof RegExp
			? name
			: (typeof name === "string" ? [name] : name).map((n) =>
					caseSensitive ? n : n.toLowerCase(),
				);

	return (ctx, bag) => {
		if (!COMMAND_UPDATES.has(ctx.updateType)) return false;

		const text = messageOf(ctx.update)?.text;
		if (text === undefined) return false;

		const prefix = prefixes.find((p) => p.length > 0 && text.startsWith(p));
		if (prefix === undefined) return false;

		const [head = ""] = text.slice(prefix.length).split(/\s/, 1);
		const [base = "", mention] = head.split("@");
		if (base === "") return false;

		const username = ctx.me?.username;
		if (mention && username && mention.toLowerCase() !== username.toLowerCase()) return false;

		const cmd = caseSensitive ? base : base.toLowerCase();

		if (names instanceof RegExp) {
			const m = matchOf(base, names);
			if (!m || m[0] !== base) return false; // the whole name must match, not a substring

			bag.match = m;
		} else if (names !== undefined && !names.includes(cmd)) {
			return false;
		}

		const payload = text.slice(prefix.length + head.length).trim();

		bag.command = cmd;
		bag.args = payload === "" ? [] : payload.split(/\s+/);
		bag.payload = payload;
		return true;
	};
}

/** `/start` in a private chat. */
export const start: Filter<Context, CommandAdd & { chat: Chat & { type: "private" } }> = and(
	isPrivate,
	command("start"),
);

/** `/start` in a group (a `?startgroup` deep link landed). */
export const startGroup: Filter<
	Context,
	CommandAdd & { chat: Chat & { type: "group" | "supergroup" } }
> = and(isGroup, command("start"));

type StartAdd = CommandAdd & { chat: Chat & { type: "private" } };

/** `/start` with the exact deep-link payload (`t.me/bot?start=<param>`). */
export function deeplink(param: string): Filter<Context, StartAdd>;
/** `/start` whose deep-link payload matches `re`; also stages `ctx.match` (with the groups). */
export function deeplink(param: RegExp): Filter<Context, StartAdd & { match: RegExpMatchArray }>;
export function deeplink(param: string | RegExp): Filter<Context, StartAdd> {
	return and(start, (_ctx: Context, bag: Record<string, unknown>) => {
		// `and` shares its bag left to right — command("start") staged the payload already
		const payload = bag.payload as string;
		if (payload === "") return false;

		if (typeof param === "string") return payload === param;

		const m = matchOf(payload, param);
		if (!m) return false;

		bag.match = m;
		return true;
	}) as unknown as Filter<Context, StartAdd>;
}
