import type { CallbackQuery, Context, Middleware } from "@yaebal/core";

const handler: Middleware<Context & { callbackQuery: CallbackQuery }> = async (ctx) => {
	const data = ctx.callbackQuery.data ?? "unknown";
	await ctx.answerCallbackQuery({ text: `handled by file route: ${data}` });
	await ctx.send(`callback route handled: ${data}`);
};

export default handler;
