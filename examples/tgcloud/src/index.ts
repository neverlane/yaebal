import { bot } from "./bot.js";

if (!process.env.BOT_TOKEN) {
	console.error("set BOT_TOKEN in examples/tgcloud/.env first (copy .env.example)");
	process.exit(1);
}

bot.onStart((info) => console.log(`@${info.username} tgcloud echo is live (long polling)`));

await bot.start();
