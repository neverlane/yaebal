import type { Api, Bot, BotPlugin, Context } from "@yaebal/core";

/**
 * @yaebal/sentry — sentry error tracking for yaebal. every update runs in its own isolation
 * scope tagged with the update type, chat and (opt-in) user, failing handlers are captured with
 * that scope before `bot.onError` sees them, and updates plus bot api calls leave breadcrumbs —
 * so an error report shows what the bot was doing right before it.
 *
 * pass the sentry sdk you already initialized (`@sentry/node`, `@sentry/bun`, `@sentry/deno`,
 * `@sentry/cloudflare`, …): the plugin reads it structurally, so it carries no sentry
 * dependency of its own and never fights your sdk version.
 */

/** the slice of a sentry scope this plugin touches. */
export interface SentryScopeLike {
	setTag(key: string, value: string | number | boolean | undefined): unknown;
	setUser(user: { id?: string | number; username?: string } | null): unknown;
	setContext(name: string, context: Record<string, unknown> | null): unknown;
	setExtra(key: string, value: unknown): unknown;
}

/** the slice of a sentry sdk (`import * as Sentry from "@sentry/node"`) this plugin uses. */
export interface SentryLike {
	withIsolationScope<T>(callback: (scope: SentryScopeLike) => T): T;
	captureException(exception: unknown, hint?: unknown): string;
	captureMessage(message: string, level?: unknown): string;
	addBreadcrumb(breadcrumb: {
		category?: string;
		message?: string;
		level?: "debug" | "info" | "warning" | "error";
		data?: Record<string, unknown>;
	}): unknown;
}

export interface SentryOptions {
	/** the initialized sentry sdk. */
	sentry: SentryLike;
	/**
	 * attach the sender (`id`, `username`) as the sentry user. off by default — user ids are
	 * personal data; turn it on when your sentry project is set up for that.
	 */
	setUser?: boolean;
	/** breadcrumbs for each update and bot api call. default `true`. */
	breadcrumbs?: boolean;
}

/** what lands on `ctx.sentry`. */
export interface SentryControl {
	sentry: {
		/** this update's isolation scope. */
		readonly scope: SentryScopeLike;
		/** report an error you handled yourself, with this update's scope. */
		captureException(exception: unknown): string;
		captureMessage(message: string): string;
		setTag(key: string, value: string | number | boolean): void;
		setExtra(key: string, value: unknown): void;
	};
}

/** errors already reported here — `bot.onError` integrations shouldn't report them twice. */
const reported = new WeakSet<object>();

/** did `@yaebal/sentry` already capture this error? useful in a custom `bot.onError`. */
export function isReported(error: unknown): boolean {
	return typeof error === "object" && error !== null && reported.has(error);
}

const instrumented = new WeakSet<Api>();

/** add a breadcrumb per bot api call (and an error-level one per failure) to whatever scope is active. */
export function instrumentApi(api: Api, sentry: SentryLike): Api {
	if (instrumented.has(api)) return api;
	instrumented.add(api);

	api.before((method) => {
		sentry.addBreadcrumb({ category: "telegram.api", message: method, level: "info" });
		return undefined;
	});
	api.onError((method, error, attempt) => {
		sentry.addBreadcrumb({
			category: "telegram.api",
			message: `${method} failed`,
			level: "error",
			data: {
				attempt,
				...(typeof (error as { code?: unknown }).code === "number"
					? { error_code: (error as { code: number }).code }
					: {}),
			},
		});
		return undefined;
	});

	return api;
}

/**
 * the plugin: install it first, so its scope wraps every other plugin.
 *
 * ```ts
 * import * as Sentry from "@sentry/node";
 * Sentry.init({ dsn: process.env.SENTRY_DSN });
 *
 * const bot = new Bot(token).install(sentry({ sentry: Sentry, setUser: true }));
 * ```
 */
export function sentry(options: SentryOptions): BotPlugin<Context, SentryControl> {
	const sdk = options.sentry;
	const breadcrumbs = options.breadcrumbs ?? true;

	return <C extends Context>(bot: Bot<C>) => {
		if (breadcrumbs) instrumentApi(bot.api, sdk);

		bot.use((ctx, next) =>
			sdk.withIsolationScope(async (scope) => {
				scope.setTag("telegram.update_type", ctx.updateType);
				if (ctx.chat !== undefined) {
					scope.setTag("telegram.chat_type", ctx.chat.type);
					scope.setContext("telegram", {
						update_id: ctx.update.update_id,
						chat_id: ctx.chat.id,
					});
				} else {
					scope.setContext("telegram", { update_id: ctx.update.update_id });
				}
				if (options.setUser && ctx.from !== undefined) {
					scope.setUser({
						id: ctx.from.id,
						...(ctx.from.username === undefined ? {} : { username: ctx.from.username }),
					});
				}
				if (breadcrumbs) {
					sdk.addBreadcrumb({
						category: "telegram.update",
						message: ctx.updateType,
						level: "info",
						data: { update_id: ctx.update.update_id },
					});
				}

				const control: SentryControl["sentry"] = {
					scope,
					captureException: (exception) => sdk.captureException(exception),
					captureMessage: (message) => sdk.captureMessage(message),
					setTag: (key, value) => {
						scope.setTag(key, value);
					},
					setExtra: (key, value) => {
						scope.setExtra(key, value);
					},
				};
				Object.assign(ctx as object, { sentry: control });

				try {
					await next();
				} catch (error) {
					// captured inside the update's scope, then handed on to bot.onError as usual
					sdk.captureException(error);
					if (typeof error === "object" && error !== null) reported.add(error);
					throw error;
				}
			}),
		);

		return bot as unknown as Bot<C & SentryControl>;
	};
}
