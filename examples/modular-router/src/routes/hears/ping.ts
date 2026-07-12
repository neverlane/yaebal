import { defineHears } from "../../router.js";

export default defineHears("ping", async (ctx) => {
	await ctx.reply("pong (matched by routes/hears/ping.ts)");
});
