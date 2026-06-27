# puregram vs grammY vs GramIO — разбор для будущей «рофлолибы»

> Цель отчёта: понять, как устроена каждая из трёх библиотек, что у кого хорошо, и что стоит **заимствовать** при проектировании собственного фреймворка для Telegram Bot API на TypeScript.
>
> Дата: 22 июня 2026. Версии и метрики актуальны на эту дату (см. раздел «Факты и цифры»).

---

## TL;DR

| | **grammY** | **puregram** | **GramIO** |
|---|---|---|---|
| Что это по сути | Зрелый **фреймворк** | Современный **SDK / клиент** | Новый **type-safe фреймворк** |
| Версия | `1.43.0` | `3.6.0` | `0.9.0` |
| Загрузки/мес (npm) | ~15,4 млн | ~3,6 тыс | ~11,3 тыс |
| Автор | KnorpelSenf | starkow (j++ team) | kravetsone |
| Лицензия | MIT | MPL-2.0 | MIT |
| Ядро абстракции | `Composer` + middleware + filter queries | `Telegram` + классы-контексты + hooks | chainable `Composer` с накоплением типов |
| Главная фишка | Огромная экосистема + filter queries | Тонкий честный SDK + перехват запросов | Типы текут сквозь весь chain + кодоген |
| Кого брать как референс | Экосистема, фильтрация апдейтов, runtime-agnostic билд | Контексты-классы, hooks на запросы, decoupled codegen | DX, `.derive/.decorate/.extend`, авто-типы, `format` |

Коротко: **grammY** — за зрелость и экосистему, **GramIO** — за современный type-safe дизайн и DX, **puregram** — за минималистичный SDK-подход и красивую работу с контекстами/хуками. Для рофлолибы есть смысл взять каркас в стиле GramIO, систему фильтрации апдейтов из grammY и идею decoupled-codegen + контексты-классы из puregram.

---

## 1. grammY

### Что это
Самый популярный и зрелый TS-фреймворк для Telegram-ботов (наследник идей Telegraf, но переосмысленный). Цель — «легко и для новичка, и на масштабе». Работает на Node.js, Deno и в браузере/Cloudflare Workers (через web-бандл `grammy/web`).

### Архитектура и API-дизайн
- **`Bot extends Composer`.** Всё строится вокруг класса `Composer` — конвейера middleware в стиле Koa (`(ctx, next) => ...`). `Bot`, `Composer`, роутеры — всё это композеры, которые можно вкладывать друг в друга.
- **Единый объект `Context`.** В отличие от puregram, нет дерева классов на каждый тип апдейта — один `Context`, который расширяется не классами, а **flavors** (чисто типовые миксины: `Context & SessionFlavor<S>`, `HydrateFlavor`, и т.д.). Расширение поведения — через middleware и **transformers** на уровне `bot.api`.
- **Filter queries — главная киллер-фича.** Мини-язык запросов к апдейтам прямо в `.on()`:
  ```ts
  bot.on("message:text", ...)
  bot.on("message:entities:url", ...)
  bot.on("callback_query:data", ...)
  bot.on(":photo", ...)            // любое сообщение/пост с фото
  bot.on("message").filter(predicate, ...)
  ```
  Это типобезопасно: после `message:text` в хендлере `ctx.msg.text` уже `string`. Ни puregram, ни GramIO не дают такой выразительной фильтрации из коробки.
- **Transformer API.** Перехват и модификация любых вызовов Bot API на уровне `bot.api.config.use(transformer)` — на этом построены `auto-retry`, `throttler`, `hydrate` и пр.
- **Runtime-agnostic билд.** Исходники пишутся под Deno и компилируются в Node через `deno2node` — отсюда чистая мульти-рантайм поддержка и web-бандл.

