import { fileStorage } from "@yaebal/sklad/file";
import {
	clearSession,
	createBot,
	keyBy,
	type StorageAdapter,
	session,
	type TtlValue,
	ttl,
	unwrapTtl,
} from "yaebal";

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/session/.env first (copy .env.example)");
	process.exit(1);
}

// wrap any adapter with logging so the dirty-check is visible in the terminal:
// /count logs a write, /noop logs none — unchanged sessions are never persisted.
function logged<T>(name: string, inner: StorageAdapter<T>): StorageAdapter<T> {
	return {
		get: (key) => {
			console.log(`[${name}] get ${key}`);
			return inner.get(key);
		},
		set: (key, value) => {
			console.log(`[${name}] set ${key} ← ${JSON.stringify(value)}`);
			return inner.set(key, value);
		},
		delete: (key) => {
			console.log(`[${name}] delete ${key}`);
			return inner.delete(key);
		},
	};
}

interface ChatSession {
	count: number;
	since: string;
}

interface Profile {
	visits: number;
	otp?: TtlValue<string>;
}

const bot = createBot(token)
	// per-chat state in a json file — restart the bot and /count keeps counting.
	// the `migrations` block upgrades records written by older versions of this bot
	// ({ count } → { count, since }) the first time they are read.
	.install(
		session({
			initial: (): ChatSession => ({ count: 0, since: new Date().toISOString() }),
			storage: logged("chat", fileStorage<ChatSession>("./data/sessions.json", { pretty: true })),
			migrations: {
				1: (old) => ({ ...(old as { count: number }), since: "before migrations" }),
			},
		}),
	)
	// a second, independent session: per *user* (works across chats and inline queries),
	// under its own field. annotate `initial`'s return type — both generics infer from it.
	.install(
		session({
			key: "profile",
			getKey: keyBy.user,
			initial: (): Profile => ({ visits: 0 }),
			storage: logged("profile", fileStorage<Profile>("./data/profiles.json", { pretty: true })),
		}),
	);

bot.command("start", (ctx) =>
	ctx.reply(
		[
			"session demo:",
			"/count — per-chat counter (persisted to ./data, survives restarts)",
			"/noop — reads the session without changing it (watch the terminal: no write)",
			"/me — per-user visit counter (independent second session)",
			"/otp — issue a code that expires in 30s",
			"/check — see whether the code is still valid",
			"/reset — wipe both sessions",
		].join("\n"),
	),
);

bot.command("count", (ctx) => {
	ctx.session.count++;
	return ctx.reply(`count = ${ctx.session.count} (chat session since ${ctx.session.since})`);
});

bot.command("noop", (ctx) => {
	// read-only handler: the dirty-check skips the write — check your terminal
	return ctx.reply(`current count is ${ctx.session.count}; nothing was written to storage`);
});

bot.command("me", (ctx) => {
	ctx.profile.visits++;
	return ctx.reply(
		`you (${ctx.from?.id}) used this bot ${ctx.profile.visits} time(s), in any chat`,
	);
});

bot.command("otp", (ctx) => {
	const code = Math.random().toString(36).slice(2, 8);
	ctx.profile.otp = ttl(code, 30_000); // self-expiring field
	return ctx.reply(`your code: ${code} (valid 30s — try /check now and after)`);
});

bot.command("check", (ctx) => {
	const code = unwrapTtl(ctx.profile.otp);
	return ctx.reply(
		code === undefined ? "code expired (or never issued)" : `code still valid: ${code}`,
	);
});

bot.command("reset", async (ctx) => {
	await clearSession(ctx); // deletes the chat session record + fresh initial()
	await clearSession(ctx, "profile"); // same for the per-user one
	return ctx.reply("both sessions wiped — /count starts over");
});

bot.start();
console.log("session example running — talk to your bot and watch this terminal");
