# YAEBAL — Architecture

Полная архитектура: ядро, контракт плагинов, каталог плагинов, нейминг событий,
и подсистема `morda` (dialogs) + JSX/hooks. Документ проектный — он описывает
куда едем, а не что уже собрано. Что уже есть в коде — помечено ✅.

## 0. ДНК: что откуда взято

| Идея | Источник | Статус |
|---|---|---|
| Chainable `Composer`, тип контекста накапливается через цепочку (`derive`/`decorate`/`extend`) | GramIO | ✅ есть |
| Filter queries `on("message:text")` с сужением типа контекста | grammY | ✅ частично |
| Shortcut-роутеры (`command`/`hears`/`callbackQuery`) поверх queries | grammY + GramIO | план |
| `api.call(method, params)` passthrough для ещё не типизированных методов | puregram | ✅ есть |
| `ctx.is("callback_query")` narrowing | puregram | ✅ есть |
| Request-хуки `api.before/after` (retry, throttle, media-cache цепляются сюда) | puregram | ✅ есть |
| Медиа-абстракция `MediaSource` (path/url/buffer/fileId) | puregram | ✅ есть |
| Декуплённый кодген типов из Bot API схемы | puregram | ✅ `@yaebal/types` (232 объекта + 135 методов) |

Инварианты (не нарушать):
1. `Bot extends Composer` — не форкаем middleware-движок, расширяем.
2. `derive` — async, per-request. `decorate` — статичный, ноль стоимости на запрос. Не смешивать.
3. Любой метод, обогащающий контекст, возвращает аугментированный тип, никогда `any`.
4. Зависимости плагинов явные и проверяются типами, а не порядком middleware.

---

## 1. Ядро (`@yaebal/core`)

### 1.1 Composer — движок ✅
Koa-style цепочка с защитой от двойного `next()`. Методы:
`use` · `on(query, ...)` · `guard` · `derive` · `decorate` · `extend` · `toMiddleware`.
Каждый обогащающий метод возвращает `Composer<C & D>`. `Bot` оверрайдит их, чтобы
возвращать `Bot`, а не голый `Composer` (lifecycle-методы остаются доступны по цепочке). ✅

Добавляется: **`install(plugin)`** — см. §1.6.

### 1.2 Filter queries — система событий (центр всего)

Синтаксис grammY-style `L1:L2:L3`. Понравившийся `message:text` — это `L1:L2`.

```
L1  тип апдейта      message · edited_message · channel_post · callback_query ·
                     inline_query · poll · poll_answer · my_chat_member ·
                     chat_member · chat_join_request · message_reaction · ...
L2  контент          on message:  text · caption · photo · video · document · audio ·
                       voice · sticker · animation · location · contact · dice ·
                       entities · new_chat_members · left_chat_member · pinned_message
                     on callback_query:  data · game_short_name
                     on inline_query:  query
L3  под-контент      on message:entities:  url · mention · hashtag · bot_command ·
                       email · phone_number · bold · italic · code · spoiler · custom_emoji
```

Шорткаты:
- `:text` — любой апдейт с текстом (`message` / `edited_message` / `channel_post`).
- `::url` — любой апдейт, где есть entity типа `url`.
- Массив: `on(["message:text", "edited_message:text"], handler)`.

**Сужение типа.** `Filtered<C, Q>` дописывает в контекст не-опциональные поля под запрос:

| Запрос | Контекст получает |
|---|---|
| `…:text` / `…:caption` | `text: string` |
| `…:data` / `callback_query` | `callbackQuery: CallbackQuery` |
| `…:photo` | `message: Message & { photo: PhotoSize[] }` |
| `…:entities:url` | `entities: MessageEntity[]` |

✅ сейчас реализованы `text`/`caption`/`data`. Остальные добавляются по мере надобности —
**ленивый дефолт: неизвестный запрос не сужает тип (возвращает `C`), но матчится в рантайме**
через `checkField`/`matchQuery`. Никаких падений на незнакомом поле.

Рантайм: `matchQuery(ctx, "message:text")` → `head=message` сверяется с `ctx.updateType`,
хвост `text` проверяется через `checkField`. ✅

### 1.3 Shortcut-роутеры — сахар поверх queries

Тонкие обёртки, каждая просто пушит middleware с `matchQuery`-проверкой. Не новая подсистема.

