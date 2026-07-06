import { installToml } from "@yaebal/toml";
import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is required");

const bot = createBot(token);

await installToml(bot, "./bot.toml", {
	handlers: {
		ping: async (ctx) => {
			await ctx.reply("pong from typescript");
		},
		adminPanel: async (ctx) => {
			await ctx.reply("admin panel");
		},
		secretHandler: async (ctx) => {
			await ctx.reply("secret");
		},
		profileCallback: async (ctx) => {
			await ctx.reply("profile");
		},
	},
});

await bot.start();
