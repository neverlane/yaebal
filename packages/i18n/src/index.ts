import type { Context, Plugin } from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/session";

// ————————————————————————— dictionary values —————————————————————————

/** `Intl.PluralRules` categories — the keys a {@link PluralDict} may carry. */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/**
 * a plural form set keyed by `Intl.PluralRules` categories. `other` is required
 * as the fallback; the rest are optional and selected per locale via
 * `new Intl.PluralRules(locale).select(n)` — pass the number as the `n` param.
 */
export interface PluralDict {
	zero?: string;
	one?: string;
	two?: string;
	few?: string;
	many?: string;
	other: string;
}

/**
 * a computed value: receives the (typed) params and returns anything — most
 * usefully a `FormatResult` from core's `format` or `@yaebal/fmt`'s `html`/`md`,
 * so a translation carries entity formatting instead of plain text. the return
 * type flows through `ctx.t`, and `{ text, entities }` is accepted by
 * `reply`/`send` directly.
 */
export type DictFn = (params: never) => unknown;

/** a single translation value: a template string, plural forms, or a function. */
export type DictValue = string | PluralDict | DictFn;

/**
 * a translation table. string values interpolate `{placeholder}`s; an object
 * whose keys are all plural categories (and include `other`, all strings) is a
 * plural set; functions compute their value from typed params; any other
 * object nests — its leaves are addressed as `"parent.child"`.
 */
export interface Dict {
	[key: string]: DictValue | Dict;
}

// ————————————————————————— type machinery —————————————————————————

/** interpolation param values — rendered with `String()`. */
export type ParamValue = string | number | bigint | boolean;

/** placeholder names of a template literal type: `"hi {name}!"` → `"name"`. */
export type ParamNames<S extends string> = S extends `${string}{${infer P}}${infer Rest}`
	? P | ParamNames<Rest>
	: never;

type IsPlural<V> = [V] extends [PluralDict]
	? [Exclude<keyof V, keyof PluralDict>] extends [never]
		? true
		: false
	: false;

/** every addressable key of a dict, nested leaves as `"parent.child"`. */
export type DictKeys<D> = {
	[K in keyof D & string]: [D[K]] extends [string]
		? K
		: [D[K]] extends [DictFn]
			? K
			: IsPlural<D[K]> extends true
				? K
				: D[K] extends Dict
					? `${K}.${DictKeys<D[K]>}`
					: K;
}[keyof D & string];

/** the value a (possibly dotted) key resolves to. a literal dotted key wins. */
export type DictValueAt<D, K extends string> = K extends keyof D
	? D[K]
	: K extends `${infer Head}.${infer Rest}`
		? Head extends keyof D
			? DictValueAt<D[Head], Rest>
			: never
		: never;

type FnArgs<F extends DictFn> =
	Parameters<F> extends [] ? [] : F extends (params: infer P) => unknown ? [params: P] : never;

type PluralArgs<V extends PluralDict> =
	string extends Extract<V[keyof V], string>
		? [params: { n: number } & Record<string, ParamValue>]
		: [
				params: { n: number } & {
					[P in Exclude<ParamNames<Extract<V[keyof V], string>>, "n">]: ParamValue;
				},
			];

/** the params tuple `t` expects for a given dict value. */
export type TArgs<V> = [V] extends [string]
	? string extends V
		? [params?: Record<string, ParamValue>]
		: [ParamNames<V>] extends [never]
			? []
			: [params: { [P in ParamNames<V>]: ParamValue }]
	: [V] extends [DictFn]
		? FnArgs<V>
		: [V] extends [PluralDict]
			? PluralArgs<V>
			: [params?: Record<string, ParamValue>];

/** what `t` returns for a given dict value: functions keep their return type. */
export type TReturn<V> = [V] extends [(params: never) => infer R] ? R : string;

/**
 * the translate function: keys, params and return types all derive from the
 * default locale's dict. with a plain (widened) dict it degrades to
 * `(key, params?) => string` — declare dicts `as const` for full inference.
 */
export type TFn<D extends Dict = Dict> = <K extends DictKeys<D>>(
	key: K,
	...params: TArgs<DictValueAt<D, K>>
) => TReturn<DictValueAt<D, K>>;

/**
 * shape-check helper for non-default locales: every key optional (missing keys
 * fall back to the default locale), nesting must match, leaf kinds may differ
 * (a string in the base may be a plural set in a translation and vice versa).
 *
 * @example
 * const en = { hi: "hi {name}" } as const satisfies Dict;
 * const ru = { hi: "привет {name}" } as const satisfies LocaleLike<typeof en>;
 */
export type LocaleLike<Base extends Dict> = {
	[K in keyof Base]?: IsPlural<Base[K]> extends true
		? DictValue
		: Base[K] extends string | DictFn
			? DictValue
			: Base[K] extends Dict
				? LocaleLike<Base[K]>
				: DictValue;
};

// ————————————————————————— options —————————————————————————

/** options for {@link createI18n} — the pure translator, no bot wiring. */
export interface CreateI18nOptions<
	Locales extends Record<string, Dict>,
	Default extends keyof Locales & string,
