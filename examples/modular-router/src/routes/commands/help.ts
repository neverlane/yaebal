import type { Context, Middleware } from "yaebal";

const handler: Middleware<Context> = (ctx) =>
	ctx.reply(
		[
			"loaded from file routes:",
			"/start -> routes/commands/start.ts",
			"/help -> routes/commands/help.ts",
			"text -> routes/on/message.text.ts",
			"callbacks -> routes/on/callback_query.data.ts",
		].join("\n"),
	);

export default handler;
