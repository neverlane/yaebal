import type { Context, Middleware, Plugin } from "@yaebal/core";
import type { BotCommand, BotCommandScope } from "@yaebal/types";

export type { BotCommand, BotCommandScope };

/** the properties `Composer.command()` adds to the context inside a command handler. */
export interface CommandContext {
	/** the matched command name (what the user typed, minus `/` and `@botname`). */
	command: string;
	/** whitespace-split words after the command. */
	args: string[];
}

/** a command handler — the registry's context type plus `command`/`args`. */
export type CommandHandler<C extends Context> = Middleware<C & CommandContext>;

/** menu text: one string for every locale, or per-locale strings with a required `default`. */
export type CommandDescription = string | ({ default: string } & Record<string, string>);

/** the slice of the api client `register`/`sync`/`unregister` need (satisfied by `bot.api`). */
export interface CommandApi {
	call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/** one `setMyCommands` payload: a `(scope, language)` pair and its command list. */
export interface CommandMenu {
	scope?: BotCommandScope;
	languageCode?: string;
	commands: BotCommand[];
}

export interface SyncResult {
	/** menus that differed from what Telegram had and were pushed. */
	pushed: CommandMenu[];
	/** menus that already matched and were left alone. */
	skipped: CommandMenu[];
}

/** a view over a registry whose `add`s carry a fixed menu scope. */
export interface ScopedCommands<C extends Context = Context> {
	/** define a command shown only in this scope's menu — chainable. */
	add(
		name: string | string[],
		description: CommandDescription,
		...handlers: CommandHandler<C>[]
	): ScopedCommands<C>;
}

interface CommandDef<C extends Context> {
	names: [string, ...string[]];
	description?: { default: string } & Record<string, string>;
	scope?: BotCommandScope;
	handlers: CommandHandler<C>[];
}

type VisibleDef<C extends Context> = CommandDef<C> & {
	description: { default: string } & Record<string, string>;
};

const NAME_RE = /^[a-z0-9_]{1,32}$/;
const LOCALE_RE = /^[a-z]{2}$/;
const MAX_COMMANDS = 100;
const MAX_DESCRIPTION = 256;

function normalizeDescription(
	description: CommandDescription,
): { default: string } & Record<string, string> {
	const map = typeof description === "string" ? { default: description } : { ...description };

	for (const [locale, text] of Object.entries(map)) {
		if (locale !== "default" && !LOCALE_RE.test(locale))
			throw new TypeError(
				`@yaebal/commands: invalid language code "${locale}" — two-letter ISO 639-1 (or "default")`,
			);
		if (text.length < 1 || text.length > MAX_DESCRIPTION)
			throw new TypeError(
				`@yaebal/commands: description for "${locale}" must be 1-${MAX_DESCRIPTION} chars`,
			);
	}

	return map;
}

/** stable key for a scope object, insensitive to property order. */
function scopeKey(scope: BotCommandScope): string {
	return JSON.stringify(scope, Object.keys(scope).sort());
}

function render<C extends Context>(defs: VisibleDef<C>[], locale?: string): BotCommand[] {
	return defs.map((d) => ({
		command: d.names[0],
		description:
			(locale !== undefined ? d.description[locale] : undefined) ?? d.description.default,
	}));
}

function menuParams(menu: CommandMenu): Record<string, unknown> {
	return {
		...(menu.languageCode !== undefined ? { language_code: menu.languageCode } : {}),
		...(menu.scope !== undefined ? { scope: menu.scope } : {}),
	};
}

function setMenu(api: CommandApi, menu: CommandMenu): Promise<boolean> {
	return api.call<boolean>("setMyCommands", { commands: menu.commands, ...menuParams(menu) });
}

function sameCommands(a: BotCommand[], b: BotCommand[]): boolean {
	return (
		a.length === b.length &&
		a.every((cmd, i) => cmd.command === b[i]?.command && cmd.description === b[i]?.description)
	);
}

/**
 * a single source of truth for commands: name + menu description + handlers.
 * `bot.install(cmd.plugin())` wires the handlers; `cmd.register(bot.api)` (or the
 * diff-aware `cmd.sync(bot.api)`) pushes every `(scope, language)` menu to Telegram.
 */
export class Commands<C extends Context = Context> {
	private defs: CommandDef<C>[] = [];
	/** name → scopes it's registered under so far (`undefined` = unscoped). */
	private taken = new Map<string, Array<BotCommandScope | undefined>>();

