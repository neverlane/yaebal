# @yaebal/again

auto-retry on 429 / flood-wait and transient 5xx errors.

## install

```sh
pnpm add @yaebal/again
```

## usage

```ts
import { autoRetry } from "@yaebal/again";

bot.install(autoRetry({ maxRetries: 5 }));
```

the direct api-hook form is still available:

```ts
autoRetry(bot.api, { maxRetries: 5 });
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