### Экосистема и плагины
Самая богатая из трёх. Официальные плагины (`@grammyjs/*`):
- **conversations** — пошаговые диалоги как обычный async-код (без явных сцен-машин), очень мощно;
- **menu** — интерактивные inline-меню с навигацией;
- **runner** — конкурентная обработка апдейтов с backpressure (для высоконагруженных ботов);
- **hydrate** — методы прямо на объектах (`ctx.msg.editText(...)`);
- **auto-retry, transformer-throttler, ratelimiter** — устойчивость и лимиты;
- **i18n / fluent**, **emoji**, **parse-mode**, **router**, **stateless-question**, **chat-members**, **files**;
- **storage-адаптеры** для сессий (Redis, Mongo, Postgres, Deno KV, файлы, free-хранилища).

Плюс: документация (grammy.dev) считается эталонной по полноте, есть большое комьюнити и шаблоны проектов.

### Производительность
- `runner` даёт sequential-by-chat конкуренцию + backpressure — для тысяч апдейтов в секунду.
- Зависимости минимальны (`node-fetch`, `debug`, `abort-controller`), unpacked ~1,3 МБ.
- Веб-бандл позволяет гонять на edge (CF Workers) с минимальным холодным стартом.

### DX и типобезопасность
- Очень сильная фильтрация + сужение типов через filter queries.
- Flavors хорошо комбинируются, но при многих плагинах тип `Context` обрастает пересечениями вручную (`type MyContext = Context & A & B & C`), что чуть менее эргономично, чем chain-накопление GramIO.
- Документация и сообщество — лучший «онбординг» на рынке.

**Резюме grammY:** эталон зрелости. Берём как референс по **фильтрации апдейтов, transformer-слою API, экосистеме и runtime-agnostic сборке**.

---

## 2. puregram

### Что это
«Powerful and modern Telegram bot API SDK for Node.js and TypeScript». По духу — не громоздкий фреймворк, а **аккуратный SDK/клиент** с приятными контекстами. Авторский стиль нарочито неформальный (lowercase README, мемы), автор — starkow, под крылом j++ team. Вдохновлён `vk-io` от negezor — это видно в архитектуре контекстов.

### Архитектура и API-дизайн
- **`Telegram` instance.** Точка входа: `Telegram.fromToken(token)` или `new Telegram({ token })`. Апдейты — через `telegram.updates.on('message', ...)`, поллинг `telegram.updates.startPolling()` или webhook-middleware.
- **Контексты как иерархия классов.** Ключевое отличие от grammY: на каждый тип апдейта — свой класс (`MessageContext`, `CallbackQueryContext`, `ForumTopicCreatedContext`, …), нагруженный геттерами и шорткатами. Сужение типов — через **type guards**:
  ```ts
  if (context.is('callback_query')) { /* context: CallbackQueryContext */ }
  if (context.hasText()) { /* context.text: string */ }
  ```
  Сознательно переведено: все методы-предикаты `is*/has*/can*` — именно методы (type guards), а не геттеры.
- **Три способа звать API:** `telegram.api.call('getMe')` (сырой, работает даже до обновления типов под новую Bot API), `telegram.api.getMe()` (типизированный), и шорткаты на контексте (`context.send(...)`).
- **Hooks — перехватчики запросов.** Пять стадий (`onBeforeRequest`, `onRequestIntercept`, `onResponseIntercept`, `onAfterRequest`, `onError`), можно менять параметры, подмешивать `parse_mode`, отменять запрос через `AbortController`. Хуки экспортируются пачкой через `telegram.useHooks(...)` — удобно паковать в сторонние пакеты.
- **Middlewares** в стиле `(context, next)` — для расширения контекста и измерений.
- **Медиа-абстракции.** `MediaSource` (path/stream/buffer/url/fileId) и `MediaSourceTo` для скачивания, `InputMedia` для media-group/editMessageMedia — чистый, продуманный слой работы с файлами.
- **Decoupled codegen.** Типы и методы Bot API вынесены в отдельный пакет `@puregram/api` (зависимость `~10.1.4`), импортируются из `puregram/generated`, `puregram/methods`, `puregram/telegram-interfaces`. Само ядро отделено от сгенерированных типов.

