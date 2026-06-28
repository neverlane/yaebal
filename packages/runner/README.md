# @yaebal/runner

concurrent update processing for yaebal bots. updates that share a chat id still run strictly in order; unrelated chats run in parallel up to `concurrency`.

## install

```sh
pnpm add @yaebal/runner
```

## usage

```ts
import { run } from "@yaebal/runner";

const handle = run(bot, {
  concurrency: 50,   // max parallel updates (default 50)
  limit: 100,        // getUpdates batch size (default 100)
  timeout: 30,       // long-poll timeout in seconds (default 30)
  onError: (err, update) => console.error(update?.update_id, err),
});

// graceful shutdown
process.once("SIGINT", () => handle.stop());
```

use `createScheduler` directly if you need the bounded-concurrency queue for other purposes:

```ts
import { createScheduler } from "@yaebal/runner";

const scheduler = createScheduler(10);
scheduler.submit(chatId, async () => { /* ... */ });

await scheduler.idle();
```
