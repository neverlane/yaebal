# create-yaebal

Scaffold a new YAEBAL bot project interactively or from flags — generates `package.json`, `tsconfig.json`, `src/index.ts`, `.env.example`, and `.gitignore`.

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

Supported runtimes: `node` (default), `bun`, `deno`.

Supported plugins: `session` (`@yaebal/session`), `ratelimiter` (`@yaebal/ratelimiter`), `again` (`@yaebal/again`).

After scaffolding:

```sh
cd my-bot
pnpm install
cp .env.example .env   # add your BOT_TOKEN
pnpm dev
```