### Экосистема и плагины
Скромнее, но покрывает базу. Официальные `@puregram/*`:
- **hear** — реакция на текст/caption по условиям;
- **scenes** — middleware-сцены (пошаговые сценарии);
- **session** — сессии;
- **prompt** — ожидание следующего сообщения;
- **callback-data** — валидация/сериализация callback data;
- **markup** — система разметки;
- **media-cacher** — кэш `file_id`;
- **utils** — утилиты (валидация WebApp, конвертация крипто-значений).
- Неофициально: `nestjs-puregram` для NestJS.

Важный нюанс порядка middleware: `session()` нужно подключать **до** `hear`/`scenes`, иначе `Cannot read property '__scene' of undefined`.

### Производительность
- Тонкий слой над `fetch`/`undici`, без тяжёлого рантайма — оверхед минимальный.
- ESM-only, `node >= 22` — современная база, но отсекает старые окружения.
- Заявленной мульти-рантайм истории (Bun/Deno как у GramIO) в README нет — фокус на Node.js.

### DX и типобезопасность
- Очень приятная работа с контекстами и type guards — код читается.
- Авторский неформальный стиль документации: весело, но местами менее «корпоративно-предсказуемо», чем у grammY/GramIO.
- Меньше комьюнити и загрузок → меньше готовых рецептов на StackOverflow/в чатах.

**Резюме puregram:** красивый минималистичный SDK. Берём как референс по **контекстам-классам + type guards, хукам на запросы, медиа-абстракциям (`MediaSource`/`InputMedia`) и decoupled-codegen API-пакету**.

---

## 3. GramIO

### Что это
Самый молодой и самый «современно спроектированный» из трёх. Девиз — «Powerful, extensible and really type-safe». Работает на Node.js, Bun и Deno без изменений конфигурации. Автор — kravetsone. Версия пока `0.9.0` (т.е. до 1.0), но API уже богатый и продуманный.

### Архитектура и API-дизайн
- **`Bot extends Composer`, и типы текут сквозь весь chain.** Каждый метод обогащает контекст и **возвращает обновлённый тип** — поэтому цепочка всегда полностью типизирована без ручных аннотаций:
  ```ts
  const bot = new Bot(token)
    .derive("message", async (ctx) => ({ user: await db.getUser(ctx.from!.id) }))
    .on("message", (ctx) => ctx.send(`Hi, ${ctx.user.name}!`)); // ctx.user типизирован
  ```
- **Палитра методов Composer** — это, по сути, ядро дизайна:
  | Метод | Что делает |
  |---|---|
  | `use(ctx, next)` | сырое middleware |
  | `derive(fn)` | async-обогащение контекста на каждый запрос |
  | `decorate(obj)` | статическое обогащение на старте (нулевой per-request оверхед) |
  | `guard(fn)` | продолжить только если предикат `true` |
  | `on(event, fn)` | хендлер на тип апдейта |
  | `extend(composer)` | вмёржить другой композер **вместе с его типами** |
- **`Composer` как самостоятельный класс.** Продакшн-паттерн: один раз собрать композер с плагинами, потом `.extend()` его в каждом feature-файле — фичи становятся обычными `Composer` без импорта `Bot` и токена, полностью тестируемыми, и при этом видят типы плагинов (`ctx.scene`, `ctx.session`).
- **Плагины через `.extend()` + система хуков.** Плагины добавляют свойства контекста, регистрируют хендлеры и встраиваются в жизненный цикл (`onStart`, `onStop`, `preRequest`, `onResponse`, `onResponseError`) — всё типизированно. Есть lazy-load плагины.
- **`format` вместо `parse_mode`.** Форматирование — через tagged template literals, которые сами строят корректные `MessageEntity`:
  ```ts
  ctx.send(format`${bold`Welcome!`} — ${italic("type-safe")} ${link("GramIO","https://gramio.dev")}`)
  ```
  Никаких ручных экранирований MarkdownV2 — большой плюс по надёжности.
- **Кодоген + авто-публикация типов.** Типы Bot API генерируются и **публикуются на каждый релиз Bot API** (пакет `@gramio/types`) — не ждёшь мейнтейнера. Часть фреймворка тоже кодогенерится.
- **Keyboards** — fluent chainable API (`new InlineKeyboard().text(...).url(...).row()...`).
- **Storages** — абстракция хранилищ, общая для session/scenes и т.п.

