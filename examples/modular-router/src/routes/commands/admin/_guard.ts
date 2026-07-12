import { defineGuard } from "../../../router.js";

// a real bot would check ctx.from.id against an admin allowlist (or a session/db flag) — this
// demo guard just restricts to private chats, so /whoami is easy to try with zero setup. it
// gates every route under this directory (just `whoami.ts` today, but any file added here later
// too), evaluated before the guard(s) of any directory above it.
export default defineGuard((ctx) => ctx.chat?.type === "private");