> {
	/** the fallback locale; its dict defines the typed key set. */
	defaultLocale: Default;
	/** locale → translation table. */
	locales: Locales;
	/**
	 * called when a key is missing in every locale. return a replacement
	 * string, or `undefined` to fall back to the key itself.
	 */
	onMissingKey?: (key: string, locale: string) => string | undefined;
}

/** the bot-facing knobs of the {@link i18n} plugin. */
export interface I18nPluginOptions {
	/** where to persist each chat's locale. defaults to in-memory. */
	storage?: StorageAdapter<string>;
	/** storage key for an update. default: chat id, falling back to user id. */
	getKey?: (ctx: Context) => string | undefined;
	/**
	 * first-contact locale detection, used only when nothing is stored yet.
	 * the returned tag is matched against the configured locales (exact, then
	 * base language: `"pt-BR"` → `"pt"`). default: `ctx.from?.language_code`.
	 */
	detectLocale?: (ctx: Context) => string | undefined;
}

export type I18nOptions<
	Locales extends Record<string, Dict>,
	Default extends keyof Locales & string,
> = CreateI18nOptions<Locales, Default> & I18nPluginOptions;

// ————————————————————————— standalone instance —————————————————————————

/**
 * a standalone translator — usable outside middleware (broadcasts, jobs,
 * command menus) and shareable with the {@link i18n} plugin.
 */
export interface I18n<
	Locales extends Record<string, Dict> = Record<string, Dict>,
	Default extends keyof Locales & string = keyof Locales & string,
> {
	/** translate `key` in `locale`; unknown locales fall back to the default. */
	t<K extends DictKeys<Locales[Default]>>(
		locale: string,
		key: K,
		...params: TArgs<DictValueAt<Locales[Default], K>>
	): TReturn<DictValueAt<Locales[Default], K>>;
	/** every configured locale, in declaration order. */
	readonly locales: readonly (keyof Locales & string)[];
	readonly defaultLocale: Default;
	/** whether `locale` is configured. */
	has(locale: string): locale is keyof Locales & string;
	/**
	 * map an IETF tag (e.g. telegram's `language_code`) onto a configured
	 * locale: exact match first, then the base language (`"pt-BR"` → `"pt"`).
	 */
	resolveLocale(tag: string | null | undefined): (keyof Locales & string) | undefined;
}

/** what the plugin adds to the context. powers morda/jsx `useTranslation`. */
export interface I18nControls<D extends Dict = Dict, L extends string = string> {
	t: TFn<D>;
	/** the active locale for this update (live — reflects `changeLanguage`). */
	readonly locale: L;
	/** every configured locale, in declaration order. */
	readonly locales: readonly L[];
	readonly defaultLocale: L;
	/** switch and persist the locale. throws `TypeError` on unknown locales. */
	changeLanguage(locale: L): Promise<void>;
}

// ————————————————————————— runtime —————————————————————————

type FlatLeaf = string | PluralDict | ((params: unknown) => unknown);

const PLURAL_KEYS: ReadonlySet<string> = new Set(["zero", "one", "two", "few", "many", "other"]);

const isPluralDict = (value: object): value is PluralDict =>
	typeof (value as PluralDict).other === "string" &&
	Object.entries(value).every(([k, v]) => PLURAL_KEYS.has(k) && typeof v === "string");

const flatten = (dict: Dict, prefix = "", out = new Map<string, FlatLeaf>()) => {
	for (const [key, value] of Object.entries(dict)) {
		const path = prefix + key;
		if (typeof value === "string" || typeof value === "function") {
			out.set(path, value as FlatLeaf);
		} else if (isPluralDict(value)) {
			out.set(path, value);
		} else {
			flatten(value, `${path}.`, out);
		}
	}
	return out;
};

/** build a standalone {@link I18n} translator (no bot wiring, no storage). */
export function createI18n<
	const Locales extends Record<string, Dict>,
	Default extends keyof Locales & string,
