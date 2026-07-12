import { defineCommand } from "../../router.js";

export default defineCommand(
	["help", "h"],
	{ description: "list what's wired up" },
	async (ctx) => {
		await ctx.reply(
			[
				"loaded from file routes:",
				"/start -> routes/commands/start.ts",
				"/help, /h -> routes/commands/help.ts",
				'"ping" -> routes/hears/ping.ts',
				"text -> routes/on/message.text.ts",
				"callbacks -> routes/on/callback_query.data.ts",
				"/whoami -> routes/commands/admin/whoami.ts (gated by routes/commands/admin/_guard.ts)",
			].join("\n"),
		);
	},
);
