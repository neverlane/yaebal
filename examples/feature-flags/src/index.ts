import { envProvider, featureFlags, flagsAdmin, whenFlag } from "@yaebal/feature-flags";
import { createBot } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/feature-flags/.env first (copy .env.example)");
	process.exit(1);
}

// set ADMIN_ID in .env to your telegram user id to unlock /flags; otherwise everyone can use it
// (fine for this demo, but pass a real allow-list/role check in production).
const adminId = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : undefined;

const bot = createBot(token)
	.install(
		featureFlags({
			flags: {
				// a plain percentage rollout — 25% of users see it, deterministically
				"new-ui": { default: false, rules: [{ percentage: 25 }] },

				// default on for everyone, except a kill-switched cohort (value: false)
				"legacy-mode": { default: true, rules: [{ userIds: [666], value: false }] },

				// only announced in group chats
				"group-announce": { default: false, rules: [{ chatTypes: ["group", "supergroup"] }] },

				// a multivariate flag: three checkout flows, weighted
				checkout: {
					default: "control",
					variants: [
						{ value: "control", weight: 50 },
						{ value: "v2", weight: 30 },
						{ value: "v3", weight: 20 },
					],
				},
			},
			// process.env.FLAG_NEW_UI, if set, overrides the local catalog for "new-ui" — try
			// `FLAG_NEW_UI=true pnpm --filter @yaebal/example-feature-flags dev`
			provider: envProvider(),
			onEvaluate: (event) =>
				console.log(`[flags] ${event.key} -> ${JSON.stringify(event.value)} (${event.source})`),
		}),
	)
	// an isolated branch: only reachable while "new-ui" is on for the caller, regardless of
	// where in the chain it's installed or what's registered around it
	.install(
		whenFlag("new-ui", (branch) =>
			branch.command("beta", (ctx) => ctx.reply("you're in the new-ui beta — thanks for testing!")),
		),
	)
	// telegram-native admin surface: /flags, /flags set <key> <value>, /flags clear <key>
	.install(
		flagsAdmin({
			isAdmin: (ctx) => adminId === undefined || ctx.from?.id === adminId,
		}),
	);

bot.command("start", (ctx) =>
	ctx.reply(
		[
			"this bot demos @yaebal/feature-flags. try:",
			"/feature — is new-ui on for you? (25% rollout)",
			"/enable — force new-ui on for yourself only",
			"/beta — only answers while new-ui is on for you",
			"/checkout — which checkout variant you're bucketed into",
			"/promote — force everyone onto the v2 checkout (global override)",
			"/announce — only answers in a group/supergroup chat",
			"/flags — list every flag (admin command; open unless ADMIN_ID is set)",
		].join("\n"),
	),
);

bot.command("feature", async (ctx) => {
	const on = await ctx.flags.isEnabled("new-ui");
	await ctx.reply(`new-ui: ${on ? "on" : "off"}`);
});

bot.command("enable", async (ctx) => {
	await ctx.flags.setOverride("new-ui", true);
	await ctx.reply("new-ui enabled for you — try /feature again, then /beta");
});

bot.command("checkout", async (ctx) => {
	const variant = await ctx.flags.getVariant("checkout");
	await ctx.reply(`checkout: ${variant}`);
});

bot.command("promote", async (ctx) => {
	// forces every bucket at once, independent of any per-user override — an emergency-safe
	// rollout lever, auto-expiring after an hour so a bad promotion can't linger forever
	await ctx.flags.setGlobalOverride("checkout", "v2", { ttl: 60 * 60 * 1000 });
	await ctx.reply("checkout: v2 promoted for everyone (expires in 1h)");
});

bot.command("announce", async (ctx) => {
	const on = await ctx.flags.isEnabled("group-announce");
	await ctx.reply(
		on ? "📣 group announcement is live here" : "nothing to announce (not a group chat)",
	);
});

bot.start();