| Метод | Эквивалент query | Кладёт в ctx | Источник |
|---|---|---|---|
| `command("start", h)` | `message:text` где text начинается с `/start` | `ctx.command`, `ctx.args` | grammY + GramIO |
| `hears(/rx/ \| "str", h)` | `message:text\|caption` + match | `ctx.match` | puregram hear + grammY |
| `callbackQuery(data \| /rx/ \| CallbackData, h)` | `callback_query:data` + match | `ctx.match` | grammY + GramIO |
| `reaction("👍", h)` | `message_reaction` | — | grammY |
| `chatType("private", h)` | guard на `ctx.chat.type` | — | grammY |
| `inlineQuery(/rx/, h)` | `inline_query:query` + match | `ctx.match` | grammY |

`hear` из puregram **не** делаем отдельным плагином — это `bot.hears` в ядре.

### 1.4 Context ✅
Базовый враппер апдейта. Геттеры: `message` (msg/edited/channel) · `callbackQuery` ·
`from` · `chat` · `text` (text ?? caption). Методы: `is(type)` (puregram narrowing) ·
`send` · `reply` · `answerCallbackQuery`. Принимает `string | FormatResult` (entity-форматирование).
Плагины дописывают поля через `derive`/`decorate`, типы трекает Composer.

✅ Медиа-шорткаты в ядре: `ctx.sendPhoto` / `ctx.sendDocument` (принимают `MediaSource | string`).

### 1.5 Api — клиент + точки расширения

Сейчас ✅: Proxy-клиент. `api.getMe()` ≡ `api.call("getMe")`, неизвестные методы
форвардятся прозрачно (puregram-идея — новый метод Bot API работает до регена типов).
`TelegramError` на `ok:false`.

Добавляется (критично — на этом стоят пол-каталога плагинов):

**Request-хуки** (puregram):
```ts
api.before((method, params) => params | void)   // throttle, media-cache, media upload rewrite
api.after((method, result) => result | void)     // hydrate
api.onError((method, error, retry) => ...)        // again (auto-retry), логирование
```
Реализация — массивы интерсепторов внутри `createApi`, прогоняются вокруг `call`.
Без этого `again`/`tormozi`/`zanachka` пришлось бы зашивать в ядро по одному — а так
они просто подписчики.

**Медиа-абстракция** `MediaSource` (puregram) — дискриминированный юнион:
```ts
MediaSource.path("./a.jpg") | .url("https://…") | .buffer(buf) | .fileId("AgAC…") | .stream(rs)
```
Api-слой знает, как превратить каждый вариант в `multipart/form-data` либо в строку
(`file_id`/url). На этом строятся `kachai` (upload) и `zanachka` (cache).

### 1.6 Контракт плагина (инвариант №4)

Плагин — это функция, зависимости выражены **типом аргумента**, не реестром:

```ts
type Plugin<In extends Context = Context, Out extends object = {}> =
  <C extends In>(composer: Composer<C>) => Composer<C & Out>;

// Composer/Bot:
install<Out extends object>(plugin: Plugin<C, Out>): Bot<C & Out>;
```

Зависимость ловит компилятор:
```ts
const session:  Plugin<Context, { session: Session }>;
const tolmach: Plugin<Context & { session: Session }, { t: TFn; changeLanguage(l): void }>;

bot.install(tolmach);                 // ❌ TS: нет session в контексте
bot.install(session).install(tolmach); // ✅ порядок гарантирован типом In
```

Никакого рантайм-графа зависимостей, класса `Plugin`, DI-контейнера. Именованный
рантайм-реестр («плагин X не установлен» человекочитаемо) — **YAGNI**, добавить если
понадобится диагностика в рантайме.

### 1.7 Bot — lifecycle ✅
`extends Composer`. Long-polling петля (`getUpdates` с offset, retry на сетевой ошибке),
`onStart` / `onError` / `start` / `stop`. `derive`/`decorate`/`extend` оверрайднуты под `Bot<…>`.
✅ Webhook-режим: `bot.handleUpdate(update)` — точка входа; плюс `webhookCallback(bot)` (fetch-style `Request→Response`, для Bun/Deno/Workers) и `nodeWebhookCallback(bot)` (node http). Общий `toMiddleware` с polling (мемоизирован; регистрируй middleware до первого вызова).

