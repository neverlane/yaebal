import { COMMAND_UPDATES, type Context, messageOf } from "@yaebal/core";
import { perChatUser } from "./keys.js";
import type {
	AnyConversationDef,
	ConversationDefs,
	ConversationOptions,
	MaybePromise,
} from "./types.js";

/** `conversation()`'s defs, keyed and validated once at install time. */
export function resolveDefs<Defs extends ConversationDefs>(
	defs: Defs,
): Map<string, AnyConversationDef> {
	const registry = new Map<string, AnyConversationDef>();

	for (const [name, def] of Object.entries(defs)) {
		registry.set(name, def);
	}

	return registry;
}

export function requireDef(
	registry: Map<string, AnyConversationDef>,
	name: string,
): AnyConversationDef {
	const def = registry.get(name);
	if (!def) {
		throw new Error(
			`conversation: unknown conversation "${name}" — registered: ${[...registry.keys()].join(", ")}`,
		);
	}
	return def;
}

/** does this update carry a command that `passCommands` exempts from the active conversation? */
export function isPassedCommand(ctx: Context, passCommands: boolean | string[]): boolean {
	if (passCommands === false) return false;
	if (!COMMAND_UPDATES.has(ctx.updateType)) return false;

	const text = messageOf(ctx.update)?.text;
	if (text === undefined || !text.startsWith("/")) return false;
	if (passCommands === true) return true;

	const [head = ""] = text.slice(1).split(/\s/, 1);
	const [base = ""] = head.split("@");
	return passCommands.some((command) => command.toLowerCase() === base.toLowerCase());
}

export async function resolvePassthrough<C extends Context>(
	passthrough: boolean | ((ctx: C) => MaybePromise<boolean>),
	ctx: C,
): Promise<boolean> {
	return typeof passthrough === "function" ? await passthrough(ctx) : passthrough;
}

/** every option resolved to a concrete value/default — both engines are built on this, never on the raw `ConversationOptions`. */
export interface ResolvedOptions<C extends Context> {
	getKey: (ctx: C) => string | undefined;
	passCommands: boolean | string[];
	passthrough: boolean | ((ctx: C) => MaybePromise<boolean>);
	waitTimeout: number | undefined;
	queueLimit: number;
	now: () => number;
	onEnter?: ConversationOptions<C>["onEnter"];
	onLeave?: ConversationOptions<C>["onLeave"];
	onError: NonNullable<ConversationOptions<C>["onError"]>;
	onOverflow?: ConversationOptions<C>["onOverflow"];
}

function defaultOnError(error: unknown, _ctx: Context, info: { name: string }): void {
	console.error(`@yaebal/conversation: "${info.name}" builder threw`, error);
}

export function resolveOptions<C extends Context>(
	options: ConversationOptions<C>,
): ResolvedOptions<C> {
	return {
		getKey: options.getKey ?? (perChatUser as (ctx: C) => string | undefined),
		passCommands: options.passCommands ?? true,
		passthrough: options.passthrough ?? true,
		waitTimeout: options.waitTimeout,
		queueLimit: options.queueLimit ?? 100,
		now: options.now ?? Date.now,
		onEnter: options.onEnter,
		onLeave: options.onLeave,
		onError: options.onError ?? defaultOnError,
		onOverflow: options.onOverflow,
	};
}
