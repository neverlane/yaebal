<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const install = `pnpm add @yaebal/i18n`;

	const usage = `import { Bot } from "yaebal";
import { type Dict, i18n, type LocaleLike } from "@yaebal/i18n";

// \`as const\` keeps the templates as literal types, so ctx.t gets
// typed keys AND typed params — a typo is a compile error
const en = {
  welcome: "hello {name}!",
  bye: "goodbye",
  menu: { title: "menu" }, // nested → t("menu.title")
} as const satisfies Dict;

// LocaleLike keeps ru structurally in sync with en. every key is
// optional — missing keys fall back to the default locale.
const ru = {
  welcome: "привет {name}!",
  menu: { title: "меню" },
} as const satisfies LocaleLike<typeof en>;

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(i18n({ defaultLocale: "en", locales: { en, ru } }));

bot.command("start", async (ctx) => {
  await ctx.reply(ctx.t("welcome", { name: ctx.from!.first_name }));
});

bot.command("lang", async (ctx) => {
  // typed: only "en" | "ru" compile; unknown locales throw TypeError at runtime
  await ctx.changeLanguage(ctx.locale === "ru" ? "en" : "ru");
  await ctx.reply(ctx.t("welcome", { name: ctx.from!.first_name }));
});

bot.start();`;

	const typed = `ctx.t("welcome", { name: "sam" }); // ✓
ctx.t("welcom", { name: "sam" });  // ✗ compile error: unknown key
ctx.t("welcome");                  // ✗ compile error: missing { name }
ctx.t("welcome", { nom: "sam" });  // ✗ compile error: wrong param name
ctx.t("menu.title");               // ✓ nested keys are dotted
ctx.changeLanguage("de");          // ✗ compile error: not a configured locale`;

	const detection = `// resolution order per update:
//   1. stored locale (set by changeLanguage, persisted per chat)
//   2. detected locale — ctx.from?.language_code, matched exactly,
//      then by base language ("pt-BR" → "pt")
//   3. defaultLocale
//
// so a russian user gets russian on the very first /start.

bot.install(i18n({
  defaultLocale: "en",
  locales: { en, ru },
  // override detection (or disable it with () => undefined)
  detectLocale: (ctx) => ctx.from?.language_code,
}));`;

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
  locales: { en, ru },
  storage: new RedisLocaleStorage(),
}));`;

	const perUser = `bot.install(i18n({
  defaultLocale: "en",
  locales: { en, ru },
  // partition by user instead of the default chat-then-user key
  getKey: (ctx) => ctx.from?.id?.toString(),
}));`;

	const plurals = `const en = {
  // a plural value is an object keyed by Intl.PluralRules categories.
  // "other" is required; the rest are optional per locale.
  apples: { one: "{n} apple", other: "{n} apples" },
} as const satisfies Dict;

const ru = {
  apples: { one: "{n} яблоко", few: "{n} яблока", many: "{n} яблок", other: "{n} яблока" },
} as const satisfies LocaleLike<typeof en>;

bot.command("count", async (ctx) => {
  // the numeric n param is required — by the compiler and at runtime
  await ctx.reply(ctx.t("apples", { n: 1 })); // en → "1 apple"
  await ctx.reply(ctx.t("apples", { n: 5 })); // ru → "5 яблок"
});

// fallback keeps the right grammar: if ru lacks a key and the en forms are
// used, the category is chosen with en rules — never "21 apple".`;

	const formatted = `import { html } from "@yaebal/fmt";

const en = {
  // a dict value can be a function: typed params in, anything out.
  // return html\`...\`/md\`...\`/format\`...\` and the translation carries
  // MessageEntity objects — no parse_mode, nothing to escape.
  hello: (p: { name: string }) => html\`<b>hello</b>, \${p.name}!\`,
} as const satisfies Dict;

// the return type flows through t; reply accepts { text, entities } as-is
bot.command("start", (ctx) => ctx.reply(ctx.t("hello", { name: ctx.who })));`;

	const standalone = `import { createI18n, i18n } from "@yaebal/i18n";

// a pure translator — no bot wiring, usable in broadcasts, jobs, menus
const strings = createI18n({ defaultLocale: "en", locales: { en, ru } });

strings.t("ru", "welcome", { name: "Юра" }); // → "привет Юра!"
strings.t("no-such-locale", "bye");          // → "goodbye" (default fallback)
strings.resolveLocale("pt-BR");              // → configured locale or undefined
strings.locales;                             // → ["en", "ru"]

// the plugin can share the same instance
bot.install(i18n(strings, { storage: new RedisLocaleStorage() }));`;

	const fallback = `// "ru" locale has no "bye" key → falls back to "en"
// "en" has no "missing" key → returns the key itself (or onMissingKey's result)

ctx.t("bye");      // → "goodbye"  (en fallback)
ctx.t("missing");  // → "missing"  (key fallback — untyped code only; typed keys
                   //    make this unrepresentable)

// interpolation is a single pass: a param value is never re-parsed as a
// placeholder, so user input like "{n}" in a first name is inert.
ctx.t("pair", { a: "{b}", b: "Z" }); // "{a} and {b}" → "{b} and Z"`;

	const testing = `import { createTestEnv } from "@yaebal/test";

const env = createTestEnv(bot);

// language_code drives first-contact detection
const user = env.createUser({ languageCode: "ru" });
await user.sendCommand("start");
// → the bot answered in russian on the very first update`;
</script>