### 1.9 Контексты (`@yaebal/contexts`) — ФУЛЛ автоген (киллер-фича) ✅
Генератор лепит **класс на каждый тип апдейта** (`MessageContext`, `CallbackQueryContext`, …,
23 штуки) из схемы: интерфейс мёржит payload (`interface MessageContext extends Message`),
конструктор спредит поля на инстанс (`ctx.text`/`ctx.photo` напрямую, gramio-style), а
**шорткат-методы выводятся автоматически** — по тому, какие id контекст несёт. Provider-таблица
(`chat`→`chat_id`/`from_chat_id`, `message_id`, `from`→`user_id`, query-`id`) × все методы Bot API
→ `reply`/`send*`/`editText`/`delete`/`pin`/`forward`/`answer`/`ban`/… с сигнатурами `Omit<XParams, заполненные>`
из `@yaebal/types`. Добавили метод в Bot API → реген → контексты получили его. В отличие от gramio,
где контексты пишут руками — у нас **полностью генерятся**.

### 1.8 Типы (`@yaebal/types`) — декуплённый кодген (puregram) ✅
`scripts/generate.mjs` тянет машиночитаемую схему (ark0f) → генерит `src/telegram.ts`:
**232 объекта + 135 методов** (Bot API 8.3) с JSDoc, плюс `BotApiMethods` и per-method
`*Params`-интерфейсы. Реген — `pnpm --filter @yaebal/types generate`. Отдельный пакет,
core по-прежнему держит свой минимальный ручной срез (миграция core на `@yaebal/types` — позже).

---

## 2. Каталог плагинов

Имена в стиле проекта. Зависимость = что должно стоять в контексте раньше.
Источник = откуда идея.

### Ядро экосистемы (первые)
| Пакет | Что делает | Зависит | Цепляется | Источник |
|---|---|---|---|---|
| **`@yaebal/again`** ✅ | auto-retry на 429/flood-wait + transient 5xx | — | `api.onError` | grammY auto-retry, @gramio/auto-retry |
| **`@yaebal/session`** ✅ | session — per-chat стейт; `load → next → save` middleware. Несёт `StorageAdapter` + `MemoryStorage` | — | `use` → `ctx.session` | все три |
| **`@yaebal/sklad`** | storage-адаптеры (file/redis). **Отложен:** `MemoryStorage` пока живёт в `session`; выделить пакет, когда появится первый персистентный адаптер (нужен для `morda` на M2) | — | — | grammY storages |
| **`@yaebal/keyboard`** ✅ | builder inline/reply-клавиатур (чистый хелпер) | — | export | @gramio/keyboards |
| **`@yaebal/callback-data`** ✅ | типизированный `callback_data` (pack/unpack + `.pattern` под `callbackQuery`) | — | export | @gramio + @puregram callback-data |

### UX
| Пакет | Что делает | Зависит | Источник |
|---|---|---|---|
| **`@yaebal/morda`** ✅ | dialogs: окна → сообщение, callback-роутинг, стек навигации (`start`/`push`/`replace`/`back`), stale-press гейт | `session`, `callback-data`, `keyboard` | @gramio/dialogs |
| **`@yaebal/morda/jsx`** ✅ | JSX-runtime + хуки (`useState`/`useEffect`/`useNavigation`/`useUser`/`useSession`/`useTranslation`) поверх morda, subpath | `morda` | @gramio/jsx + Templatio-style hooks |
| **`@yaebal/scenes`** ✅ | step-FSM визард: `enter`/`next`/`leave`, per-chat шаг; `ctx.scene`. Sequential-safe (без suspended promises) | `session` | @gramio/scenes, @puregram/scenes |
| **`@yaebal/prompt`** ✅ | `ctx.prompt(q, handler)` — спросил, хендлер ловит следующее сообщение (callback-style, in-memory) | — | @gramio/prompt, @puregram/prompt |
| **`@yaebal/files`** ✅ | `ctx.files.fileLink` / `download` (через `getFile` + `api.fileUrl`). Upload — в ядре через `MediaSource` | — | @gramio/files, grammY files |
| **`@yaebal/zanachka`** | media-cache — `file_id` вместо повторной заливки | — | `api.before` | @gramio/media-cache |
| **`@yaebal/pachka`** | media-group — собрать альбом из пачки апдейтов | — | @gramio/media-group |
| **`@yaebal/otvet`** | auto-answer callbackQuery | — | @gramio/auto-answer-cbq |

