# @yaebal/ai

llm superpowers for telegram bots. `ctx.ai.replyStream()` streams a model's answer straight
into the chat — with telegram's native draft animation ("Thinking…", live-updating preview) in
private chats and throttled edits with a typing cursor everywhere else. conversation memory,
per-user limits, and a provider-agnostic model contract are built in.

the same package also ships the yaebal dev tooling for ai coding agents: an mcp server with
the full bot api schema and an installer that configures claude code, cursor, codex, opencode
and friends — see [ai tooling docs](https://yaebal.mom/docs/llms/).

## install

```sh
pnpm add @yaebal/ai
```

## usage

```ts
import { createBot } from "yaebal";
import { ai, openaiCompatible } from "@yaebal/ai";

const bot = createBot(process.env.BOT_TOKEN!).install(
	ai({
		model: openaiCompatible({ model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY }),
		system: "you are a concise, friendly assistant.",
		limits: { perUser: "20/h" },
	}),
);

bot.on("message:text", async (ctx) => {
	await ctx.ai.replyStream(ctx.text);
});

bot.command("reset", async (ctx) => {
	await ctx.ai.reset();
	await ctx.send("forgotten.");
});
```

## models

any provider works through one of four doors:

```ts
// 1. any /chat/completions provider — openai, ollama, openrouter, groq, mistral, deepseek…
openaiCompatible({ model: "llama3.2", baseUrl: "http://localhost:11434/v1" });

// 2. anthropic, natively
anthropicModel({ model: "claude-sonnet-5-5", apiKey: process.env.ANTHROPIC_API_KEY! });

// 3. the whole vercel ai sdk ecosystem (needs `pnpm add ai` + a provider package)
import { anthropic } from "@ai-sdk/anthropic";
ai({ model: anthropic("claude-sonnet-5-5") });

// 4. anything that yields strings
customModel(async function* ({ messages }) {
	yield "hello ";
	yield "world";
});
```

the first two are zero-dependency `fetch` adapters; the ai sdk bridge lazy-loads `ai` only
when used.

## what lands on ctx

| member | does |
| --- | --- |
| `ctx.ai.replyStream(prompt)` | stream the answer into the chat (drafts / throttled edits), split across messages past 4096 chars |
| `ctx.ai.reply(prompt)` | generate fully, then send (typing indicator kept alive meanwhile) |
| `ctx.ai.generate(prompt)` | run the model, return `{ text, usage }` — sends nothing |
| `ctx.ai.stream(prompt)` | raw `AsyncIterable<string>` for custom rendering |
| `ctx.ai.history()` / `ctx.ai.reset()` | read / forget this conversation's memory |
| `ctx.ai.model` | the resolved adapter (id, direct access) |

## behavior

- **streaming** — in private chats the answer renders through `sendMessageDraft`: users see
  telegram's own "Thinking…" placeholder and an animated draft, finalized into a real message
  via `sendMessage`. in groups and channels the answer grows by throttled `editMessageText`
  calls with a `▍` cursor. answers longer than 4096 chars are split at word boundaries
  (`@yaebal/split`) and finalized message-by-message while the stream keeps going.
- **formatting** — `parseMode` applies to finalized messages only; in-flight previews stay
  plain so a half-open `**bold` can never 400 the stream. if telegram rejects the finished
  entities, the text is resent plain instead of being lost.
- **rich messages** — `rich: true` (markdown) or `rich: "html"` answers as telegram rich
  messages: the model's markdown renders natively — headings, lists, code blocks, tables, math
  — and streams live through `sendRichMessageDraft` (opening with the native `<tg-thinking>`
  placeholder), finalized via `sendRichMessage`; groups grow a rich message by edits. the
  per-message budget becomes 32768 characters. markup telegram rejects is resent as plain text.
  pair it with `RICH_MARKDOWN_PROMPT` from `@yaebal/rich` in `system` so the model stays inside
  the grammar telegram parses.
- **memory** — on by default, keyed per user per chat, windowed (default 32 turns). pass any
  `@yaebal/sklad` `StorageAdapter` to persist it (redis, file, …), or `memory: false` for
  stateless calls.
- **limits** — `limits: { perUser: "20/h" }` gates every model call with a sliding window;
  exhausted calls throw `AiLimitError` (with `retryAfterMs`) for you to catch and answer
  politely.

## options

| option | default | does |
| --- | --- | --- |
| `model` | — | `AiModel` adapter or ai sdk `LanguageModel` (auto-detected) |
| `system` | — | system prompt, static or `(ctx) => string` |
| `memory` | `true` | `false`, or `{ storage, key, window }` |
| `limits.perUser` | off | `"20/h"`-style budget per user |
| `parseMode` | plain | `"MarkdownV2"` / `"HTML"` for finalized messages |
| `rich` | off | `true` / `"markdown"` / `"html"` — answer as rich messages (also per call) |
| `streaming.thinking` | `"Thinking…"` | label of the `<tg-thinking>` placeholder in rich drafts |
| `streaming.intervalMs` | 500 draft / 1200 edit | min gap between preview updates |
| `streaming.drafts` | `true` | opt out of drafts in private chats |
| `streaming.cursor` | `"▍"` | in-flight cursor for edit mode, `""` disables |
| `typing` | `true` | typing action during non-streamed replies |
| `temperature`, `maxTokens` | provider defaults | forwarded to the model |

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.


## native stop button (bot api 10.3)

set `streaming: { canStop: true, keepOnStop: true }` to show telegram's stop button
on private-chat drafts and persist the partial answer if pressed. both options default
to `false` and can be overridden per `replyStream` call. groups still use edit previews.

```ts
import { chatKey, run } from "@yaebal/runner";

// after installing ai({ model, streaming: { canStop: true, keepOnStop: true } })
const runner = run(bot, {
  sequentializeBy: (update) => update.stopped_message_generation ? undefined : chatKey(update),
});
process.once("SIGINT", () => void runner.stop());
```

install `@yaebal/runner` for polling with stop support. do not also call `bot.start()`.
sequential polling and same-chat sequentialization block the stop update behind the
running generation. webhook handlers must also dispatch stop updates concurrently.
include `stopped_message_generation` if you restrict `allowed_updates`; install `ai()`
before middleware that queues updates. stop routing is scoped by chat, topic and draft id.
keep concurrency capacity available so stop events can be handled while streams run.

`keepOnStop: false` discards the unfinished draft and does not append its text to memory;
`true` sends the partial text as a real message and remembers it. previously finalized
parts of a long answer remain in the chat. the result has `aborted: true` and
`stopped: true`. external `signal` cancellation sets only `aborted` and preserves the
partial answer. provider failures unrelated to cancellation still throw.

custom models must honor the shared request `signal` to cancel their underlying work.
the renderer stops waiting even if a custom provider ignores it, but cannot terminate
arbitrary work inside that provider. active draft registrations and abort listeners are
removed on completion, stop or error.
