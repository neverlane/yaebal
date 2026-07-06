import type { Context, Middleware } from "yaebal";

const handler: Middleware<Context & { text: string }> = (ctx) => {
	if (ctx.text.startsWith("/")) return;
	return ctx.reply(`message.text route saw: ${ctx.text}`);
};

export default handler;