### i18n / инфра (по мере надобности — YAGNI до запроса)
| Пакет | Что делает | Зависит | Источник |
|---|---|---|---|
| **`@yaebal/i18n`** ✅ | `ctx.t` + `changeLanguage`, локаль per-chat, fallback на default-локаль; питает `useTranslation` | `session` | @gramio/i18n, grammY i18n |
| **`@yaebal/throttle`** ✅ | rate-limit исходящих (не словить flood); слоты через `api.before` | — | grammY transformer-throttler |
| **`@yaebal/ratelimiter`** ✅ | анти-спам входящих: дропает апдейты сверх лимита за окно (per-user) | — | grammY ratelimiter, @gramio/rate-limiter |
| **`@yaebal/router`** ✅ | file-based routing (storona-style): `loadRoutes(bot, dir)`, `commands/` + `on/`, dot→`:` в именах | — | @gramio/autoload + storona |
| **`@yaebal/listai`** | пагинация | `keyboard` | @gramio/pagination |
| **`@yaebal/narezka`** | резать длинные сообщения на части | — | @gramio/split |
| **`@yaebal/vkatka`** | onboarding — декларативные туториалы | `session` | @gramio/onboarding |
| **`@yaebal/broadcast`** ✅ | массовая рассылка, `{sent, failed}`, переживает блокировки. Пара к `throttle` | — | @gramio/broadcast |
| **`@yaebal/komandy`** | управление командами/скоупами | — | grammY commands |
| **`@yaebal/tolpa`** | runner — конкурентный поллинг, масштаб | — | grammY runner |

### Граф зависимостей (ядро)
```
sklad ─→ session ─→ i18n
                ├→ scenes
                ├→ vkatka
                └→ morda ─→ morda/jsx
callback-data ───────────┘
keyboard ──→ listai
tormozi ─→ rassylka
again · prompt · kachai · zanachka · pachka · otvet · sam · tormozi · ne-speshi · tolpa  (без зависимостей от session)
```

---

## 3. `morda` + JSX/hooks — React-for-Telegram

### Главный инсайт
**Один `<Screen>` = одно сообщение.** Поэтому НЕ нужен реконсилёр/фиберы/диффинг дерева.
Рендер = пройти дерево один раз → `{ text, keyboard }`. Ре-рендер после `setState` =
собрать заново, сравнить `(text, markup)` с прошлым → `editMessageText` если изменилось.
Якорь маршрутизации — `id` на кнопке: `callback_data = pack(frameId, button.id)` (через `callback-data`).

### Движок `morda` (builder-API, без JSX)
- **Виджеты:** `Screen`/`Window`, `Column`/`Row`/`ButtonRow`, `Button`, `SwitchTo` — узлы-объекты, без логики.
- **Рендер:** flatten → текстовые ноды в `text`, кнопки в `InlineKeyboardMarkup`, каждой `callback_data`.
- **Роутинг:** `on("callback_query:data")` → unpack → найти кадр → перерендер → найти кнопку по id → `onClick`.
- **Навигация:** стек кадров. `start`/`push`/`replace`/`back`/`reset`. Кадр = `{ screenId, hookState[], mounted, prevDeps }`. Живёт в `session` → переживает рестарт процесса.
- **Стейт кадра:** `useState` сериализуется в кадр → значения **обязаны быть JSON-serializable** (документируемое ограничение).

### `morda/jsx` — JSX + хуки
JSX-runtime (~20-30 строк): `jsx(type, props)` возвращает узел виджета `morda`.
Интринзики → конструкторы виджетов, функц-компоненты → вызвать с props. `jsxImportSource` в tsconfig.

Хуки — тонкие фасады над контекстом/стеком (правила React: вызывать безусловно, фиксированный порядок).
Они **не импортят** плагины пакетом — читают `ctx` (мягкая зависимость, инвариант №4 ловит типом):

| Хук | Что | Откуда |
|---|---|---|
| `useState` | слот в `hookState[]` кадра по индексу; setState → кадр грязный → ре-рендер | jsx-runtime |
| `useEffect(fn, deps)` | после commit; mount один раз (флаг `mounted`), сравнение `deps` JSON-eq | jsx-runtime |
| `useNavigation` | `{ push, replace, back, reset }` | стек `morda` |
| `useUser` | `ctx.user` | core derive |
| `useSession` | `ctx.session` (`.get/.set`) | `session` |
| `useTranslation` | `{ t, changeLanguage }` | `tolmach` |

### Жизненный цикл (пример `LangSelectScreen`)
1. `start("lang")` → новый кадр, рендер, хуки читают пустой стейт.
2. commit: `useEffect([],…)` фаерит один раз → `upsertUser` → `session.set("userDbId")`.
3. Нажат `<Button id="ru">` → unpack callback → регидрат кадра → **перезапуск компонента**
   (хуки читают сохранённый стейт, эффект НЕ фаерит) → найти кнопку `ru` → `onClick` →
   `setUserLanguage` + `changeLanguage` + `replace(HomeScreen)`.
