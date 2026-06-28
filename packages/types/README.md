# @yaebal/types

@yaebal/types — the full Telegram Bot API surface, code-generated from the
official machine-readable schema. use it to type `api.call` params/results:

```ts
import type { SendMessageParams, Message } from "@yaebal/types";

await bot.api.call<Message>("sendMessage", params satisfies SendMessageParams);
```

## install

```sh
pnpm add @yaebal/types
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