<svelte:head>
	<title>@yaebal/i18n — yaebal</title>
</svelte:head>

<h1>@yaebal/i18n</h1>
<p class="lead">
	typed translations: <code>ctx.t</code> with compile-time keys and params, nested dicts,
	<code>Intl.PluralRules</code> plurals for any language, first-contact locale detection from
	telegram's <code>language_code</code>, and per-chat persistence through any
	<code>StorageAdapter</code>. powers <code>useTranslation()</code> in the morda jsx layer.
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	declare dicts <code>as const</code>, pass them to <code>i18n()</code> and install it with
	<code>.install()</code>. the plugin resolves the locale for the current chat before your handlers
	run, so <code>ctx.t</code> is ready immediately — typed from the default locale's dict.
</p>
<Code code={usage} title="bot.ts" />
<Try id="i18n-switch" title="language-switch.ts" />

<h2>typed keys and params</h2>
<p>
	the default locale's dict defines the whole typed surface: keys (nested ones as
	<code>"parent.child"</code>), the exact param names of every
	<code>&#123;placeholder&#125;</code> template, and the return type of every value. with a plain
	(widened) dict everything degrades gracefully to <code>(key, params?) =&gt; string</code>.
</p>
<Code code={typed} title="typed.ts" />

<h2>locale detection</h2>
<p>
	the first time a user talks to the bot there is nothing in storage yet — the plugin then matches
	telegram's <code>language_code</code> against the configured locales, so users get their language
	before ever touching a language switcher. a locale pinned with
	<code>changeLanguage</code> always wins over detection.
</p>
<Code code={detection} title="detection.ts" />

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>i18n</code></td>
			<td><code>(options) | (instance, options?) =&gt; Plugin&lt;Context, I18nControls&gt;</code></td>
			<td>the plugin — build from options, or wire a shared <code>createI18n</code> instance</td>
		</tr>
		<tr>
			<td><code>createI18n</code></td>
			<td><code>(options: CreateI18nOptions) =&gt; I18n</code></td>
			<td>standalone translator: <code>t(locale, key, params?)</code>, <code>locales</code>,
				<code>has</code>, <code>resolveLocale</code> — for code outside middleware</td>
		</tr>
		<tr>
			<td><code>I18nControls</code></td>
			<td>interface</td>
			<td>what the plugin adds to the context (<code>t</code>, <code>locale</code>,
				<code>locales</code>, <code>defaultLocale</code>, <code>changeLanguage</code>)</td>
		</tr>
		<tr>
			<td><code>Dict</code></td>
			<td>interface</td>
			<td>a locale's translation table: templates, plural sets, functions, nested tables</td>
		</tr>
		<tr>
			<td><code>DictValue</code></td>
			<td><code>string | PluralDict | DictFn</code></td>
			<td>one translation: a template, plural forms, or a function of typed params</td>
		</tr>
		<tr>
			<td><code>PluralDict</code></td>
			<td><code>&#123; zero?, one?, two?, few?, many? : string; other: string &#125;</code></td>
			<td>plural forms keyed by <code>Intl.PluralRules</code> categories; <code>other</code> is required</td>
		</tr>
		<tr>
			<td><code>LocaleLike&lt;Base&gt;</code></td>
			<td>type</td>
			<td>structural check for non-default locales: same shape, every key optional</td>
		</tr>
		<tr>
			<td><code>TFn&lt;D&gt;</code> / <code>DictKeys&lt;D&gt;</code></td>
			<td>types</td>
			<td>the typed translate function and its key union — exported for wrappers</td>
		</tr>
	</tbody>
</table>

<h3>options</h3>
<table>
	<thead>
		<tr><th>field</th><th>type</th><th>required</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>defaultLocale</code></td>
			<td><code>keyof locales</code></td>
			<td>yes</td>
			<td>the fallback locale; its dict defines the typed key set</td>
		</tr>
		<tr>
			<td><code>locales</code></td>
			<td><code>Record&lt;string, Dict&gt;</code></td>
			<td>yes</td>
			<td>all translation dictionaries keyed by locale code</td>
		</tr>
		<tr>
			<td><code>storage</code></td>
			<td><code>StorageAdapter&lt;string&gt;</code></td>
			<td>no</td>
			<td>where to persist each chat's locale. defaults to <code>MemoryStorage</code></td>
		</tr>
		<tr>
			<td><code>getKey</code></td>
			<td><code>(ctx) =&gt; string | undefined</code></td>
			<td>no</td>
			<td>storage key for the update. default: chat id, falling back to user id</td>
		</tr>
		<tr>
			<td><code>detectLocale</code></td>
			<td><code>(ctx) =&gt; string | undefined</code></td>
			<td>no</td>
			<td>first-contact detection, used only when nothing is stored. default:
				<code>ctx.from?.language_code</code></td>
		</tr>
		<tr>
			<td><code>onMissingKey</code></td>
			<td><code>(key, locale) =&gt; string | undefined</code></td>
			<td>no</td>
			<td>hook for keys missing in every locale; return a replacement or fall back to the key</td>
		</tr>
	</tbody>
