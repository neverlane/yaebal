# @yaebal/i18n

typed translations for yaebal bots: `ctx.t` with compile-time keys and params, nested dicts, real `Intl.PluralRules` plurals for any language, first-contact locale detection from telegram's `language_code`, and per-chat persistence through any `StorageAdapter`.

## install

```sh
pnpm add @yaebal/i18n
```

## usage

```ts
import { Bot } from "yaebal";
import { type Dict, i18n, type LocaleLike } from "@yaebal/i18n";

// `as const` keeps templates as literal types → typed keys and typed params
const en = {
  welcome: "hi {name}!",
  menu: { title: "menu" },                       // nested → t("menu.title")
  items: { one: "{n} item", other: "{n} items" }, // plural forms
} as const satisfies Dict;

// LocaleLike keeps ru structurally in sync with en; every key is optional —
// missing keys fall back to the default locale
const ru = {
  welcome: "привет {name}!",
  items: { one: "{n} товар", few: "{n} товара", many: "{n} товаров", other: "{n} товара" },
} as const satisfies LocaleLike<typeof en>;

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(i18n({ defaultLocale: "en", locales: { en, ru } }))
  .command("start", (ctx) =>
    ctx.reply(ctx.t("welcome", { name: ctx.from?.first_name ?? "there" })),
  )
  .command("lang", async (ctx) => {
    await ctx.changeLanguage(ctx.locale === "ru" ? "en" : "ru"); // typed + validated
    return ctx.reply(ctx.t("welcome", { name: "again" }));
  });
```

`ctx.t("welcom")` is a compile error. `ctx.t("welcome")` without params is a compile error. `ctx.changeLanguage("de")` is a compile error (and a runtime `TypeError` from untyped code) — a bad locale can never be persisted, and stale storage values that no longer match a configured locale are ignored instead of poisoning the chat.

## locale resolution

per update, in order: **stored** locale (set by `changeLanguage`, persisted per chat) → **detected** locale (`ctx.from?.language_code`, matched exactly and then by base language — `"pt-BR"` → `"pt"`) → **`defaultLocale`**. so a russian user gets russian on the very first `/start`, before ever touching a language switcher.

detection and the storage key are overridable:

```ts
i18n({
  defaultLocale: "en",
  locales: { en, ru },
  storage: new RedisStorage(),                    // any StorageAdapter<string>
  getKey: (ctx) => ctx.from?.id.toString(),       // per-user instead of per-chat
  detectLocale: (ctx) => ctx.from?.language_code, // the default
});
```

## plurals

a value whose keys are all `Intl.PluralRules` categories (`zero`/`one`/`two`/`few`/`many`/`other`, with `other` required) is a plural set. `t` selects the form with the rules of the locale **that supplied the forms** — a russian viewer falling back to an english string gets english plural rules — and requires a numeric `n` param, at compile time and at runtime.

```ts
ctx.t("items", { n: 5 }); // ru → "5 товаров", en → "5 items"
```

## formatted translations

a dict value can be a function: it receives typed params and its return type flows through `t`. return an `html`/`md`/`format` result and the translation carries entities — no `parse_mode`, nothing to escape:

```ts
import { html } from "@yaebal/fmt";

const en = {
  hello: (p: { name: string }) => html`<b>hello</b>, ${p.name}!`,
} as const satisfies Dict;

ctx.reply(ctx.t("hello", { name: ctx.who })); // { text, entities } — reply takes it as-is
```

## outside middleware

`createI18n` builds the translator without any bot wiring — for broadcasts, jobs, command menus — and the plugin can share the same instance:

```ts
import { createI18n, i18n } from "@yaebal/i18n";

const strings = createI18n({ defaultLocale: "en", locales: { en, ru } });

strings.t("ru", "welcome", { name: "Юра" }); // standalone
strings.resolveLocale("pt-BR");              // → configured locale or undefined
bot.install(i18n(strings, { storage }));     // same dicts, bot-wired
```

## api

| export | what it is |
| --- | --- |
| `i18n(options)` / `i18n(instance, options?)` | the plugin — adds `ctx.t`, `ctx.locale`, `ctx.locales`, `ctx.defaultLocale`, `ctx.changeLanguage` |
| `createI18n(options)` | standalone translator: `t(locale, key, params?)`, `locales`, `has`, `resolveLocale` |
| `Dict` / `LocaleLike<Base>` | dict shape + structural check for non-default locales |
| `PluralDict`, `TFn<D>`, `DictKeys<D>`, `I18nControls` | the typed surface, exported for wrappers |
| `onMissingKey?: (key, locale) => string \| undefined` | hook for keys missing everywhere (default: return the key itself) |

interpolation is a single pass — a param value can never be re-parsed as another placeholder, so user input like a first name containing `{n}` is inert. unknown placeholders stay verbatim.

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
