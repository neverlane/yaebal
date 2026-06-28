import type { Context, Plugin } from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/session";

/**
 * a plural form set keyed by `Intl.PluralRules` categories. `other` is required
 * as the fallback; the rest are optional and selected per locale via
 * `new Intl.PluralRules(locale).select(n)`.
 */
export interface PluralDict {
	zero?: string;
	one?: string;
	two?: string;
	few?: string;
	many?: string;
	other: string;
}

/** a single translation value: a plain template or a set of plural forms. */
export type DictValue = string | PluralDict;

/**
 * a translation table: key → template (with `{placeholder}` interpolation), or
 * key → plural forms (selected by `{n}` via `Intl.PluralRules`).
 */
export type Dict = Record<string, DictValue>;

export type TFn = (key: string, params?: Record<string, unknown>) => string;

/** what the plugin adds to the context. powers morda/jsx `useTranslation`. */
export interface I18nControls {
	t: TFn;
	locale: string;
	changeLanguage(locale: string): Promise<void>;
}

export interface I18nOptions<L extends string> {
	defaultLocale: L;
	locales: Record<L, Dict>;
	/** where to persist each chat's locale. defaults to in-memory. */
	storage?: StorageAdapter<string>;
	/** locale key for an update. default: per-chat (`ctx.chat.id`). */
	getKey?: (ctx: Context) => string | undefined;
}

/**
 * i18n plugin. adds `ctx.t` / `ctx.locale` / `ctx.changeLanguage`, with the
 * active locale persisted per chat. missing keys fall back to the default
 * locale, then to the key itself.
 */
export function i18n<L extends string>(options: I18nOptions<L>): Plugin<Context, I18nControls> {
	const { defaultLocale, locales } = options;

	const storage = options.storage ?? new MemoryStorage<string>();
	const getKey = options.getKey ?? ((ctx: Context) => ctx.chat?.id?.toString());

	return (composer) =>
		composer.derive(async (ctx): Promise<I18nControls> => {
			const key = getKey(ctx);
			let locale: string =
				(key !== undefined ? await storage.get(key) : undefined) ?? defaultLocale;

			const t: TFn = (k, params) => {
				const def: Dict = locales[defaultLocale] ?? {};
				const dict: Dict = locales[locale as L] ?? def;
				const raw: DictValue = dict[k] ?? def[k] ?? k;

				let s: string;
				if (typeof raw === "string") {
					s = raw;
				} else {
					const n = params?.n;
					const category = typeof n === "number" ? new Intl.PluralRules(locale).select(n) : "other";

					s = raw[category as keyof PluralDict] ?? raw.other;
				}

				if (params) {
					for (const [pk, pv] of Object.entries(params)) s = s.replaceAll(`{${pk}}`, String(pv));
				}
				
				return s;
			};

			const changeLanguage = async (next: string): Promise<void> => {
				locale = next;
				if (key !== undefined) await storage.set(key, next);
			};

			return { t, locale, changeLanguage };
		});
}
