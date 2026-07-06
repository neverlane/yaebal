# telegram-bot-api image

self-hosted [telegram bot api server](https://github.com/tdlib/telegram-bot-api), built from
source in this repo.

```text
ghcr.io/neverlane/telegram-bot-api:latest   # github container registry
neverlane/telegram-bot-api:latest           # docker hub
```

- alpine, multi-arch (`linux/amd64`, `linux/arm64`), non-root, tini as pid 1, built-in healthcheck.
- tags: `latest` and `sha-<12>` (first 12 chars of the upstream tdlib/telegram-bot-api commit) —
  pin `sha-*` in production.
- `.github/workflows/bot-api-image.yml` builds and pushes; `bot-api-upstream-watch.yml` checks
  upstream daily and triggers a rebuild when tdlib/telegram-bot-api moves (the check is "does the
  `sha-<12>` tag for upstream master already exist").

## usage

```sh
docker compose -f docker/telegram-bot-api/compose.yml up -d
```

[see the docs page for the full guide](https://yaebal.mom/docs/production/local-bot-api/)

## environment

| variable | default | maps to |
| --- | --- | --- |
| `TELEGRAM_API_ID` | required | read by the server itself ([my.telegram.org](https://my.telegram.org)) |
| `TELEGRAM_API_HASH` | required | read by the server itself |
| `TELEGRAM_API_ID_FILE` / `TELEGRAM_API_HASH_FILE` | — | read the value from a file (docker/k8s secrets) |
| `TELEGRAM_LOCAL` | off | `--local` |
| `TELEGRAM_HTTP_PORT` | `8081` | `--http-port` |
| `TELEGRAM_STAT_PORT` | `8082` | `--http-stat-port` (always on; used by the healthcheck) |
| `TELEGRAM_WORK_DIR` | `/var/lib/telegram-bot-api` | `--dir` |
| `TELEGRAM_TEMP_DIR` | `/tmp/telegram-bot-api` | `--temp-dir` |
| `TELEGRAM_MAX_WEBHOOK_CONNECTIONS` | server default | `--max-webhook-connections` |
| `TELEGRAM_VERBOSITY` | server default | `--verbosity` |

any extra container args are passed straight to the `telegram-bot-api` binary:

```sh
docker run ghcr.io/neverlane/telegram-bot-api --proxy=http://proxy:3128
```

## publishing setup (one-time)

- ghcr works out of the box via `GITHUB_TOKEN`; after the first push, set the package
  visibility to public (github → packages → telegram-bot-api → settings).
- docker hub push activates when the `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` repo secrets
  exist; without them the workflow pushes to ghcr only.

## local build

```sh
docker build docker/telegram-bot-api -t telegram-bot-api:dev
# pin an upstream ref:
docker build docker/telegram-bot-api -t telegram-bot-api:dev --build-arg TELEGRAM_BOT_API_REF=<sha>
```

expect a long first build — the server compiles tdlib from source (~15 min on a laptop).

---

part of [**yaebal**](https://github.com/neverlane/yaebal) - a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
