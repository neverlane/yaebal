import { AiLimitError, ai, openaiCompatible } from "@yaebal/ai";
import { createBot } from "yaebal";

// an ai chat bot with streamed answers, per-user memory and polite rate limits.
//
//   pnpm --filter @yaebal/example-ai-chat dev
//
// needs BOT_TOKEN and an llm in .env (copy .env.example): any openai-compatible
// provider works — openai itself, openrouter, groq, or a local ollama.

const token = process.env.BOT_TOKEN;
if (!token) {
	console.error("set BOT_TOKEN in examples/ai-chat/.env first (copy .env.example)");
	process.exit(1);
}

const bot = createBot(token).install(
	ai({
		// ollama out of the box; flip the env vars for any hosted provider.
		model: openaiCompatible({
			model: process.env.AI_MODEL ?? "llama3.2",
			baseUrl: process.env.AI_BASE_URL ?? "http://localhost:11434/v1",
			apiKey: process.env.AI_API_KEY,
		}),
		system:
			"you are a friendly telegram bot. answer briefly — a phone screen, not an essay. " +
			"match the user's language.",
		// memory is on by default (per user per chat, windowed); limits keep the bill sane.
		limits: { perUser: "20/h" },
	}),
);

bot.command("start", (ctx) =>
	ctx.send("hi! i'm an ai chat bot — just write to me. /reset wipes my memory of us."),
);

bot.command("reset", async (ctx) => {
	await ctx.ai.reset();
	await ctx.send("clean slate. who are you again?");
});

bot.on("message:text", async (ctx) => {
	try {
		// in private chats this streams via telegram's native draft animation
		// ("Thinking…", then a live-growing preview); in groups it grows a message
		// through throttled edits with a ▍ cursor. long answers split automatically.
		await ctx.ai.replyStream(ctx.text);
	} catch (error) {
		if (error instanceof AiLimitError) {
			const minutes = Math.ceil(error.retryAfterMs / 60_000);
			await ctx.reply(`easy! you hit the hourly limit — try again in ~${minutes}m.`);
			return;
		}
		throw error;
	}
});

bot.onError((error, ctx) => {
	console.error("update failed", ctx?.update?.update_id, error);
});

await bot.start();
console.log("ai-chat bot is up");