	/**
	 * define a command: menu name (or `[name, ...aliases]` — only the first shows in the
	 * menu), description (a string, or `{ default, ru, ... }` per locale) and handlers.
	 * with no handlers the command is menu-only. chainable.
	 */
	add(
		name: string | string[],
		description: CommandDescription,
		...handlers: CommandHandler<C>[]
	): this {
		this.define(name, description, undefined, handlers);
		return this;
	}

	/** define a command with handlers but no menu entry (debug/admin commands). chainable. */
	hidden(name: string | string[], ...handlers: [CommandHandler<C>, ...CommandHandler<C>[]]): this {
		this.define(name, undefined, undefined, handlers);
		return this;
	}

	/**
	 * a view whose `add`s attach commands to a specific menu scope. scoped menus repeat the
	 * unscoped commands — Telegram replaces (not merges) the list for users a scope matches.
	 */
	scoped(scope: BotCommandScope): ScopedCommands<C> {
		const view: ScopedCommands<C> = {
			add: (name, description, ...handlers) => {
				this.define(name, description, scope, handlers);
				return view;
			},
		};
		return view;
	}

	/** the `{ command, description }[]` one menu shows; unknown scopes fall back to default. */
	list(options?: { languageCode?: string; scope?: BotCommandScope }): BotCommand[] {
		const key = options?.scope !== undefined ? scopeKey(options.scope) : undefined;
		const groups = this.scopeGroups();
		const group =
			key !== undefined
				? groups.find((g) => g.scope !== undefined && scopeKey(g.scope) === key)
				: groups[0];

		return render(group?.defs ?? groups[0]?.defs ?? [], options?.languageCode);
	}

	/** every `(scope, language)` menu `register()` would push, in push order. */
	menus(): CommandMenu[] {
		const out: CommandMenu[] = [];

		for (const group of this.scopeGroups()) {
			const locales = new Set<string>();
			for (const d of group.defs)
				for (const locale of Object.keys(d.description))
					if (locale !== "default") locales.add(locale);

			const base: CommandMenu = { commands: render(group.defs) };
			if (group.scope !== undefined) base.scope = group.scope;
			out.push(base);

			for (const locale of [...locales].sort()) {
				const menu: CommandMenu = { languageCode: locale, commands: render(group.defs, locale) };
				if (group.scope !== undefined) menu.scope = group.scope;
				out.push(menu);
			}
		}

		return out;
	}

	/**
	 * a plugin that wires every command's (and alias's) handlers — `bot.install(cmd.plugin())`.
	 * for a shadowed name, the explicit-scope handlers win over the unscoped ones (empty
	 * explicit handlers — a menu-only override — fall back to the unscoped handlers instead).
	 */
	plugin(): Plugin<C, Record<never, never>> {
		const resolved = new Map<string, CommandHandler<C>[]>();

		for (const d of this.defs) {
			if (d.scope !== undefined) continue;
			for (const n of d.names) resolved.set(n, d.handlers);
		}
		for (const d of this.defs) {
			if (d.scope === undefined || d.handlers.length === 0) continue;
			for (const n of d.names) resolved.set(n, d.handlers);
		}

		return (composer) => {
			for (const [name, handlers] of resolved) {
				if (handlers.length === 0) continue;
				composer.command(name, ...handlers);
			}
			return composer;
		};
	}

	/**
	 * push menus to Telegram via `setMyCommands`. with no options pushes every menu from
	 * `menus()`; pass `scope`/`languageCode` to push a single one. returns what was pushed.
	 */
	async register(
		api: CommandApi,
		options?: { languageCode?: string; scope?: BotCommandScope },
	): Promise<CommandMenu[]> {
		let menus: CommandMenu[];

		if (options?.languageCode !== undefined || options?.scope !== undefined) {
			const menu: CommandMenu = { commands: this.list(options) };
			if (options.scope !== undefined) menu.scope = options.scope;
			if (options.languageCode !== undefined) menu.languageCode = options.languageCode;
			menus = [menu];
		} else {
			menus = this.menus();
		}

		for (const menu of menus) await setMenu(api, menu);
		return menus;
	}

