import { defineOn } from "../../router.js";

export default defineOn("callback_query:data", async (ctx) => {
	const data = ctx.callbackQuery.data ?? "unknown";
	await ctx.answerCallbackQuery({ text: `handled by file route: ${data}` });
	await ctx.send(`callback route handled: ${data}`);
});
