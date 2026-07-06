import { fileURLToPath } from "node:url";
import { loadRoutes } from "@yaebal/router";
import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/modular-router/.env first (copy .env.example)");
	process.exit(1);
}

const bot = createBot(token);
const routesDir = fileURLToPath(new URL("./routes", import.meta.url));
const registered = await loadRoutes(bot, routesDir);

bot.onStart(async (info) => {
	await bot.api
		.call("setMyCommands", {
			commands: [
				{ command: "start", description: "open modular router demo" },
				{ command: "help", description: "show loaded routes" },
			],
		})
		.catch(() => {});

	console.log(`@${info.username} modular router is live`);
	console.log(`loaded routes: ${registered.join(", ") || "none"}`);
});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
