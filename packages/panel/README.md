# @yaebal/panel

An operator panel for [yaebal](https://github.com/neverlane/yaebal) bots: view
incoming private-chat messages and reply from the browser. Ships as a
self-contained `fetch` handler — mount it on any HTTP framework.

## install

```sh
pnpm add @yaebal/panel
```

## usage

```ts
import { Bot } from "@yaebal/core";
import { MemoryPanelStore, recorder, panelHandler } from "@yaebal/panel";

const bot = new Bot(token);
const store = new MemoryPanelStore();

bot.install(recorder(store)); // log incoming private messages
bot.start();

// serve the panel (auth via a required token)
const handler = panelHandler(bot.api, store, { token: process.env.PANEL_TOKEN! });
// handler: (Request) => Promise<Response> — open /?token=<PANEL_TOKEN>
```

Implement `PanelStore` (`record` / `chats` / `history`) to persist conversations
in Redis, Postgres, etc. instead of the in-memory default.
