# telegram bot api server — built from tdlib/telegram-bot-api source.
# published as ghcr.io/neverlane/telegram-bot-api and neverlane/telegram-bot-api (docker hub)
# by .github/workflows/bot-api-image.yml; rebuilt automatically when upstream moves.
#
# build args:
#   TELEGRAM_BOT_API_REF — tdlib/telegram-bot-api git ref to build (ci always passes a full sha)
#   ALPINE_VERSION       — base image pin

ARG ALPINE_VERSION=3.22

FROM alpine:${ALPINE_VERSION} AS build

RUN apk add --no-cache alpine-sdk linux-headers git cmake gperf openssl-dev zlib-dev

ARG TELEGRAM_BOT_API_REF=master
RUN git clone https://github.com/tdlib/telegram-bot-api.git /src \
	&& cd /src \
	&& git checkout "${TELEGRAM_BOT_API_REF}" \
	&& git submodule update --init --recursive

WORKDIR /src/build
RUN cmake -DCMAKE_BUILD_TYPE=Release .. \
	&& cmake --build . --target telegram-bot-api -j"$(nproc)" \
	&& strip telegram-bot-api

FROM alpine:${ALPINE_VERSION}

RUN apk add --no-cache libstdc++ openssl zlib tini \
	&& addgroup -g 101 -S telegram-bot-api \
	&& adduser -u 101 -S -G telegram-bot-api -H -h /var/lib/telegram-bot-api telegram-bot-api \
	&& mkdir -p /var/lib/telegram-bot-api \
	&& chown telegram-bot-api:telegram-bot-api /var/lib/telegram-bot-api

COPY --from=build /src/build/telegram-bot-api /usr/local/bin/telegram-bot-api
COPY entrypoint.sh /entrypoint.sh

ARG TELEGRAM_BOT_API_REF=master
LABEL org.opencontainers.image.title="telegram-bot-api" \
	org.opencontainers.image.description="telegram bot api server, built from tdlib/telegram-bot-api" \
	org.opencontainers.image.source="https://github.com/neverlane/yaebal" \
	org.opencontainers.image.licenses="BSL-1.0" \
	mom.yaebal.bot-api.revision="${TELEGRAM_BOT_API_REF}"

USER telegram-bot-api
EXPOSE 8081 8082

# the entrypoint always enables the stats port, so a plain http probe doubles as liveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
	CMD wget -qO- "http://127.0.0.1:${TELEGRAM_STAT_PORT:-8082}/" > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
