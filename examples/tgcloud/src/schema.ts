/**
 * the database telegram serverless actually runs. copied verbatim to
 * `tgcloud/schema.js` by `pnpm build` — the platform reads that file itself,
 * so it must stay a real module that imports `sdk/db`, never a bundled handler.
 *
 * one row per chat. `seen` counts messages the bot echoed, `pings` counts
 * button presses. no foreign keys: the platform rejects them.
 */
import { integer, table } from "sdk/db";

export const counters = table("counters", {
	chatId: integer("chat_id").primaryKey(),
	seen: integer("seen").notNull().default(0),
	pings: integer("pings").notNull().default(0),
});
