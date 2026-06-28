# @yaebal/test

testing utilities for yaebal bots: a fake `Api` that records every call, update factories, and helpers to run middleware in isolation.

## install

```sh
pnpm add -D @yaebal/test
```

## usage

```ts
import { callbackUpdate, createContext, messageUpdate, mockApi, runMiddleware } from "@yaebal/test";
import { expect, test } from "vitest";

test("replies to /start", async () => {
  const { api, calls } = mockApi();
  const update = messageUpdate({ text: "/start", chatId: 42 });
  const ctx = createContext(update, api);

  await runMiddleware(bot, ctx);

  expect(calls[0]?.method).toBe("sendMessage");
});

test("callback query", async () => {
  const { api, calls } = mockApi();
  const update = callbackUpdate({ data: "vote:up", chatId: 1 });
  const ctx = createContext(update, api);

  await runMiddleware(bot, ctx);

  expect(calls[0]?.method).toBe("answerCallbackQuery");
});
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