</table>

<h3>I18nControls (added to ctx)</h3>
<table>
	<thead>
		<tr><th>property</th><th>type</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>t</code></td>
			<td><code>TFn&lt;D&gt;</code></td>
			<td>translate a key of the default locale's dict; params and return type are inferred</td>
		</tr>
		<tr>
			<td><code>locale</code></td>
			<td><code>keyof locales</code></td>
			<td>the active locale for this update (reflects <code>changeLanguage</code> immediately)</td>
		</tr>
		<tr>
			<td><code>locales</code></td>
			<td><code>readonly (keyof locales)[]</code></td>
			<td>every configured locale — handy for building a /lang menu</td>
		</tr>
		<tr>
			<td><code>defaultLocale</code></td>
			<td><code>keyof locales</code></td>
			<td>the configured fallback locale</td>
		</tr>
		<tr>
			<td><code>changeLanguage</code></td>
			<td><code>(locale) =&gt; Promise&lt;void&gt;</code></td>
			<td>switch and persist the locale; throws <code>TypeError</code> on unknown locales, so
				garbage can never be persisted</td>
		</tr>
	</tbody>
</table>

<h2>persistent storage</h2>
<p>
	the default <code>MemoryStorage</code> is lost on restart. pass any
	<code>StorageAdapter&lt;string&gt;</code> (same interface as <code>@yaebal/session</code>) to
	persist locales across restarts. a stored value that no longer matches a configured locale is
	ignored instead of poisoning the chat.
</p>
<Code code={persistStorage} title="redis-locale.ts" />

<h2>per-user locale</h2>
<p>override <code>getKey</code> to partition by user instead of chat.</p>
<Code code={perUser} title="per-user.ts" />

<h2>pluralization</h2>
<p>
	a translation value can be a <code>PluralDict</code> instead of a string — an object keyed by
	<code>Intl.PluralRules</code> categories. pass the count as the <code>n</code> param; the
	category is chosen with the rules of the locale <em>that supplied the forms</em>, so a fallback
	string keeps its own language's grammar. a plural value without a numeric <code>n</code> is a
	compile error from typed code and a <code>TypeError</code> from untyped code.
</p>
<Code code={plurals} title="plurals.ts" />

<h2>formatted translations</h2>
<p>
	a dict value can be a function of typed params. return an
	<code>html</code>/<code>md</code>/<code>format</code> result from
	<a href="/docs/plugins/fmt/">@yaebal/fmt</a> or core and the translation carries entities — the
	function's return type flows through <code>ctx.t</code>.
</p>
<Code code={formatted} title="formatted.ts" />

<h2>outside middleware</h2>
<p>
	<code>createI18n</code> builds the translator with no bot wiring — for
	<a href="/docs/plugins/broadcast/">broadcasts</a>, scheduled jobs, or per-locale command menus —
	and the plugin can share the same instance.
</p>
<Code code={standalone} title="standalone.ts" />

<h2>fallback behaviour</h2>
<Code code={fallback} title="fallback.ts" />

<h2>testing</h2>
<p>
	with <a href="/docs/plugins/test/">@yaebal/test</a>, actors carry a
	<code>languageCode</code>, so detection and persistence are testable without any network.
</p>
<Code code={testing} title="i18n.test.ts" />

<div class="note">
	<strong>interpolation uses <code>&#123;placeholder&#125;</code> syntax</strong>, not template
	literals. replacement is a single pass via <code>String(value)</code>; unknown placeholders stay
	verbatim and param values are never re-parsed.
	<br /><br />
	<strong>changeLanguage takes effect immediately</strong> within the current handler — calls to
	<code>ctx.t</code> and reads of <code>ctx.locale</code> after
	<code>await ctx.changeLanguage("ru")</code> use the new locale. the next update loads the
	persisted locale from storage.
	<br /><br />
	<strong>updates without a chat or user</strong> (where <code>getKey</code> returns
	<code>undefined</code>) still detect via <code>language_code</code> when present, but never
	persist.
	<br /><br />
	<strong>plural-lookalike namespaces:</strong> an object whose keys are <em>all</em> plural
	categories (with <code>other</code> present, all strings) is a plural set; any other object
	nests. <code>&#123; other: "…", first: "…" &#125;</code> therefore nests as
	<code>x.other</code> / <code>x.first</code>.
</div>

<p>
	see it in a bigger bot: <a
		href="https://github.com/neverlane/yaebal/tree/master/examples/basic">examples/basic</a>
	and
	<a href="https://github.com/neverlane/yaebal/tree/master/examples/commerce-suite"
		>examples/commerce-suite</a
	>.
</p>
