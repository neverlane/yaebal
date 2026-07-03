import { Bot } from "@yaebal/core";
import { createTestingLabBot } from "./bot.js";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/testing-lab/.env first (copy .env.example)");
	process.exit(1);
}

const bot = new Bot(token).extend(createTestingLabBot()).onStart(async (info) => {
	await bot.api
		.call("setMyCommands", {
			commands: [
				{ command: "start", description: "open testable vote bot" },
				{ command: "stats", description: "show vote counters" },
			],
		})
		.catch(() => {});
	console.log(`@${info.username} testing lab is live`);
});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