	/**
	 * like `register()`, but reads each menu with `getMyCommands` first and only pushes the
	 * ones that changed — safe to run on every deploy.
	 */
	async sync(api: CommandApi): Promise<SyncResult> {
		const pushed: CommandMenu[] = [];
		const skipped: CommandMenu[] = [];

		for (const menu of this.menus()) {
			const current = await api.call<BotCommand[]>("getMyCommands", menuParams(menu));

			if (sameCommands(current, menu.commands)) {
				skipped.push(menu);
			} else {
				await setMenu(api, menu);
				pushed.push(menu);
			}
		}

		return { pushed, skipped };
	}

	/** clear every menu this registry manages via `deleteMyCommands`. returns the menus cleared. */
	async unregister(api: CommandApi): Promise<CommandMenu[]> {
		const menus = this.menus();
		for (const menu of menus) await api.call<boolean>("deleteMyCommands", menuParams(menu));
		return menus;
	}

	/**
	 * a name may be reused across an unscoped def and (at most) one explicit-scope def —
	 * the explicit one shadows the unscoped one, closing the gap where the base command
	 * set can't also target a specific scope's own menu (see the commands doc). two
	 * *explicit* scopes sharing a name stay forbidden: `command()` matches on text alone,
	 * so nothing at runtime could tell which of two differing handlers should fire.
	 */
	private checkAvailable(name: string, scope: BotCommandScope | undefined): void {
		const existing = this.taken.get(name);
		if (existing === undefined) return;

		if (scope === undefined) {
			if (existing.some((s) => s === undefined))
				throw new TypeError(`@yaebal/commands: duplicate command name "${name}"`);
			return;
		}

		const key = scopeKey(scope);
		for (const s of existing) {
			if (s === undefined) continue;
			throw new TypeError(
				scopeKey(s) === key
					? `@yaebal/commands: duplicate command name "${name}"`
					: `@yaebal/commands: "${name}" is already defined in another explicit scope — ` +
							`two explicit scopes can't share a name, only an unscoped def may be shadowed`,
			);
		}
	}

	private define(
		name: string | string[],
		description: CommandDescription | undefined,
		scope: BotCommandScope | undefined,
		handlers: CommandHandler<C>[],
	): void {
		const names = Array.isArray(name) ? name : [name];
		const [first] = names;
		if (first === undefined)
			throw new TypeError("@yaebal/commands: a command needs at least one name");

		for (const n of names) {
			if (!NAME_RE.test(n))
				throw new TypeError(
					`@yaebal/commands: invalid command name "${n}" — 1-32 chars, lowercase a-z, 0-9 and _`,
				);
			this.checkAvailable(n, scope);
		}

		const normalized = description === undefined ? undefined : normalizeDescription(description);

		for (const n of names) {
			const scopes = this.taken.get(n) ?? [];
			scopes.push(scope);
			this.taken.set(n, scopes);
		}
		this.defs.push({ names: [first, ...names.slice(1)], description: normalized, scope, handlers });

		for (const group of this.scopeGroups()) {
			if (group.defs.length > MAX_COMMANDS)
				throw new TypeError(
					`@yaebal/commands: a menu can hold at most ${MAX_COMMANDS} commands ("${first}" overflows it)`,
				);
		}
	}

	/**
	 * visible defs grouped per menu: the unscoped (default) menu first, then one group per
	 * distinct scope, each repeating the unscoped commands in insertion order — except a
	 * name shadowed by that scope's own explicit def, which shows the explicit def instead.
	 */
	private scopeGroups(): Array<{ scope?: BotCommandScope; defs: VisibleDef<C>[] }> {
		const visible = this.defs.filter((d): d is VisibleDef<C> => d.description !== undefined);
		const groups: Array<{ scope?: BotCommandScope; defs: VisibleDef<C>[] }> = [
			{ defs: visible.filter((d) => d.scope === undefined) },
		];

		const seen = new Set<string>();
		for (const d of visible) {
			if (d.scope === undefined) continue;
			const key = scopeKey(d.scope);
			if (seen.has(key)) continue;
			seen.add(key);

			const shadowedNames = new Set(
				visible
					.filter((v) => v.scope !== undefined && scopeKey(v.scope) === key)
					.flatMap((v) => v.names),
			);

			groups.push({
				scope: d.scope,
				defs: visible.filter((v) => {
					if (v.scope !== undefined) return scopeKey(v.scope) === key;
					return !v.names.some((n) => shadowedNames.has(n));
				}),
			});
		}

		return groups;
	}
}

/** create a registry. pass your bot's accumulated context type: `commands<MyContext>()`. */
export function commands<C extends Context = Context>(): Commands<C> {
	return new Commands<C>();
}
