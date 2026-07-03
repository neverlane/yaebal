# create-yaebal

scaffold a type-safe [yaebal](https://github.com/neverlane/yaebal) Telegram bot or plugin — a
beautiful terminal ui when your terminal supports it, plain prompts when it doesn't, and a one-shot
flags mode for ci.

```sh
pnpm create yaebal
# or: npm create yaebal@latest  ·  bun create yaebal  ·  deno run -A npm:create-yaebal
```

## the interactive ui

in a real terminal you get a centred, keyboard-driven wizard rendered with pure ansi — no react, no
solid, **no native dependencies**, just `node:readline` and escape codes. it walks six steps:
**name → runtime → package manager → template → plugins → review**.

| key       | does                                    |
|:----------|:----------------------------------------|
| `↑ / ↓`   | move within a list                      |
| `enter`   | confirm the step / create               |
| `space`   | toggle a plugin or a git/install switch |
| `a` / `n` | select all / none on the plugins step   |
| `←`       | back a step                             |
| `esc`     | back, or cancel on the first step       |

because it's pure ansi, the ui runs **everywhere out of the box** — node 20+, bun and deno, no flags,
no prebuilt binaries. no tty (piped, `CI`, dumb terminal, or `--no-tui`)? it falls back to plain
one-line prompts, and then to defaults — same output, only the way you answer changes.

## flags mode

pass an answer as a flag to skip that question; pass `--yes` to skip all of them.

```sh
pnpm create yaebal my-bot --runtime bun --template commands --plugins session,again,fmt
pnpm create yaebal my-bot --plugins all --yes --no-install
```

| flag                                       | does                                   |
|:-------------------------------------------|:---------------------------------------|
| `-r, --runtime <node\|bun\|deno>`          | target runtime (default: detected)     |
| `-m, --pm <npm\|pnpm\|yarn\|bun\|deno>`    | package manager (default: detected)    |
| `-t, --template <id>`                      | starter template or plugin package     |
| `-p, --plugins <a,b \| all \| none>`       | comma list of `@yaebal` plugins        |
| `--git` / `--no-git`                       | initialise a git repo (+ first commit) |
| `--install` / `--no-install`               | install dependencies after scaffolding |
| `--tui` / `--no-tui`                       | force the interactive ui on/off        |
| `-y, --yes`                                | accept defaults, no prompts            |
| `-h, --help` · `-v, --version`             |                                        |

## templates

a template pulls in the plugins it needs, adds the real imports + wiring, and (for `webhook` /
`runner`) swaps the bootstrap. everything it generates type-checks against the real `@yaebal/*` apis.

| template          | what you get                                                      |
|:------------------|:------------------------------------------------------------------|
| `minimal`         | just `/start` + a text echo                                       |
| `echo`            | echo text, photos and stickers back                               |
| `commands`        | `/start /help /ping` with a command menu                          |
| `buttons`         | inline keyboard + typed `callback_data` (keyboard, callback-data) |
| `conversation`    | await-style multi-step dialog (conversation)                      |
| `i18n`            | multi-language bot with a `/lang` toggle (i18n)                   |
| `session-counter` | per-chat counter on `ctx.session` (session)                       |
| `webhook`         | edge/serverless deploy via `serve()` (web)                        |
| `runner`          | concurrent long-polling via `run()` (runner)                      |
| `rich-message`    | `sendRichMessage` block builder + a streaming draft demo (rich)   |
| `broadcast`       | subscriber list + typed broadcast jobs (broadcast)                |
| `plugin`          | reusable plugin package with `src`, tests and examples            |

bracketed plugins are added & wired automatically, on top of anything you pick yourself.

## runtimes & plugins

- **runtimes** — `node` (the project standard, ts via type-stripping), `bun`, `deno`. the generated
  `package.json` scripts match your pick.
- **plugins** — every published `@yaebal/*` plugin is offered. the cleanly-wired ones (`session`,
  `again`, `throttle`, `ratelimiter`, `i18n`, `files`, `prompt`) drop straight into the bot chain;
  the rest are added to `package.json` with a commented import so the starter always type-checks.

## what you get

```text
my-bot/
  package.json        # scripts for your runtime, @yaebal deps
  tsconfig.json       # strict, esm, nodenext
  src/index.ts        # a working bot, wired with the plugins you picked
  .env.example        # BOT_TOKEN=
  .gitignore
  README.md
```

```sh
cd my-bot
pnpm install
# add your BOT_TOKEN to .env
pnpm dev
```

for `--template plugin`, the generated project is a publishable package instead:

```text
my-plugin/
  package.json          # esm exports, build/typecheck/test/example scripts
  tsconfig.json         # strict, declarations, nodenext
  src/index.ts          # installable yaebal plugin
  src/index.test.ts     # context-extension smoke test
  examples/basic.mjs    # bot using the built plugin
  .env.example
  .gitignore
  README.md
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
