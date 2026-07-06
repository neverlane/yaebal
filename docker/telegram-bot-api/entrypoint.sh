#!/bin/sh
# maps env vars to telegram-bot-api flags. extra args are passed through:
#   docker run ghcr.io/neverlane/telegram-bot-api --proxy=http://...
set -eu

# TELEGRAM_API_ID / TELEGRAM_API_HASH can come from files (docker/k8s secrets)
# via the _FILE suffix convention.
file_env() {
	var="$1"
	eval val="\${${var}:-}"
	eval file="\${${var}_FILE:-}"

	if [ -n "$val" ] && [ -n "$file" ]; then
		echo "error: ${var} and ${var}_FILE are both set" >&2
		exit 1
	fi

	if [ -n "$file" ]; then
		val="$(cat "$file")"
		export "${var}=${val}"
	fi
}

file_env TELEGRAM_API_ID
file_env TELEGRAM_API_HASH

# the server reads TELEGRAM_API_ID / TELEGRAM_API_HASH from the environment itself —
# fail fast here so the message names where to get them instead of a generic usage dump.
: "${TELEGRAM_API_ID:?TELEGRAM_API_ID is required — create an application at https://my.telegram.org}"
: "${TELEGRAM_API_HASH:?TELEGRAM_API_HASH is required — create an application at https://my.telegram.org}"

set -- \
	--http-port="${TELEGRAM_HTTP_PORT:-8081}" \
	--http-stat-port="${TELEGRAM_STAT_PORT:-8082}" \
	--dir="${TELEGRAM_WORK_DIR:-/var/lib/telegram-bot-api}" \
	--temp-dir="${TELEGRAM_TEMP_DIR:-/tmp/telegram-bot-api}" \
	"$@"

mkdir -p "${TELEGRAM_TEMP_DIR:-/tmp/telegram-bot-api}"

if [ -n "${TELEGRAM_LOCAL:-}" ]; then
	set -- "$@" --local
fi

if [ -n "${TELEGRAM_MAX_WEBHOOK_CONNECTIONS:-}" ]; then
	set -- "$@" --max-webhook-connections="${TELEGRAM_MAX_WEBHOOK_CONNECTIONS}"
fi

if [ -n "${TELEGRAM_VERBOSITY:-}" ]; then
	set -- "$@" --verbosity="${TELEGRAM_VERBOSITY}"
fi

exec telegram-bot-api "$@"
