import { fileURLToPath } from "node:url";
import { loadRoutes, type RegisteredRoute, watchRoutes } from "@yaebal/router";
import { bot } from "./bot.js";

const routesDir = fileURLToPath(new URL("./routes", import.meta.url));
// `pnpm dev` sets this (see package.json) to demo watchRoutes(); `pnpm start` uses plain
// loadRoutes() instead — that's the one to reach for in production.
const watch = process.env.ROUTER_WATCH === "1";

function logRoutes(label: string, routes: RegisteredRoute[]): void {
	console.log(`${label}: ${routes.map((r) => `${r.kind}:${r.trigger}`).join(", ") || "none"}`);
}

if (watch) {
	const stop = await watchRoutes(bot, routesDir, {
		syncCommands: true,
		onReload: (result) => logRoutes("routes reloaded", result.routes),
	});

	const shutdown = async () => {
		await stop();
		await bot.stop();
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
} else {
	const result = await loadRoutes(bot, routesDir, { syncCommands: true });
	logRoutes("routes loaded", result.routes);

	process.once("SIGINT", () => bot.stop());
	process.once("SIGTERM", () => bot.stop());
}

bot.onStart((info) => {
	console.log(`@${info.username} modular router is live (${watch ? "watch" : "static"} mode)`);
});

await bot.start();
