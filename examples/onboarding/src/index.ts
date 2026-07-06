import { createOnboarding } from "@yaebal/onboarding";
import { bold, createBot, format } from "yaebal";

// a focused tour of @yaebal/onboarding.
//
// pnpm --filter @yaebal/example-onboarding dev (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/onboarding/.env first (copy .env.example)");
	process.exit(1);
}

const welcome = createOnboarding({ id: "welcome", concurrency: "preempt" })
	.step("hello", {
		text: (ctx) =>
			format`hi ${bold(ctx.from?.first_name ?? "there")} - this is a short onboarding tour.`,
		buttons: ["next", "dismiss"],
	})
	.step("features", {
		text: "yaebal onboarding keeps flow state, renders inline buttons, and gives handlers a typed ctx.onboarding.welcome control.",
		buttons: ["next", { text: "jump to commands", goto: "commands" }, "exit"],
	})
	.step("commands", {
		text: "try /status during the tour, /exit to leave it, /disable to opt out, and /tour to restart.",
		buttons: ["next", "exit"],
	})
	.step("done", {
		text: "all set. the flow will now mark itself completed.",
	})
	.onComplete((ctx) => ctx.send("welcome aboard - run /tour any time to see it again."))
	.onExit((ctx, meta) =>
		ctx.send(`left onboarding at ${meta.at || "unknown"}. run /tour to restart.`),
	)
	.onDismiss((ctx) => ctx.send("onboarding dismissed. run /enable if you want to allow it again."))
	.build();

const bot = createBot(token)
	.install(welcome)
	.command("start", async (ctx) => {
		const result = await ctx.onboarding.welcome.start();

		if (result === "already-completed") {
			return ctx.reply("you already completed onboarding. run /tour to force-start it again.");
		}

		if (result === "dismissed" || result === "opted-out") {
			return ctx.reply("onboarding is disabled for you. run /enable, then /tour.");
		}
	})
	.command("tour", (ctx) => ctx.onboarding.welcome.start({ force: true }))
	.command("status", (ctx) => {
		const flow = ctx.onboarding.welcome;
		const active = ctx.onboarding.active;

		return ctx.reply(
			`status=${flow.status}, step=${flow.currentStep ?? "none"}, active=${
				active ? `${active.id}:${active.step}` : "none"
			}`,
		);
	})
	.command("disable", async (ctx) => {
		await ctx.onboarding.disableAll();
		return ctx.reply("all onboarding flows disabled for this scope.");
	})
	.command("enable", async (ctx) => {
		await ctx.onboarding.enableAll();
		await ctx.onboarding.welcome.undismiss();
		return ctx.reply("onboarding enabled. run /tour to start it.");
	})
	.command("exit", (ctx) => ctx.onboarding.welcome.exit())
	.onError((error, ctx) => {
		console.error(`update ${ctx.update.update_id} failed:`, error);
	})
	.onStart(async (info) => {
		await bot.api
			.call("setMyCommands", {
				commands: [
					{ command: "start", description: "start onboarding" },
					{ command: "tour", description: "force-restart onboarding" },
					{ command: "status", description: "show onboarding state" },
					{ command: "disable", description: "disable onboarding" },
					{ command: "enable", description: "enable onboarding" },
					{ command: "exit", description: "exit the active tour" },
				],
			})
			.catch(() => {});

		console.log(`@${info.username} is live - DM it /start`);
	});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
