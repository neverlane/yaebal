# @yaebal/example-feature-flags (a runnable bot)

a focused bot that shows `@yaebal/feature-flags` end to end: a percentage rollout, a kill-switch
rule, telegram-native chat-type targeting, a multivariate (A/B/n) checkout flag, per-bucket and
global overrides (the latter with a ttl), an `envProvider()` you can flip from the shell, an
isolated `whenFlag` branch, and the `flagsAdmin` ops command surface.

## running

```sh
cp examples/feature-flags/.env.example examples/feature-flags/.env   # then add your token
pnpm --filter @yaebal/example-feature-flags dev                      # reloads on change
```

- dev with reload: `pnpm --filter @yaebal/example-feature-flags dev`
- run once: `pnpm --filter @yaebal/example-feature-flags start`
- flip `new-ui` from the shell without touching the code: `FLAG_NEW_UI=true pnpm --filter @yaebal/example-feature-flags dev`

## environment variables

| name        | example           | description                                                                                    |
|:------------|:------------------|:------------------------------------------------------------------------------------------------|
| `BOT_TOKEN` | `123456:AA-bc...` | bot token from [@BotFather](https://t.me/BotFather). required — the bot exits without it.        |
| `ADMIN_ID`  | `123456789`       | your telegram user id. optional — gates `/flags`; unset means everyone can use it (fine for this demo). |

## commands the example bot answers

| command     | what it shows                                                                          |
|:------------|:-----------------------------------------------------------------------------------------|
| `/start`    | lists the demo commands                                                                |
| `/feature`  | whether `new-ui` is on for you — a 25% rollout, deterministic by your user id           |
| `/enable`   | `setOverride("new-ui", true)` — forces it on for you only, wins over the rollout        |
| `/beta`     | only answers while `new-ui` is on for you — an isolated `whenFlag` branch               |
| `/checkout` | which variant of a three-way multivariate flag you're bucketed into                    |
| `/promote`  | `setGlobalOverride("checkout", "v2", { ttl })` — forces everyone onto `v2` for an hour  |
| `/announce` | only answers truthfully in a group/supergroup — `chatTypes` targeting                  |
| `/flags`    | `flagsAdmin`'s ops surface: lists every flag; `/flags set <key> <value>`, `/flags clear <key>` |

the terminal logs every evaluation via `onEvaluate` — `[flags] new-ui -> false (rule)` — so you can
watch the resolution order (**override → global override → provider → local rules → default**)
play out as you try the commands above. `legacy-mode` is on for everyone except a hardcoded
kill-switched user id (`666`) — a reminder that a rule can turn a flag *off* even when its default
is `true`.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
