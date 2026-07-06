import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createI18n, type Dict, i18n, type LocaleLike } from "./index.js";

// this file is primarily a compile-time suite: every `@ts-expect-error` below
// is an assertion that the typed surface rejects the line. it compiles with the
// package, so `pnpm typecheck` is the actual test runner here.

const en = {
	hi: "Hello {name}",
	bye: "Bye",
	items: { one: "{n} item", other: "{n} items" },
	menu: { title: "Menu" },
	styled: (p: { user: string }) => ({ text: p.user, entities: [] }),
} as const satisfies Dict;

const ru = { hi: "Привет {name}" } as const satisfies LocaleLike<typeof en>;

// @ts-expect-error a key that does not exist in the base locale
const ruBadKey = { hii: "x" } as const satisfies LocaleLike<typeof en>;

// @ts-expect-error nesting must match the base locale's shape
const ruBadShape = { menu: "flat" } as const satisfies LocaleLike<typeof en>;

const strings = createI18n({ defaultLocale: "en", locales: { en, ru } });

// compile-only: never invoked — each line asserts the typed surface rejects it
const rejections = () => {
	// @ts-expect-error unknown key
	strings.t("en", "nope");
	// @ts-expect-error a parametrized template requires its params
	strings.t("en", "hi");
	// @ts-expect-error wrong param name
	strings.t("en", "hi", { nom: "x" });
	// @ts-expect-error a plural value requires a numeric `n`
	strings.t("en", "items", {});
	// @ts-expect-error a bare string takes no params
	strings.t("en", "bye", { x: 1 });
	// @ts-expect-error a function value's params are its declared parameter type
	strings.t("en", "styled", { user: 1 });
	// @ts-expect-error a function value's return type is not a string
	const wrong: string = strings.t("en", "styled", { user: "x" });
	return wrong;
};

test("typed keys, params and return types (compile-time)", () => {
	// happy paths — keys autocomplete, params are exact, returns are typed
	const s: string = strings.t("en", "hi", { name: "x" });
	const nested: string = strings.t("en", "menu.title");
	const plural: string = strings.t("en", "items", { n: 2 });
	const styled: { text: string } = strings.t("en", "styled", { user: "x" });

	assert.equal(s, "Hello x");
	assert.equal(nested, "Menu");
	assert.equal(plural, "2 items");
	assert.deepEqual(styled, { text: "x", entities: [] });
	assert.equal(typeof rejections, "function");
	assert.ok(ruBadKey);
	assert.ok(ruBadShape);
});

test("the plugin's context surface is typed (compile-time)", () => {
	const composer = new Composer<Context>()
		.install(i18n({ defaultLocale: "en", locales: { en, ru } }))
		.use((ctx, next) => {
			const hi: string = ctx.t("hi", { name: "x" });
			const locale: "en" | "ru" = ctx.locale;
			const all: readonly ("en" | "ru")[] = ctx.locales;

			// @ts-expect-error unknown key
			ctx.t("nope");
			// @ts-expect-error missing params
			ctx.t("hi");
			// @ts-expect-error changeLanguage only accepts configured locales
			void ctx.changeLanguage("de");

			assert.ok(hi !== undefined && locale !== undefined && all !== undefined);
			return next();
		});

	assert.ok(composer);
});