>(options: CreateI18nOptions<Locales, Default>): I18n<Locales, Default> {
	const { defaultLocale, onMissingKey } = options;

	const dicts = new Map<string, Map<string, FlatLeaf>>();
	for (const [locale, dict] of Object.entries<Dict>(options.locales)) {
		dicts.set(locale, flatten(dict));
	}

	// per-locale plural rules, resolved lazily; a locale that isn't a valid
	// BCP-47 tag falls back to the default locale's rules, then to `other`.
	const rulesCache = new Map<string, Intl.PluralRules | null>();
	const rules = (locale: string): Intl.PluralRules | null => {
		const hit = rulesCache.get(locale);
		if (hit !== undefined) return hit;
		let built: Intl.PluralRules | null = null;
		try {
			built = new Intl.PluralRules(locale);
		} catch {
			built = locale === defaultLocale ? null : rules(defaultLocale);
		}
		rulesCache.set(locale, built);
		return built;
	};

	const interpolate = (template: string, params: Record<string, unknown>): string =>
		template.replace(/\{([^{}]+)\}/g, (match, name: string) => {
			const value = params[name];
			return value === undefined ? match : String(value);
		});

	const translate = (locale: string, key: string, params?: Record<string, unknown>): unknown => {
		// resolve the leaf and remember which locale it came from, so plural
		// category selection uses the rules of the language actually shown.
		let source = dicts.has(locale) ? locale : defaultLocale;
		let leaf = dicts.get(source)?.get(key);
		if (leaf === undefined && source !== defaultLocale) {
			source = defaultLocale;
			leaf = dicts.get(defaultLocale)?.get(key);
		}
		if (leaf === undefined) return onMissingKey?.(key, locale) ?? key;

		if (typeof leaf === "function") return leaf(params);

		let text: string;
		if (typeof leaf === "string") {
			text = leaf;
		} else {
			const n = params?.n;
			if (typeof n !== "number") {
				throw new TypeError(
					`t("${key}"): a plural value needs a numeric \`n\` param, got ${typeof n}`,
				);
			}
			const category = rules(source)?.select(n) ?? "other";
			text = leaf[category] ?? leaf.other;
		}

		// single pass, so a param value can never be re-parsed as a placeholder;
		// unknown placeholders are left verbatim.
		return params === undefined ? text : interpolate(text, params);
	};

	return {
		t: translate as I18n<Locales, Default>["t"],
		locales: Object.freeze(Object.keys(options.locales)) as readonly (keyof Locales & string)[],
		defaultLocale,
		has: (locale): locale is keyof Locales & string => dicts.has(locale),
		resolveLocale(tag) {
			if (!tag) return undefined;
			if (dicts.has(tag)) return tag as keyof Locales & string;
			const lower = tag.toLowerCase();
			if (dicts.has(lower)) return lower as keyof Locales & string;
			const base = lower.split("-", 1)[0] ?? lower;
			if (dicts.has(base)) return base as keyof Locales & string;
			return undefined;
		},
	};
}

// ————————————————————————— plugin —————————————————————————

/**
 * i18n plugin. adds `ctx.t` / `ctx.locale` / `ctx.locales` /
 * `ctx.changeLanguage`, with the active locale persisted per chat. keys,
 * params and return types are inferred from the default locale's dict.
 *
 * locale resolution per update: stored locale (if still configured) →
 * `detectLocale` (telegram's `language_code` by default) → `defaultLocale`.
 * missing keys fall back to the default locale, then to the key itself.
 */
export function i18n<
	const Locales extends Record<string, Dict>,
	Default extends keyof Locales & string,
>(
	options: I18nOptions<Locales, Default>,
): Plugin<Context, I18nControls<Locales[Default], keyof Locales & string>>;
/** wire an existing {@link createI18n} instance into a bot. */
export function i18n<Locales extends Record<string, Dict>, Default extends keyof Locales & string>(
	instance: I18n<Locales, Default>,
	options?: I18nPluginOptions,
): Plugin<Context, I18nControls<Locales[Default], keyof Locales & string>>;
export function i18n(
	first: I18nOptions<Record<string, Dict>, string> | I18n,
	second?: I18nPluginOptions,
): Plugin<Context, I18nControls> {
	const fromInstance = typeof (first as I18n).t === "function";
	const instance = fromInstance
		? (first as I18n)
		: createI18n(first as CreateI18nOptions<Record<string, Dict>, string>);
	const plugin: I18nPluginOptions = fromInstance ? (second ?? {}) : (first as I18nPluginOptions);

	const storage = plugin.storage ?? new MemoryStorage<string>();
	const getKey = plugin.getKey ?? ((ctx: Context) => (ctx.chat?.id ?? ctx.from?.id)?.toString());
	const detectLocale = plugin.detectLocale ?? ((ctx: Context) => ctx.from?.language_code);

	return (composer) =>
		composer.derive(async (ctx): Promise<I18nControls> => {
			const key = getKey(ctx);
			const stored = key !== undefined ? await storage.get(key) : undefined;

			// a stored locale that is no longer configured is ignored, so stale
			// storage can never poison a chat.
			let current: string =
				(stored !== undefined && instance.has(stored) ? stored : undefined) ??
				instance.resolveLocale(detectLocale(ctx)) ??
				instance.defaultLocale;

			const t = ((k: string, params?: Record<string, unknown>) =>
				(instance.t as (l: string, k: string, p?: Record<string, unknown>) => string)(
					current,
					k,
					params,
				)) as TFn;

			const changeLanguage = async (next: string): Promise<void> => {
				if (!instance.has(next)) {
					throw new TypeError(
						`changeLanguage("${next}"): unknown locale — configured: ${instance.locales.join(", ")}`,
					);
				}
				// persist first: if the storage write throws, this update and the
				// next one still agree on the locale.
				if (key !== undefined) await storage.set(key, next);
				current = next;
				// `derive` merges with Object.assign, so `locale` lives on the
				// context as a data property — keep it in sync by hand.
				(ctx as unknown as { locale: string }).locale = next;
			};

			return {
				t,
				locale: current,
				locales: instance.locales,
				defaultLocale: instance.defaultLocale,
				changeLanguage,
			};
		});
}
