# @yaebal/throttle

space out outgoing API calls. defaults to 34 ms between calls (~30/sec, telegram's global cap).

## install

```sh
pnpm add @yaebal/throttle
```

## usage

```ts
import { throttle } from "@yaebal/throttle";

bot.install(throttle({ minIntervalMs: 100 }));
```

the direct api-hook form is still available:

```ts
throttle(bot.api, { minIntervalMs: 100 });
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
