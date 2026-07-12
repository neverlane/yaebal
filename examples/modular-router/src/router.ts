import { type ContextOf, createRouter } from "@yaebal/router";
import type { bot } from "./bot.js";

/**
 * bind every `define*` helper to this bot's own accumulated context type, so route files see
 * `yaebal`'s rich per-update context (and any `derive`/`decorate` this bot adds later) instead of
 * the bare `Context` — import these from route files instead of the bare `@yaebal/router`.
 */
export const { defineCommand, defineOn, defineHears, defineUse, defineGuard } =
	createRouter<ContextOf<typeof bot>>();
