import { defineCommand } from "../../../router.js";

export default defineCommand(
	"whoami",
	{ description: "admin-only: show your telegram id" },
	async (ctx) => {
		await ctx.reply(
			[
				`id: ${ctx.from?.id}`,
				`chat: ${ctx.chat?.type}`,
				"(this route only ran because routes/commands/admin/_guard.ts let it through)",
			].join("\n"),
		);
	},
);