### Экосистема и плагины
Неожиданно богатая для версии 0.9. Официальные плагины:
**Scenes, Onboarding, I18n (на Fluent), Session, Autoload, Auto-retry, Auto-answer-callback-query, Media-cache, Media-group, Rate-limiter, Prompt, Views (JSX-рендер сообщений), Split, Pagination, JSX, PostHog, OpenTelemetry, Sentry.**

Отдельно сильный пункт — **DX-тулинг**:
- `npm create gramio@latest ./bot` — скаффолдер, который сам ставит ORM (Prisma/Drizzle), линтер (Biome/ESLint), Docker + docker-compose, Husky, набор официальных плагинов, hot-reload.
- Экосистема вокруг: `Wrappergram`, `Crypto Pay API`, `@gramio/schema-parser`, `Jobify` (обёртка над BullMQ).
- Гайды миграции с grammY, puregram, Telegraf, node-telegram-bot-api.

### Производительность
- `decorate()` для статики = нулевой per-request оверхед (важная архитектурная деталь — разделение «дорогих» derive и «дешёвых» decorate).
- Мульти-рантайм (Node/Bun/Deno) без изменений кода → можно гнать на Bun ради скорости.
- 100% TypeScript, MIT.

### DX и типобезопасность
- Самый сильный «type-flow»: типы плагинов автоматически доезжают до хендлеров без `Context & A & B`.
- Лучший онбординг по скорости старта (скаффолдер за минуту).
- Минусы зрелости: версия `0.9.0` (возможны breaking changes), сообщество и число загрузок пока скромные, меньше боевых кейсов на масштабе, чем у grammY.

**Резюме GramIO:** самый современный дизайн. Берём как главный референс по **архитектуре каркаса (chainable Composer с накоплением типов, derive/decorate/guard/extend), авто-генерации и авто-публикации типов, `format`-через-entities и DX-скаффолдингу**.

---

## 4. Сравнение по четырём осям

### Архитектура и API-дизайн
- **Модель контекста:** grammY — единый `Context` + типовые flavors; puregram — иерархия классов-контекстов + type guards; GramIO — единый контекст, обогащаемый chain-методами с накоплением типов.
- **Композиция:** у grammY и GramIO `Bot extends Composer`; у puregram — `Telegram` + `updates` + middleware (менее «фреймворковая» модель).
- **Перехват API-вызовов:** grammY — transformers; puregram — hooks (5 стадий); GramIO — lifecycle-хуки (`preRequest`/`onResponse...`).
- **Фильтрация апдейтов:** grammY вне конкуренции (filter queries `message:text` и т.п.); у puregram/GramIO — обычный `on(type)` + guard/predicate.

### Экосистема и плагины
grammY ≫ GramIO > puregram по охвату. У grammY уникальны `conversations`, `menu`, `runner`. GramIO удивляет зрелостью набора (JSX-views, OpenTelemetry, Sentry, PostHog, pagination) и тулингом (скаффолдер, ORM, Jobify). puregram покрывает базу (hear/scenes/session/prompt/callback-data/markup/media-cacher), но экосистема компактнее.

### Производительность
Все три — тонкий слой над fetch/undici, оверхед фреймворка не является узким местом (узкое место — сеть и Telegram API). Различает:
- grammY `runner` — конкурентная обработка с backpressure (готовое решение под нагрузку);
- GramIO — мульти-рантайм (Bun) + `decorate` с нулевым per-request оверхедом;
- puregram — самый «тонкий» SDK, но без штатного high-load раннера и без заявленного Bun/Deno.

### DX и типобезопасность
- **Type-flow:** GramIO (chain-накопление) ≥ grammY (filter-query сужение, но ручные flavors) > puregram (guards, но больше ручной типизации в middleware).
- **Онбординг/доки:** grammY (эталон доков и комьюнити) и GramIO (скаффолдер за минуту) впереди; puregram — приятный, но неформальный и компактнее.
- **Защита от ошибок форматирования:** GramIO `format` (entities, без экранирования) — самый безопасный подход.

---

