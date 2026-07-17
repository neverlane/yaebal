# @yaebal/example-ai-chat (a runnable bot)

a focused bot that shows `@yaebal/ai` end to end: llm answers streamed into the chat
(telegram's native draft animation in private chats, throttled edits with a `▍` cursor in
groups), per-user-per-chat conversation memory, automatic splitting past 4096 chars, and a
polite `AiLimitError` reply when a user burns the hourly budget.

## running

```sh
cp examples/ai-chat/.env.example examples/ai-chat/.env   # then add your token + a model
pnpm --filter @yaebal/example-ai-chat dev                # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-ai-chat dev`
- run once: `pnpm --filter @yaebal/example-ai-chat start`

both load `examples/ai-chat/.env`. besides telegram this example needs an llm: the defaults
target a local [ollama](https://ollama.com) (`ollama pull llama3.2`), and any
openai-compatible api (openai, openrouter, groq, mistral, deepseek, …) works by flipping the
three `AI_*` variables.

## environment variables

| name          | example                       | description                                                                              |
|:--------------|:------------------------------|:------------------------------------------------------------------------------------------|
| `BOT_TOKEN`   | `123456:AA-bc...`             | bot token from [@BotFather](https://t.me/BotFather). required - the bot exits without it. |
| `AI_MODEL`    | `llama3.2`                    | model name as the provider knows it. defaults to `llama3.2`.                              |
| `AI_BASE_URL` | `http://localhost:11434/v1`   | openai-compatible api root. defaults to a local ollama.                                   |
| `AI_API_KEY`  | `sk-...`                      | provider api key. optional - local ollama needs none.                                     |

## commands the example bot answers

| command / input | what it shows                                                                         |
|:----------------|:---------------------------------------------------------------------------------------|
| `/start`        | explains the demo                                                                     |
| any text        | `ctx.ai.replyStream()` — "Thinking…" draft + animated preview in private, `▍`-cursor edits in a group |
| a long question | the answer splits into multiple messages mid-stream (`@yaebal/split` under the hood)  |
| 21st message in an hour | the `AiLimitError` catch answers with the retry time instead of calling the model |
| `/reset`        | `ctx.ai.reset()` — wipes this conversation's memory window                            |

memory is on by default (per user per chat, window 32) — ask "what did i just say?" to see
it working, then `/reset` and ask again. add the bot to a group to compare edit-streaming
with the private-chat draft animation.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
