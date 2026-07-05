import type { Context, Middleware } from "@yaebal/core";
import { InlineKeyboard } from "@yaebal/keyboard";

const handler: Middleware<Context> = (ctx) =>
	ctx.reply("modular router online. type anything or press a route button.", {
		reply_markup: new InlineKeyboard()
			.text("ping route", "route:ping")
			.text("status route", "route:status")
			.build(),
	});

export default handler;
