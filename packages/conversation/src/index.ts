import type { Context, Plugin } from "@yaebal/core";
import { createLiveEngine } from "./live.js";
import { createReplayEngine } from "./replay.js";
import type {
	ConversationBuilder,
	ConversationControl,
	ConversationDef,
	ConversationDefs,
	ConversationDefsContext,
	ConversationOptions,
} from "./types.js";

export { ConversationExitedError, ConversationHalt, ConversationTimeoutError } from "./errors.js";
export { perChat, perChatUser, perUser } from "./keys.js";
export type {
	AnyConversationDef,
	Conversation,
	ConversationBuilder,
	ConversationControl,
	ConversationDef,
	ConversationDefs,
	ConversationDefsContext,
	ConversationLeaveInfo,
	ConversationLeaveReason,
	ConversationName,
	ConversationOptions,
	ConversationParamsOf,
	ConversationResultOf,
	ConversationSnapshot,
	EnterArgs,
	FormApi,
	FormChoiceOptions,
	FormConfirmOptions,
	FormIntOptions,
	FormText,
	FormTextOptions,
	MaybePromise,
	StandardIssueLike,
	StandardSchemaLike,
	WaitOptions,
} from "./types.js";

/**
 * define one conversation. `R` (its result — surfaced via `onLeave`'s `info.result`) and `P`
 * (its `enter()` params) are usually inferred from `builder`; declare `C` explicitly when the
 * builder needs more than the base `Context` (e.g. `createConversation<Context & { session:
 * Profile }, …>`), the same way `@yaebal/scenes`' `defineScene` works — that's what makes
 * installing `conversation()` before a dependency (like `session`) a compile error instead of a
 * runtime `undefined`.
 *
 * @example
 * const greet = createConversation(async (cv, ctx) => {
 *   await ctx.send("what's your name?");
 *   const a = await cv.waitFor("message:text");
 *   return { name: a.text }; // read back via onLeave's info.result
 * });
 */
export function createConversation<C extends Context = Context, R = void, P = undefined>(
	builder: ConversationBuilder<C, R, P>,
): ConversationDef<C, R, P> {
	return { builder };
}

/**
 * yaebal/conversation — write multi-step dialogs as a straight line:
 *
 *   ```
 *   const greet = createConversation(async (cv, ctx) => {
 *     await ctx.send("what's your name?");
 *     const a = await cv.waitFor("message:text");
 *     await a.send(`hi ${a.text}`);
 *   });
 *
 *   bot.install(conversation({ greet }));
 *   bot.command("greet", (ctx) => ctx.conversation.enter("greet"));
 *   ```
 *
 * two engines share this exact API:
 *
 * - **live** (default): a genuine coroutine — the builder runs once, detached, and `cv.wait()`
 *   parks a real promise until a matching update arrives. no replay, so no duplicated side
 *   effects; state lives in memory only and does not survive a restart.
 * - **durable** (`options.storage`): the builder is replayed from a recorded update/api log on
 *   every update, so it survives a restart — at the cost of requiring a **deterministic**
 *   builder (route all IO through `ctx`/`cv.external()`, never a closure over outside state).
 *
 * while a conversation is active it owns the key's updates that its current `wait()` call would
 * otherwise miss (see `passthrough`); `/commands` bypass it by default (see `passCommands`).
 */
export function conversation<Defs extends ConversationDefs>(
	defs: Defs,
	options: ConversationOptions<ConversationDefsContext<Defs>> = {},
): Plugin<ConversationDefsContext<Defs>, { conversation: ConversationControl<Defs> }> {
	const engine = options.storage
		? createReplayEngine(defs, options as ConversationOptions<Context>)
		: createLiveEngine(defs, options as ConversationOptions<Context>);

	return engine as unknown as Plugin<
		ConversationDefsContext<Defs>,
		{ conversation: ConversationControl<Defs> }
	>;
}
