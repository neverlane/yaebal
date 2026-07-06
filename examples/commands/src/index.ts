import { type Commands, commands } from "@yaebal/commands";
import { type Context, createBot, session } from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/commands/.env first (copy .env.example)");
	process.exit(1);
}

interface Stats {
	hits: number;
}

// the registry is generic over the bot's accumulated context: handlers below see
// ctx.session (from @yaebal/session) plus the typed ctx.command / ctx.args
type BotContext = Context & { session: Stats };

// the explicit annotation lets the /help handler below reference `cmd` itself
const cmd: Commands<BotContext> = commands<BotContext>()
	// ["name", ...aliases] — /go works too, only /start shows in the menu
	.add(["start", "go"], { default: "start the tour", ru: "начать тур" }, (ctx) => {
		ctx.session.hits++;
		return ctx.reply(
			[
				`hi! this is the @yaebal/commands tour (you typed /${ctx.command}).`,
				"try /help for the full list, or /echo one two.",
			].join("\n"),
		);
	})
	.add("echo", { default: "echo the arguments", ru: "повторить аргументы" }, (ctx) => {
		ctx.session.hits++;
		return ctx.reply(ctx.args.length > 0 ? ctx.args.join(" ") : "give me arguments: /echo one two");
	})
	.add("stats", { default: "commands handled for you", ru: "счётчик команд" }, (ctx) => {
		ctx.session.hits++;
		return ctx.reply(`commands handled for you this session: ${ctx.session.hits}`);
	})
	.add("help", { default: "list all commands", ru: "список команд" }, (ctx) => {
		ctx.session.hits++;
		return ctx.reply(
			cmd
				.list({ languageCode: ctx.from?.language_code })
				.map((c) => `/${c.command} — ${c.description}`)
				.join("\n"),
		);
	})
	// menu-only: no handlers here — the /about handler lives on the bot chain below
	.add("about", { default: "what this bot is", ru: "что это за бот" })
	// hidden: handled, but never shown in any menu
	.hidden("debug", (ctx) =>
		ctx.reply(JSON.stringify({ command: ctx.command, args: ctx.args }, null, 2)),
	)
	// hidden lifecycle demo: /menu sync | push | clear
	.hidden("menu", async (ctx) => {
		const [action] = ctx.args;

		if (action === "clear") {
			const cleared = await cmd.unregister(ctx.api);
			return ctx.reply(`cleared ${cleared.length} menus — the / picker is empty now`);
		}
		if (action === "push") {
			const pushed = await cmd.register(ctx.api);
			return ctx.reply(`pushed ${pushed.length} menus unconditionally`);
		}

		const { pushed, skipped } = await cmd.sync(ctx.api);
		return ctx.reply(`synced: ${pushed.length} pushed, ${skipped.length} unchanged`);
	});

// scoped: group admins see /pin_rules in their menu; everyone else only /start../about.
// the scope only affects the menu — the handler still runs for anyone who types it.
cmd
	.scoped({ type: "all_chat_administrators" })
	.add("pin_rules", { default: "post the group rules", ru: "правила группы" }, (ctx) =>
		ctx.reply("rules: be kind and use /help. (this menu entry is admin-only)"),
	);

const bot = createBot(token)
	.install(session<Stats>({ initial: () => ({ hits: 0 }) }))
	.install(cmd.plugin())
	// the handler for the menu-only /about entry — registry and handlers are decoupled
	.command("about", (ctx) =>
		ctx.reply(
			[
				"a focused tour of @yaebal/commands:",
				"typed registry, localized menus, scopes, aliases, hidden commands,",
				"and diff-based menu sync. see examples/commands/src/index.ts.",
			].join("\n"),
		),
	)
	.on("message:text", (ctx) => ctx.reply("that's not a command i know — try /help."))
	.onStart(async (info) => {
		// diff-aware: default + ru menus, admin scope included, pushed only when changed
		const result = await cmd.sync(bot.api).catch(() => undefined);
		const status = result
			? `${result.pushed.length} pushed, ${result.skipped.length} unchanged`
			: "sync failed";
		console.log(`@${info.username} commands tour is live — menus: ${status}`);
	});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

await bot.start();
