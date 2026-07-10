import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/sklad";
import { createTestEnv } from "@yaebal/test";
import { createI18n, type Dict, i18n, type LocaleLike } from "./index.js";

const en = {
	hi: "Hello {name}",
	bye: "Bye",
	pair: "{a} and {b}",
	"a.b": "dotted literal",
	items: { one: "{n} item", other: "{n} items" },
	stock: { one: "{n} box", other: "{n} boxes" },
	menu: { title: "Menu", opts: { other: "Other", first: "First" } },
	styled: (p: { name: string }) => ({ text: `hi ${p.name}`, entities: [] }),
} as const satisfies Dict;

const ru = {
	hi: "Привет {name}",
	items: {
		one: "{n} предмет",
		few: "{n} предмета",
		many: "{n} предметов",
		other: "{n} предмета",
	},
	menu: { title: "Меню" },
} as const satisfies LocaleLike<typeof en>;

const locales = { en, ru };

/** loose escape hatch for runtime tests that exercise deliberately-invalid input. */
const loose = (t: unknown) => t as (key: string, params?: Record<string, unknown>) => string;

test("t interpolates params and falls back to the key", async () => {
	let hi = "";
	let missing = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			hi = ctx.t("hi", { name: "Sam" });
			missing = loose(ctx.t)("nope");
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");

	assert.equal(hi, "Hello Sam");
	assert.equal(missing, "nope");
});

test("interpolation is a single pass — param values are never re-parsed", async () => {
	let out = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			out = ctx.t("pair", { a: "{b}", b: "Z" });
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");

	// a naive sequential replace would produce "Z and Z"
	assert.equal(out, "{b} and Z");
});

test("unknown placeholders are left verbatim", async () => {
	let out = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			out = loose(ctx.t)("hi", { other: "x" });
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.equal(out, "Hello {name}");
});

test("nested keys, dotted literals, and plural-lookalike namespaces", async () => {
	let title = "";
	let dotted = "";
	let opt = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			title = ctx.t("menu.title");
			dotted = ctx.t("a.b");
			// `opts` has an `other` key but also `first`, so it nests instead of pluralizing
			opt = ctx.t("menu.opts.other");
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");

	assert.equal(title, "Menu");
	assert.equal(dotted, "dotted literal");
	assert.equal(opt, "Other");
});

test("function values receive params and their return type flows through t", async () => {
	let out: { text: string } | undefined;

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			out = ctx.t("styled", { name: "sam" });
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.deepEqual(out, { text: "hi sam", entities: [] });
});

test("changeLanguage switches the active locale within the handler", async () => {
	let after = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use(async (ctx, next) => {
			await ctx.changeLanguage("ru");
			after = ctx.t("hi", { name: "Х" });
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.equal(after, "Привет Х");
});

test("locale persists per chat across updates", async () => {
	const storage = new MemoryStorage<string>();
	let seen = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales, storage }))
		.use(async (ctx, next) => {
			if (ctx.locale === "en") await ctx.changeLanguage("ru");
			seen = ctx.locale;
			return next();
		});

	const user = createTestEnv(bot).createUser();
	await user.sendMessage("x"); // en → switches to ru
	await user.sendMessage("x"); // loads ru
	assert.equal(seen, "ru");
});

test("changeLanguage rejects unknown locales and persists nothing", async () => {
	const storage = new MemoryStorage<string>();
	let localeAfter = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales, storage }))
		.use(async (ctx, next) => {
			await assert.rejects(ctx.changeLanguage("de" as never), TypeError);
			localeAfter = ctx.locale;
			return next();
		});

	const user = createTestEnv(bot).createUser({ id: 501 });
	await user.sendMessage("x");

	assert.equal(localeAfter, "en");
	assert.equal(await storage.get("501"), undefined);
});

test("a stale stored locale is ignored instead of poisoning the chat", async () => {
	const storage = new MemoryStorage<string>();
	await storage.set("502", "definitely not a locale");
	let out = "";
	let locale = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales, storage }))
		.use((ctx, next) => {
			locale = ctx.locale;
			out = ctx.t("items", { n: 2 }); // plurals must not throw on garbage storage
			return next();
		});

	await createTestEnv(bot).createUser({ id: 502 }).sendMessage("x");

	assert.equal(locale, "en");
	assert.equal(out, "2 items");
});

test("first contact: locale is detected from telegram's language_code", async () => {
	let hi = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			hi = ctx.t("hi", { name: "Юра" });
			return next();
		});

	await createTestEnv(bot).createUser({ languageCode: "ru" }).sendMessage("x");
	assert.equal(hi, "Привет Юра");
});

test("detection resolves regional tags to their base language", async () => {
	let locale = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales: { en, pt: { hi: "Olá {name}" } } }))
		.use((ctx, next) => {
			locale = ctx.locale;
			return next();
		});

	await createTestEnv(bot).createUser({ languageCode: "pt-BR" }).sendMessage("x");
	assert.equal(locale, "pt");
});

