---
name: yaebal-ai-features
description: Use when adding LLM features to a yaebal bot with @yaebal/ai — ctx.ai streaming replies, model adapters, conversation memory, and rate limits.
---

# llm replies with @yaebal/ai

`bot.install(ai({ model }))` adds `ctx.ai` to every context: model calls flow through optional
per-user limits, conversation memory and a system prompt, and stream into the chat using
telegram's native draft animation where available.

## canonical setup

```typescript
import { createBot } from "yaebal";
import { ai, openaiCompatible, AiLimitError } from "@yaebal/ai";

const bot = createBot(process.env.BOT_TOKEN!).install(
	ai({
		model: openaiCompatible({ model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY }),
		system: "you are a concise, friendly assistant.",
		limits: { perUser: "20/h" },
		parseMode: "MarkdownV2", // finalized messages only — see behavior below
	}),
);

bot.on("message:text", async (ctx) => {
	try {
		await ctx.ai.replyStream(ctx.text);
	} catch (error) {
		if (error instanceof AiLimitError)
			return ctx.reply(`slow down — try again in ${Math.ceil(error.retryAfterMs / 1000)}s`);
		throw error;
	}
});

bot.command("reset", async (ctx) => {
	await ctx.ai.reset();
	await ctx.send("forgotten.");
});
```

## the ctx.ai api

- `ctx.ai.replyStream(prompt, options?)` — stream into the chat: in private chats via
  `sendMessageDraft` (telegram's own "Thinking…" placeholder + animated draft, finalized as a
  real message); in groups/channels via throttled `editMessageText` with a `▍` cursor. answers
  past 4096 chars split at word boundaries and finalize message-by-message. returns
  `{ text, messages, mode: "draft" | "edit", ticks, aborted }`.
- `ctx.ai.reply(prompt, options?)` — generate fully, then send (typing action kept alive
  meanwhile); returns `{ text, usage?, messages }`.
- `ctx.ai.generate(prompt, options?)` — run the model, return `{ text, usage }`, send nothing.
  does **not** write memory by default (opt in with `{ memory: true }`).
- `ctx.ai.stream(prompt, options?)` — raw `AsyncIterable<string>` for custom rendering; reads
  memory but never writes it.
- `ctx.ai.history()` / `ctx.ai.reset()` — read / forget this conversation's memory.
- `ctx.ai.model` — the resolved adapter (`.id` for logs).

`prompt` is a string or an `AiMessage[]`; per-call options can override `system`, `memory`,
`temperature`, `maxTokens`, and pass an `AbortSignal` as `signal`.

## model adapters — four doors

```typescript
openaiCompatible({ model: "llama3.2", baseUrl: "http://localhost:11434/v1" }); // any /chat/completions api
anthropicModel({ model: "claude-sonnet-5", apiKey: process.env.ANTHROPIC_API_KEY! });
ai({ model: anthropic("claude-sonnet-5") });     // a vercel ai sdk LanguageModel, auto-detected
                                                 // (or wrap explicitly: aiSdk(anthropic("...")))
customModel(async function* ({ messages }) {     // anything that yields strings
	yield "hello ";
	yield "world";
});
```

`openaiCompatible` and `anthropicModel` are zero-dependency fetch adapters; the ai sdk bridge
lazy-loads the `ai` package only when used.

## rules

- **parse mode is finalization-only by design**: in-flight draft/edit previews stay plain text
  so a half-open `**bold` can never 400 mid-stream. if telegram rejects the finished entities,
  the text is resent plain instead of being lost. don't try to apply markup to previews.
- memory is on by default — keyed per user per chat, windowed (32 turns). pass a
  `@yaebal/sklad` `StorageAdapter` via `memory: { storage }` to persist across restarts, or
  `memory: false` for stateless calls.
- exhausted `limits.perUser` budgets throw `AiLimitError` (with `retryAfterMs`) — catch it and
  answer politely; don't let it hit the global error handler.
- streaming knobs live under `streaming`: `intervalMs` (500 draft / 1200 edit), `drafts: false`
  to opt out of drafts in private chats, `cursor` (`""` disables), `maxLength`.
- `typing: false` disables the typing action for non-streamed replies.

## learn more

- https://yaebal.mom/docs/llms/ — the @yaebal/ai docs (plugin + agent tooling)
