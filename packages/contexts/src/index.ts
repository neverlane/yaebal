/**
 * @yaebal/contexts — a context class per Update type (`MessageContext`,
 * `CallbackQueryContext`, …), each merging the raw payload fields and exposing
 * shortcut methods (`reply`, `editText`, `delete`, `answer`, …) that are
 * AUTO-GENERATED from the Bot API methods + the ids the context carries.
 * Regenerate with `pnpm --filter @yaebal/contexts generate`.
 */
export * from "./generated/index.js";
export type { ReactionInput } from "./sugar/message.js";