4. `replace` → новый кадр → ре-рендер → `editMessageText`.

### Где НЕ ленимся (потолки)
- Сериализация стейта: `useState` только JSON.
- Правила хуков: рантайм-assert «число хуков == прошлый рендер», падать понятно.
- Async `onClick` + батчинг: несколько `setState` за обработчик → один `editMessageText`.
- Идемпотентность эффектов при рестарте между mount и press — флаг `mounted` в сессии.

### YAGNI (не делаем)
Concurrent mode, Suspense, Context API (хватает встроенных хуков),
key-based reconciliation списков (клава перерисовывается целиком), мульти-сообщение на Screen.

---

## 4. Шпаргалка событий

```ts
// L1 — тип апдейта
bot.on("message", h)
bot.on("edited_message", h)
bot.on("callback_query", h)
bot.on("inline_query", h)
bot.on("my_chat_member", h)

// L1:L2 — контент (понравившийся стиль)
bot.on("message:text", h)          // ctx.text: string
bot.on("message:photo", h)         // ctx.message.photo
bot.on("message:caption", h)
bot.on("callback_query:data", h)   // ctx.callbackQuery: CallbackQuery
bot.on("inline_query:query", h)

// L1:L2:L3 — под-контент
bot.on("message:entities:url", h)
bot.on("message:entities:bot_command", h)

// шорткаты
bot.on(":text", h)                 // любой апдейт с текстом
bot.on("::url", h)                 // любой апдейт с entity url
bot.on(["message:text", "edited_message:text"], h)

// сахар (поверх queries)
bot.command("start", h)            // ctx.command, ctx.args
bot.hears(/привет/i, h)            // ctx.match
bot.callbackQuery(myData, h)       // ctx.match (через callback-data)
bot.reaction("👍", h)
bot.chatType("private", h)
```

---

## 5. Порядок сборки

**M0 — ядро (расширить существующее)**
- request-хуки `api.before/after/onError` в `createApi`
- `install(plugin)` + тип `Plugin`
- доспроектировать `Filtered` маппинг под частые queries + shortcut-роутеры (`command`/`hears`/`callbackQuery`)

**M1 — фундамент плагинов**
- ✅ `session` (session) — `MemoryStorage` внутри; `sklad` отложен до первого персистентного адаптера
- ✅ `keyboard` (keyboard builder) + `callback-data` (typed callback_data, `.pattern` интегрируется с `bot.callbackQuery`)
- `again` (на `api.onError`) — заодно проверка, что монорепа тащит второй пакет
- `keyboard` + `callback-data`

**M2 — UX-флагман**
- ✅ **M2a** `morda` (builder-API): окна + рендер + callback-роутинг + стек навигации + stale-press гейт. `button`/`switchTo`/`back` хелперы, `ctx.dialog`
- ✅ **M2b** `morda/jsx`: JSX-runtime + хуки. «Один Screen = одно сообщение → без реконсилёра»; `setState` → `editMessageText` на месте; хук-стейт в слотах кадра, эвиктится при закрытии экрана; навигация по компонентам (`push(HomeScreen)`). Скрин-пример работает.

**M3 — мягкие зависимости контекста**
- ✅ `i18n` → оживляет `useTranslation` (per-chat локаль, fallback, `{placeholder}`-интерполяция)
- ✅ `scenes` (step-визарды, `ctx.scene.enter/next/leave`) + ✅ `prompt` (`ctx.prompt`, callback-style). Оба не блокируют sequential-loop (в отличие от await-prompt — он требовал бы конкурентного диспатча)

**M4 — инфра по запросу (YAGNI до факта)**
- ✅ `router` · `throttle` · `files` (+ ядро `api.fileUrl`) · `ratelimiter` · `broadcast`
- ✅ `web` — операторская панель (смотреть чаты / отвечать из браузера): `recorder`-плагин + `PanelStore` + `panelHandler` (fetch). Вебхуки переехали в ядро (`webhookCallback`)
- ✅ `media-group` · `split` · `commands` · `pagination` · `media-cache` (кэш `file_id` через явные ключи — корректно при конкуренции)
- ✅ кодген `@yaebal/types` (232 объекта + 135 методов из схемы, генератор `scripts/generate.mjs`)
- осталось: `onboarding` (ниша), `runner` (конкурентный поллинг — конфликтует с sequential session)

**Кодген типов** (`@yaebal/types`) — параллельно, не блокирует M0-M3.

Builder-API и JSX — два фронтенда к одному движку `morda`, так что JSX можно отложить и ничего не переписывать.