## 5. Что заимствовать в «рофлолибу»

Каркас и принципы — в основном по мотивам **GramIO**, плюс точечно лучшее у двух других.

**Ядро (из GramIO):**
- `Bot extends Composer`, chainable API с **накоплением типов** через `derive` / `decorate` / `guard` / `extend`. Разделять `derive` (async, per-request) и `decorate` (статика, нулевой оверхед) — это правильная архитектурная развилка.
- `Composer` как самостоятельный, тестируемый класс → feature-файлы без `Bot`/токена.
- **Кодоген типов Bot API + авто-публикация** на каждый релиз API. Не привязывать релиз типов к релизу ядра.
- `format` на tagged templates → `MessageEntity`, без `parse_mode` и ручного экранирования.
- Скаффолдер `create <lib>` для мгновенного старта (ORM/линтер/Docker/плагины).

**Фильтрация и API-слой (из grammY):**
- **Filter queries** — мини-язык `update:subtype:subsubtype` с сужением типов. Это самая полезная фича grammY, аналога нет у конкурентов — сильный дифференциатор.
- **Transformer-слой** для вызовов API (на нём строятся retry/throttle/hydrate).
- Готовый **runner с backpressure** для high-load с самого начала.
- Runtime-agnostic билд (один кодовый корень → Node/Deno/web/edge).

**Контексты и сервис-слой (из puregram):**
- Опционально — **классы-контексты на типы апдейтов** + `is()/has()/can()` type guards (читаемость; можно совместить с filter-queries как сахар).
- **Hooks-перехватчики запросов** с возможностью отмены через `AbortController` и упаковки наборов хуков в сторонние пакеты (`useHooks`).
- Чистые **медиа-абстракции** `MediaSource` / `MediaSourceTo` / `InputMedia`.
- **Decoupled codegen**: ядро отдельно, сгенерированные типы/методы — отдельный пакет.
- Паттерн `suppress: true` для подавления ошибок API без try/catch.

**Чего избегать:**
- Не плодить ручные пересечения типов контекста (`Context & A & B & C`) как в grammY — chain-накопление GramIO эргономичнее.
- Не завязывать порядок middleware неявно (как `session` до `scenes` в puregram) — делать зависимости плагинов явными и проверяемыми типами.
- Не привязывать выпуск типов Bot API к релизам ядра — иначе будешь «ждать мейнтейнера».

---

## 6. Факты и цифры (проверено 22.06.2026)

| Метрика | grammY | puregram | GramIO |
|---|---|---|---|
| Последняя версия (npm) | 1.43.0 | 3.6.0 | 0.9.0 |
| Загрузок за месяц (npm) | 15 388 039 | 3 584 | 11 315 |
| Лицензия | MIT | MPL-2.0 | MIT |
| Мин. Node | ^12.20 / >=14.13 | >=22 | (Node/Bun/Deno) |
| Модульность | ESM+CJS, web-бандл | ESM-only | ESM, мульти-рантайм |
| Автор | KnorpelSenf | starkow / j++ team | kravetsone |

Для контекста рынка: Telegraf за тот же месяц — ~1,98 млн загрузок, т.е. grammY уже кратно обгоняет старого лидера, а puregram/GramIO — нишевые по объёму, но активно развиваются (GramIO — 73 релиза, последний v0.9.0 от 10.04.2026).

---

## Источники

- grammY: [grammy.dev](https://grammy.dev/), [GitHub grammyjs/grammY](https://github.com/grammyjs/grammy), [npm grammy](https://www.npmjs.com/package/grammy)
- puregram: [GitHub nitreojs/puregram](https://github.com/nitreojs/puregram), [README пакета](https://github.com/nitreojs/puregram/blob/lord/README.md), [npm puregram](https://www.npmjs.com/package/puregram)
- GramIO: [gramio.dev](https://gramio.dev/), [gramio.dev/get-started](https://gramio.dev/get-started), [GitHub gramiojs/gramio](https://github.com/gramiojs/gramio)
- Метрики загрузок: [npm downloads API](https://api.npmjs.org/downloads/point/last-month/grammy,gramio,puregram,telegraf)
