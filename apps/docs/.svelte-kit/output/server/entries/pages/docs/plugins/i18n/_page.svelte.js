import { h as head } from "../../../../../chunks/index.js";
import { C as Code } from "../../../../../chunks/Code.js";
function _page($$renderer) {
  const install = `pnpm add @yaebal/i18n`;
  const usage = `import { Bot } from "@yaebal/core";
import { i18n } from "@yaebal/i18n";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(i18n({
    defaultLocale: "en",
    locales: {
      en: {
        welcome: "Hello {name}!",
        bye: "Goodbye",
      },
      ru: {
        welcome: "Привет {name}!",
        bye: "До свидания",
      },
    },
  }));

bot.command("start", async (ctx) => {
  await ctx.reply(ctx.t("welcome", { name: ctx.from!.first_name }));
});

bot.command("lang", async (ctx) => {
  await ctx.changeLanguage("ru");
  await ctx.reply(ctx.t("welcome", { name: ctx.from!.first_name }));
});

bot.start();`;
  const persistStorage = `import { i18n } from "@yaebal/i18n";
import { type StorageAdapter } from "@yaebal/session";

// any StorageAdapter<string> keeps locale across restarts
class RedisLocaleStorage implements StorageAdapter<string> {
  async get(key: string): Promise<string | undefined> { /* ... */ }
  async set(key: string, value: string): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
}

bot.install(i18n({
  defaultLocale: "en",
  locales: { en: { hi: "Hi" }, ru: { hi: "Привет" } },
  storage: new RedisLocaleStorage(),
}));`;
  const perUser = `bot.install(i18n({
  defaultLocale: "en",
  locales: { en: { hi: "Hi" }, ru: { hi: "Привет" } },
  // use the user id as the key instead of the chat id
  getKey: (ctx) => ctx.from?.id?.toString(),
}));`;
  const fallback = `// "ru" locale has no "bye" key → falls back to "en"
// "en" has no "missing" key → returns the key itself

ctx.t("bye");      // → "Goodbye"  (en fallback)
ctx.t("missing");  // → "missing"  (key fallback)`;
  head("9wdap2", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>@yaebal/i18n — yaebal</title>`);
    });
  });
  $$renderer.push(`<h1>@yaebal/i18n</h1> <p class="lead">per-chat locale with <code>ctx.t</code> / <code>ctx.locale</code> / <code>ctx.changeLanguage</code>. missing keys fall back to the default locale, then to the key
	itself. powers <code>useTranslation()</code> in the morda jsx layer.</p> <h2>install</h2> `);
  Code($$renderer, { code: install, title: "terminal", lang: "sh" });
  $$renderer.push(`<!----> <h2>usage</h2> <p>pass your locale dictionaries to <code>i18n()</code> and install it with <code>.install()</code>. the plugin reads the stored locale for the current chat before your
	handlers run, so <code>ctx.t</code> is ready immediately.</p> `);
  Code($$renderer, { code: usage, title: "bot.ts" });
  $$renderer.push(`<!----> <h2>api</h2> <table><thead><tr><th>export</th><th>signature</th><th>description</th></tr></thead><tbody><tr><td><code>i18n</code></td><td><code>(options: I18nOptions&lt;L>) => Plugin&lt;Context, I18nControls></code></td><td>creates the i18n plugin</td></tr><tr><td><code>I18nOptions</code></td><td>interface</td><td>options passed to <code>i18n()</code></td></tr><tr><td><code>I18nControls</code></td><td>interface</td><td>what the plugin adds to the context (<code>t</code>, <code>locale</code>, <code>changeLanguage</code>)</td></tr><tr><td><code>Dict</code></td><td><code>Record&lt;string, string></code></td><td>a single locale's key → template map</td></tr><tr><td><code>TFn</code></td><td><code>(key: string, params?: Record&lt;string, unknown>) => string</code></td><td>the type of <code>ctx.t</code></td></tr></tbody></table> <h3>I18nOptions&lt;L></h3> <table><thead><tr><th>field</th><th>type</th><th>required</th><th>description</th></tr></thead><tbody><tr><td><code>defaultLocale</code></td><td><code>L</code></td><td>yes</td><td>locale used when no stored locale exists and for fallback lookups</td></tr><tr><td><code>locales</code></td><td><code>Record&lt;L, Dict></code></td><td>yes</td><td>all translation dictionaries keyed by locale code</td></tr><tr><td><code>storage</code></td><td><code>StorageAdapter&lt;string></code></td><td>no</td><td>where to persist each chat's locale. defaults to <code>MemoryStorage</code></td></tr><tr><td><code>getKey</code></td><td><code>(ctx: Context) => string | undefined</code></td><td>no</td><td>storage key for the update. defaults to <code>ctx.chat?.id?.toString()</code></td></tr></tbody></table> <h3>I18nControls (added to ctx)</h3> <table><thead><tr><th>property</th><th>type</th><th>description</th></tr></thead><tbody><tr><td><code>t</code></td><td><code>TFn</code></td><td>translate a key; <code>{placeholder}</code> tokens are replaced from <code>params</code></td></tr><tr><td><code>locale</code></td><td><code>string</code></td><td>the active locale code for this update</td></tr><tr><td><code>changeLanguage</code></td><td><code>(locale: string) => Promise&lt;void></code></td><td>switch locale for this update and persist it; subsequent <code>ctx.t</code> calls in the same handler use the new locale immediately</td></tr></tbody></table> <h2>persistent storage</h2> <p>the default <code>MemoryStorage</code> is lost on restart. pass any <code>StorageAdapter&lt;string></code> (same interface as <code>@yaebal/session</code>) to
	persist locales across restarts.</p> `);
  Code($$renderer, { code: persistStorage, title: "redis-locale.ts" });
  $$renderer.push(`<!----> <h2>per-user locale</h2> <p>override <code>getKey</code> to partition by user instead of chat.</p> `);
  Code($$renderer, { code: perUser, title: "per-user.ts" });
  $$renderer.push(`<!----> <h2>fallback behaviour</h2> `);
  Code($$renderer, { code: fallback, title: "fallback.ts" });
  $$renderer.push(`<!----> <div class="note"><strong>interpolation uses <code>{placeholder}</code> syntax</strong>, not template
	literals. every <code>{key}</code> token in the string is replaced with the matching
	entry from <code>params</code> via <code>String(value)</code>. <br/><br/> <strong>changeLanguage takes effect immediately</strong> within the current handler — calls to <code>ctx.t</code> after <code>await ctx.changeLanguage("ru")</code> in the same middleware use
	the new locale. the next update loads the persisted locale from storage. <br/><br/> <strong>updates without a chat</strong> (e.g. <code>poll</code> updates) where <code>getKey</code> returns <code>undefined</code> always use the <code>defaultLocale</code> and
	never persist.</div>`);
}
export {
  _page as default
};
