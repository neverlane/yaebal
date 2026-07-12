import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/modular-router/.env first (copy .env.example)");
	process.exit(1);
}

export const bot = createBot(token);
