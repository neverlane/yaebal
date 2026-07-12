import {
	botHasPermission,
	guardOr,
	hasPermission,
	isAdmin,
	isAnonymousAdmin,
	isOwner,
	membership,
} from "@yaebal/guards";
import { and, createBot, filters } from "yaebal";

// a focused bot that shows @yaebal/guards: cached membership lookups, answering a denial
// instead of dropping it, and telegram's anonymous-admin/owner edge case.
//
//   pnpm --filter @yaebal/example-guards dev   (needs BOT_TOKEN in .env)

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/guards/.env first (copy .env.example)");
	process.exit(1);
}

const bot = createBot(token).install(
	membership({
		ttl: 60_000,
		onEvent: (event) => console.log(`[membership cache] ${event.type} ${event.key}`),
	}),
);

bot.command("start", (ctx) =>
	ctx.reply(
		"This bot uses @yaebal/guards. Try /ban (admin-only, cached), /mute (denial gets a " +
			"reply), /pin (checks the bot's own permission), and /whoami (dumps every guard's " +
			"verdict for you).",
	),
);

// the safe pattern: getChatMember only runs for an actual /ban, not for every message —
// membership() then caches that lookup for 60s per (chat, user).
bot.filter(and(filters.command("ban"), isAdmin), (ctx) =>
	ctx.reply(`banned by ${ctx.from?.first_name ?? "someone"} (not really — this is a demo)`),
);

// guardOr answers a denial instead of silently dropping the update, unlike bare bot.guard().
bot
	.use(guardOr(isAdmin, (ctx) => ctx.reply("admins only.")))
	.command("mute", (ctx) => ctx.reply("muted (not really — this is a demo)"));

// checking the bot's *own* standing before an action that needs it.
bot.command("pin", async (ctx) => {
	if (!(await botHasPermission("can_pin_messages")(ctx))) {
		await ctx.reply("I don't have permission to pin messages here.");
		return;
	}

	await ctx.reply("I could pin messages here (not actually pinning — this is a demo).");
});

// dump every guard's verdict for the caller — including telegram's anonymous-admin/owner
// case, where isAdmin passes without an api call but isOwner denies (telegram never says
// which one an anonymous poster actually is).
bot.command("whoami", async (ctx) => {
	const [admin, owner, restrictor, anonymous] = await Promise.all([
		isAdmin(ctx),
		isOwner(ctx),
		hasPermission("can_restrict_members")(ctx),
		Promise.resolve(isAnonymousAdmin(ctx)),
	]);

	await ctx.reply(
		[
			`anonymous poster: ${anonymous}`,
			`isAdmin: ${admin}`,
			`isOwner: ${owner}`,
			`hasPermission("can_restrict_members"): ${restrictor}`,
		].join("\n"),
	);
});

bot.start();
