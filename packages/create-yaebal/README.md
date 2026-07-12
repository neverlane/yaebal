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
solid, **no native dependencies**, just `node:readline` and escape codes. it walks seven steps:
**name → template → runtime → package manager → plugins → deploy → review** — picking the `plugin`
template skips runtime, plugins and deploy entirely, since none of them apply to a plugin package.

| key       | does                                    |
|:----------|:----------------------------------------|
| `↑ / ↓`   | move within a list                      |
| `enter`   | confirm the step / create               |
| `space`   | toggle a plugin or a git/install/ci switch |
| `a` / `n` | select all / none on the plugins step   |
| `←`       | back a step                             |
| `esc`     | back, or cancel on the first step       |

because it's pure ansi, the ui runs **everywhere out of the box** — node 20+, bun and deno, no flags,
no prebuilt binaries. no tty (piped, `CI`, dumb terminal, or `--no-tui`)? it falls back to plain
one-line prompts, and then to defaults — same output, only the way you answer changes. it also
resizes cleanly and always restores your terminal (cursor, raw mode, alternate screen), even if the
process is killed outright.

## flags mode

pass an answer as a flag to skip that question; pass `--yes` to skip all of them.

```sh
pnpm create yaebal my-bot --runtime bun --template commands --plugins session,again,fmt
pnpm create yaebal my-bot -t webhook -d cloudflare --ci --yes
pnpm create yaebal my-bot --plugins all --yes --no-install
```

| flag                                       | does                                       |
|:-------------------------------------------|:--------------------------------------------|
| `-r, --runtime <node\|bun\|deno>`          | target runtime (default: detected)          |
| `-m, --pm <npm\|pnpm\|yarn\|bun\|deno>`    | package manager (default: detected)         |
| `-t, --template <id>`                      | starter template or plugin package          |
| `-p, --plugins <a,b \| all \| none>`       | comma list of `@yaebal` plugins             |
| `-d, --deploy <target>`                    | none · docker · compose · fly · railway · cloudflare · vercel |
| `--ci` / `--no-ci`                         | add a github actions ci workflow            |
| `--git` / `--no-git`                       | initialise a git repo (+ first commit)      |
| `--install` / `--no-install`               | install dependencies after scaffolding      |
| `--tui` / `--no-tui`                       | force the interactive ui on/off             |
| `-c, --config <path>`                      | read defaults from a config file            |
| `--no-config`                              | skip config-file autodetect                 |
| `-y, --yes`                                | accept defaults, no prompts                 |
| `--json`                                   | print the result as json (pairs with `--yes`) |
| `-h, --help` · `-v, --version`             |                                              |

a flag given a missing or invalid value (`--runtime` with no value, `--runtime rust`) is reported as
a warning and otherwise ignored — it never silently eats the next flag on the command line.

## config file

drop a `create-yaebal.json` next to where you run the command (or add a `"create-yaebal"` key to a
local `package.json`) to pre-fill any answer — handy for a team template or a generator script.
cli flags always win over the file; the file only fills in what a flag left unset.

```json
{
	"runtime": "bun",
	"template": "commands",
	"plugins": ["session", "again", "fmt"],
	"deploy": "cloudflare",
	"ci": true
}
```

```sh
pnpm create yaebal my-bot                 # reads create-yaebal.json automatically
pnpm create yaebal my-bot --config ci.json
pnpm create yaebal my-bot --no-config     # ignore any file, flags/prompts only
```

## templates

a template pulls in the plugins it needs, adds the real imports + wiring, and (for `webhook` /
`runner`) swaps the bootstrap. everything it generates type-checks against the real `@yaebal/*`
apis — enforced by a compile smoke test that renders every template, every deploy target and the
full plugin catalog, and type-checks the output against the workspace packages.

| template          | what you get                                                           |
|:------------------|:-----------------------------------------------------------------------|
| `minimal`         | just `/start` + a text echo                                            |
| `echo`            | echo text, photos and stickers back                                    |
| `commands`        | `/start /help /ping` via a typed registry + synced `/` menu (commands) |
| `buttons`         | inline keyboard + typed `callback_data` (keyboard, callback-data)      |
| `conversation`    | await-style multi-step dialog (conversation)                           |
| `i18n`            | multi-language bot with a `/lang` toggle (i18n)                        |
| `session-counter` | per-chat counter on `ctx.session` (session)                            |
| `webhook`         | edge/serverless deploy via `serve()` (web)                             |
| `runner`          | concurrent long-polling via `run()` (runner)                           |
| `rich-message`    | `sendRichMessage` block builder + a streaming draft demo (rich)        |
| `broadcast`       | subscriber list + typed broadcast jobs (broadcast)                     |
| `toml`            | declarative routes in `bot.toml` + a handler registry (toml)           |
| `plugin`          | reusable plugin package with `src`, tests and examples                 |

bracketed plugins are added & wired automatically, on top of anything you pick yourself.

## deploy targets

orthogonal to the template — pick one with `-d/--deploy` or on the wizard's **deploy** step (not
offered for `--template plugin`, which has nowhere to deploy).

| target       | adds                                                                    |
|:-------------|:-------------------------------------------------------------------------|
| `none`       | nothing — deploy however you like                                        |
| `docker`     | a single-stage `Dockerfile` (matches your runtime) + `.dockerignore`      |
| `compose`    | `docker` + `compose.yaml` for a local/vps run                            |
| `fly`        | `docker` + `fly.toml` — `fly launch` and go                               |
| `railway`    | `docker` + `railway.json` — connect the repo and deploy                  |
| `cloudflare` | `wrangler.jsonc` — owns the bootstrap (`export default { fetch: cloudflareAdapter(bot) } }`), no server to run |
| `vercel`     | `vercel.json` + `api/bot.ts` — a vercel edge function via `webhook()`, alongside the normal polling `src/index.ts` |

`docker`/`compose`/`fly`/`railway` run the same long-polling bot you'd run locally, just
containerized. `cloudflare` and `vercel` are serverless: they take over the bootstrap (the same way
the `webhook`/`runner` templates already replace `bot.start()`) and add `@yaebal/web` + a
`SECRET_TOKEN` to `.env.example`. pass `--ci` (independent of deploy) for a github actions workflow
that installs and typechecks on every push — plugin packages get one too, plus `test`/`build`.

## runtimes & plugins

- **runtimes** — `node` (the project standard, ts via type-stripping), `bun`, `deno`. the generated
  `package.json` scripts match your pick.
- **plugins** — every published, bot-installable `@yaebal/*` plugin is offered (enforced by a test
  that diffs the catalog against `packages/*`). the cleanly-wired ones (`session`, `again`,
  `throttle`, `ratelimiter`, `auto-answer`, `i18n`, `files`, `prompt`, `split`, …) drop straight into
  the bot chain; the rest are added to `package.json` with a commented import so the starter always
  type-checks. `analytics` and `feature-flags` also leave a commented-out showcase of their other
  real adapters (posthog/plausible/sqlite/clickhouse/http; launchdarkly/growthbook) right next to
  the wired default, so you know they exist without pulling their peer deps in.

## what you get

```text
my-bot/
  package.json        # scripts for your runtime, @yaebal deps
  tsconfig.json       # strict, esm, nodenext
  src/index.ts        # a working bot, wired with the plugins you picked
  .env.example        # BOT_TOKEN= (+ SECRET_TOKEN= for a serverless deploy target)
  .gitignore
  README.md
  # + whatever your deploy target and --ci add (Dockerfile, wrangler.jsonc, api/bot.ts, …)
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

package names can be scoped (`@your-org/my-plugin`) — the folder created is the unscoped part.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
