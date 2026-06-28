# @yaebal/conversation

write multi-step dialogs as straight async functions — a coroutine approach where `cv.wait()` resolves with the next update for that chat.

## install

```sh
pnpm add @yaebal/conversation
```

## usage

```ts
import { conversation, createConversation } from "@yaebal/conversation";

const greet = createConversation("greet", async (cv, ctx) => {
  await ctx.send("what's your name?");
  
  const answer = await cv.wait();
  await answer.send(`hi ${answer.text}! nice to meet you.`);
});

const bot = new Bot(token).install(conversation([greet]));

bot.command("greet", (ctx) => ctx.conversation.enter("greet"));
```

while a conversation is active it owns the chat's updates — they don't reach other handlers. state is in-memory (lost on restart), similar to `@yaebal/scenes`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
