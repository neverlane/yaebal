import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { MemoryStorage } from "@yaebal/session";
import { type I18nControls, i18n } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

const api = {} as never;
const ctxFor = (chatId: number) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat: { id: chatId, type: "private" },
				from: { id: chatId, is_bot: false, first_name: "u" },
				text: "hi",
			},
		} as never,
		updateType: "message",
	});

const locales = {
	en: {
		hi: "Hello {name}",
		bye: "Bye",
		items: { one: "{n} item", other: "{n} items" },
	},
	ru: {
		hi: "Привет {name}",
		items: {
			one: "{n} предмет",
			few: "{n} предмета",
			many: "{n} предметов",
			other: "{n} предмета",
		},
	},
};

type Ctx = Context & I18nControls;

test("t interpolates params and falls back to the key", async () => {
	let hi = "";
	let missing = "";

	const c = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			hi = (ctx as Ctx).t("hi", { name: "Sam" });
			missing = (ctx as Ctx).t("nope");

			return next();
		});

	await entry(c)(ctxFor(1), noop);

	assert.equal(hi, "Hello Sam");
	assert.equal(missing, "nope");
});

test("changeLanguage switches the active locale within the handler", async () => {
	let after = "";

	const c = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use(async (ctx, next) => {
			await (ctx as Ctx).changeLanguage("ru");

			after = (ctx as Ctx).t("hi", { name: "Х" });
			return next();
		});

	await entry(c)(ctxFor(2), noop);

	assert.equal(after, "Привет Х");
});

test("locale persists per chat across updates", async () => {
	const storage = new MemoryStorage<string>();

	let seen = "";

	const c = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales, storage }))
		.use(async (ctx, next) => {
			const x = ctx as Ctx;

			if (x.t("hi", { name: "a" }) === "Hello a") await x.changeLanguage("ru");

			seen = x.locale;
			return next();
		});

	const mw = entry(c);
	await mw(ctxFor(3), noop); // en → switches to ru
	await mw(ctxFor(3), noop); // loads ru

	assert.equal(seen, "ru");
});

test("plural selection follows the locale's Intl.PluralRules (en)", async () => {
	let one = "";
	let other = "";

	const c = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			const x = ctx as Ctx;

			one = x.t("items", { n: 1 });
			other = x.t("items", { n: 2 });

			return next();
		});

	await entry(c)(ctxFor(10), noop);
	assert.equal(one, "1 item"); // en: 1 → one
	assert.equal(other, "2 items"); // en: 2 → other
});

test("plural selection follows the locale's Intl.PluralRules (ru)", async () => {
	let one = "";
	let few = "";
	let many = "";
	const c = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use(async (ctx, next) => {
			const x = ctx as Ctx;
			await x.changeLanguage("ru");

			one = x.t("items", { n: 1 });
			few = x.t("items", { n: 2 });
			many = x.t("items", { n: 5 });

			return next();
		});

	await entry(c)(ctxFor(11), noop);

	assert.equal(one, "1 предмет"); // ru: 1 → one
	assert.equal(few, "2 предмета"); // ru: 2 → few
	assert.equal(many, "5 предметов"); // ru: 5 → many
});

test("plain-string keys keep working alongside plural objects (regression)", async () => {
	let hi = "";
	let bye = "";

	const c = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			const x = ctx as Ctx;

			hi = x.t("hi", { name: "Sam" }); // interpolated plain string
			bye = x.t("bye"); // bare plain string

			return next();
		});

	await entry(c)(ctxFor(12), noop);
	assert.equal(hi, "Hello Sam");
	assert.equal(bye, "Bye");
});

test("interpolation works inside a chosen plural form", async () => {
	let s = "";

	const c = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use((ctx, next) => {
			s = (ctx as Ctx).t("items", { n: 42 });

			return next();
		});

	await entry(c)(ctxFor(13), noop);
	assert.equal(s, "42 items"); // 42 → other, {n} interpolated
});

test("missing key in a locale falls back to the default locale", async () => {
	let bye = "";
	const c = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales }))
		.use(async (ctx, next) => {
			await (ctx as Ctx).changeLanguage("ru"); // ru has no "bye"

			bye = (ctx as Ctx).t("bye");

			return next();
		});

	await entry(c)(ctxFor(4), noop);
	assert.equal(bye, "Bye"); // fell back to en
});
