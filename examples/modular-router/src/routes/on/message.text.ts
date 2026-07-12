import { defineOn } from "../../router.js";

export default defineOn("message:text", async (ctx) => {
	if (ctx.text.startsWith("/")) return;
	await ctx.reply(`message.text route saw: ${ctx.text}`);
});
