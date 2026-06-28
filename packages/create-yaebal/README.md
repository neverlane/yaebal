# create-yaebal

scaffold a new yaebal bot project interactively or from flags — generates `package.json`, `tsconfig.json`, `src/index.ts`, `.env.example`, and `.gitignore`.

## install

```sh
pnpm create yaebal
```

## usage

```sh
# interactive
pnpm create yaebal

# non-interactive
pnpm create yaebal my-bot --runtime bun --plugins session,again
```

supported runtimes: `node` (default), `bun`, `deno`.
supported plugins: `session` (`@yaebal/session`), `ratelimiter` (`@yaebal/ratelimiter`), `again` (`@yaebal/again`).

after scaffolding:

```sh
cd my-bot
pnpm install
cp .env.example .env # add your BOT_TOKEN
pnpm dev
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
