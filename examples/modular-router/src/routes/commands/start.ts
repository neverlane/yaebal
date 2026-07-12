import { InlineKeyboard } from "yaebal";
import { defineCommand } from "../../router.js";

export default defineCommand(
	"start",
	{ description: "open the modular router demo" },
	async (ctx) => {
		await ctx.reply('modular router online. type anything, say "ping", or press a route button.', {
			reply_markup: new InlineKeyboard()
				.text("ping route", "route:ping")
				.text("status route", "route:status")
				.build(),
		});
	},
);