test("an undetectable language_code falls back to the default locale", async () => {
	let locale = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			locale = ctx.locale;
			return next();
		});

	await createTestEnv(bot).createUser({ languageCode: "de" }).sendMessage("x");
	assert.equal(locale, "en");
});

test("a stored locale beats detection", async () => {
	const storage = new MemoryStorage<string>();
	const seen: string[] = [];

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales, storage }))
		.use(async (ctx, next) => {
			if (seen.length === 0) await ctx.changeLanguage("en");
			seen.push(ctx.locale);
			return next();
		});

	const user = createTestEnv(bot).createUser({ languageCode: "ru" });
	await user.sendMessage("x"); // detected ru, then pinned to en
	await user.sendMessage("x"); // stored en wins over detected ru
	assert.deepEqual(seen, ["en", "en"]);
});

test("plural selection follows the locale's Intl.PluralRules (en)", async () => {
	let one = "";
	let other = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			one = ctx.t("items", { n: 1 });
			other = ctx.t("items", { n: 2 });
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.equal(one, "1 item");
	assert.equal(other, "2 items");
});

test("plural selection follows the locale's Intl.PluralRules (ru)", async () => {
	let one = "";
	let few = "";
	let many = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use(async (ctx, next) => {
			await ctx.changeLanguage("ru");
			one = ctx.t("items", { n: 1 });
			few = ctx.t("items", { n: 2 });
			many = ctx.t("items", { n: 5 });
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.equal(one, "1 предмет");
	assert.equal(few, "2 предмета");
	assert.equal(many, "5 предметов");
});

test("plural fallback uses the rules of the locale that supplied the forms", async () => {
	let out = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use(async (ctx, next) => {
			await ctx.changeLanguage("ru");
			// "stock" exists only in en; ru rules would pick `one` for 21 ("21 box")
			out = ctx.t("stock", { n: 21 });
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.equal(out, "21 boxes");
});

test("a plural value without a numeric n throws a TypeError", async () => {
	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			assert.throws(() => loose(ctx.t)("items"), TypeError);
			assert.throws(() => loose(ctx.t)("items", { n: "5" }), TypeError);
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
});

test("missing key in a locale falls back to the default locale", async () => {
	let bye = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use(async (ctx, next) => {
			await ctx.changeLanguage("ru"); // ru has no "bye"
			bye = ctx.t("bye");
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.equal(bye, "Bye");
});

test("onMissingKey overrides the key fallback", async () => {
	let out = "";

	const bot = new Composer<Context>()
		.install(
			i18n({
				defaultLocale: "en",
				locales,
				onMissingKey: (key, locale) => `[${locale}:${key}]`,
			}),
		)
		.use((ctx, next) => {
			out = loose(ctx.t)("nope");
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.equal(out, "[en:nope]");
});

test("the context exposes locales and defaultLocale", async () => {
	let list: readonly string[] = [];
	let def = "";

	const bot = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			list = ctx.locales;
			def = ctx.defaultLocale;
			return next();
		});

	await createTestEnv(bot).createUser().sendMessage("x");
	assert.deepEqual([...list], ["en", "ru"]);
	assert.equal(def, "en");
});

test("createI18n works standalone, outside any middleware", () => {
	const strings = createI18n({ defaultLocale: "en", locales });

	assert.equal(strings.t("ru", "hi", { name: "Х" }), "Привет Х");
	assert.equal(strings.t("en", "items", { n: 2 }), "2 items");
	assert.equal(strings.t("no-such-locale", "hi", { name: "S" }), "Hello S");
	assert.deepEqual([...strings.locales], ["en", "ru"]);
	assert.equal(strings.defaultLocale, "en");
	assert.equal(strings.has("ru"), true);
	assert.equal(strings.has("de"), false);
	assert.equal(strings.resolveLocale("RU"), "ru");
	assert.equal(strings.resolveLocale("pt-BR"), undefined);
	assert.equal(strings.resolveLocale(undefined), undefined);
});

test("the plugin accepts a shared createI18n instance", async () => {
	const strings = createI18n({ defaultLocale: "en", locales });
	const storage = new MemoryStorage<string>();
	let fromCtx = "";

	const bot = new Composer<Context>().install(i18n(strings, { storage })).use(async (ctx, next) => {
		await ctx.changeLanguage("ru");
		fromCtx = ctx.t("hi", { name: "Х" });
		return next();
	});

	await createTestEnv(bot).createUser({ id: 503 }).sendMessage("x");

	assert.equal(fromCtx, "Привет Х");
	assert.equal(await storage.get("503"), "ru");
	// the same instance keeps serving ctx-less code
	assert.equal(strings.t("en", "bye"), "Bye");
});
