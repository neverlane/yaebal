import { type Context, InlineKeyboard, type Middleware } from "yaebal";

const handler: Middleware<Context> = (ctx) =>
	ctx.reply("modular router online. type anything or press a route button.", {
		reply_markup: new InlineKeyboard()
			.text("ping route", "route:ping")
			.text("status route", "route:status")
			.build(),
	});

export default handler;
