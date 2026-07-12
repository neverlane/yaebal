import type { Context, Filtered, FilterQuery, FormatResult } from "@yaebal/core";
import type { StorageAdapter } from "@yaebal/sklad";

export type MaybePromise<T> = T | Promise<T>;

/** options accepted by every `wait`/`waitFor`/`waitUntil`/`form.*` call. */
export interface WaitOptions {
	/** give up after this many ms of no matching update (rejects with {@link ConversationTimeoutError}). overrides `options.waitTimeout` for this call only. */
	timeout?: number;
}

/** one validation failure, in the standard-schema shape (mirrors `@yaebal/scenes`' `ask`). */
export interface StandardIssueLike {
	readonly message: string;
}

/**
 * the standard-schema v1 surface `form.*` consumes — implemented by zod (3.24+), valibot,
 * arktype and friends. typed structurally so this package depends on nothing; any object with
 * a conforming `"~standard".validate` works.
 */
export interface StandardSchemaLike<T> {
	readonly "~standard": {
		readonly version: 1;
		readonly validate: (
			value: unknown,
		) => MaybePromise<
			| { readonly value: T; readonly issues?: undefined }
			| { readonly issues: readonly StandardIssueLike[] }
		>;
	};
}

/** a question (or error) text: plain, `format`ted, or computed from the context. */
export type FormText<C extends Context> =
	| string
	| FormatResult
	| ((ctx: C) => MaybePromise<string | FormatResult>);

export interface FormTextOptions<C extends Context, T = string> {
	/** sent once, then re-sent (as `invalid`) on every rejected answer. */
	question: FormText<C>;
	/**
	 * how to read the answer: a standard-schema (zod/valibot/arktype), or a plain parse
	 * function returning `undefined` for invalid input. omitted → any non-empty text (trimmed).
	 */
	parse?: StandardSchemaLike<T> | ((text: string, ctx: C) => MaybePromise<T | undefined>);
	/** sent when the input doesn't parse. default: the first issue's message, falling back to `question`. */
	invalid?:
		| string
		| FormatResult
		| ((issues: readonly StandardIssueLike[], ctx: C) => MaybePromise<string | FormatResult>);
	/** which updates the question can be answered by. default `"message:text"`. */
	on?: FilterQuery;
	/** per-call wait timeout — see {@link WaitOptions.timeout}. */
	timeout?: number;
}

export interface FormIntOptions<C extends Context>
	extends Omit<FormTextOptions<C, number>, "parse"> {
	min?: number;
	max?: number;
}

export interface FormChoiceOptions<C extends Context, T extends string>
	extends Omit<FormTextOptions<C, T>, "parse"> {
	choices: readonly T[];
	caseSensitive?: boolean;
}

export interface FormConfirmOptions<C extends Context>
	extends Omit<FormTextOptions<C, boolean>, "parse"> {
	/** answers that count as "yes" (lowercased, trimmed). default `["y", "yes"]`. */
	yes?: readonly string[];
	/** answers that count as "no" (lowercased, trimmed). default `["n", "no"]`. */
	no?: readonly string[];
}

/** `cv.form.*` — ready-made "ask, validate, re-ask on invalid input" loops. */
export interface FormApi<C extends Context> {
	/** ask a question, wait for text; re-asks on empty/invalid input. */
	text<T = string>(options: FormTextOptions<C, T>): Promise<T>;
	/** ask for an integer, optionally bounded by `min`/`max`. */
	int(options: FormIntOptions<C>): Promise<number>;
	/** ask the user to pick one of `choices` (case-insensitive by default). */
	choice<T extends string>(options: FormChoiceOptions<C, T>): Promise<T>;
	/** ask a yes/no question. */
	confirm(options: FormConfirmOptions<C>): Promise<boolean>;
}

/**
 * the `cv` handle passed to a conversation builder. `wait`/`waitFor`/`waitUntil` all park the
 * coroutine until a matching update arrives (or `timeout` elapses); an update that doesn't
 * match is routed by `passthrough`/`passCommands` (see {@link ConversationOptions}), never
 * silently dropped.
 */
export interface Conversation<C extends Context = Context> {
	/** resolve with the next update for this conversation, whatever it is. */
	wait(options?: WaitOptions): Promise<C>;
	/** resolve with the next update matching a core filter query (`"message:text"`, `":photo"`, …); the result is narrowed the same way `composer.on()` narrows. */
	waitFor<Q extends FilterQuery>(query: Q, options?: WaitOptions): Promise<Filtered<C, Q>>;
	/** resolve with the next update for which `predicate` returns true. */
	waitUntil<C2 extends C = C>(predicate: (ctx: C) => ctx is C2, options?: WaitOptions): Promise<C2>;
	waitUntil(predicate: (ctx: C) => MaybePromise<boolean>, options?: WaitOptions): Promise<C>;
	/** ready-made ask/validate/re-ask loops built on `waitFor`. */
	readonly form: FormApi<C>;
	/**
	 * run non-deterministic or side-effecting work (random values, a DB read, an outbound HTTP
	 * call) from inside the builder. under the live engine this just runs `fn` once; under the
	 * durable replay engine (`options.storage`) the result is recorded and replayed instead of
	 * re-executed — see the docs' "determinism" section before writing a durable conversation.
	 */
	external<T>(fn: () => MaybePromise<T>): Promise<T>;
	/** stop the conversation right now, as if the builder had returned `undefined`. */
	halt(): never;
	/** the most recent context — the entering update, then each waited one. */
	readonly ctx: C;
	/** aborts when the conversation is torn down (`leave()`, replaced by a new `enter()`, or timed out) — pass to `fetch`/anything cancellable. */
	readonly signal: AbortSignal;
}

export type ConversationBuilder<C extends Context = Context, R = void, P = undefined> = (
	cv: Conversation<C>,
	ctx: C,
	params: P,
) => MaybePromise<R>;

/** a conversation definition — build with {@link createConversation}, register by key in `conversation({ ... })`. */
export interface ConversationDef<C extends Context = Context, R = void, P = undefined> {
	/** type-level carrier — never present at runtime (the `Filter["~adds"]` trick from core, also used by `@yaebal/scenes`). */
	readonly "~types"?: { ctx: C; result: R; params: P };
	builder: ConversationBuilder<C, R, P>;
}

// biome-ignore lint/suspicious/noExplicitAny: variance escape hatch — mirrors @yaebal/scenes' AnySceneDef; read paths re-extract precise types via ConversationResultOf/ConversationParamsOf.
export type AnyConversationDef = ConversationDef<any, any, any>;

/** the record `conversation()` takes: name → definition. */
export type ConversationDefs = Record<string, AnyConversationDef>;

export type ConversationName<Defs> = keyof Defs & string;

type TypesOf<D> = D extends { "~types"?: infer T } ? NonNullable<T> : never;

/** extract a def's result type (as declared via {@link createConversation}) — `void` to match `ConversationBuilder`'s own `R = void` default for a def with no explicit result. */
// biome-ignore lint/suspicious/noConfusingVoidType: intentional — mirrors ConversationBuilder's `R = void` default.
export type ConversationResultOf<D> = TypesOf<D> extends { result: infer R } ? R : void;

/** extract a def's `enter()` params type. */
export type ConversationParamsOf<D> = TypesOf<D> extends { params: infer P } ? P : undefined;

type CtxOf<D> = TypesOf<D> extends { ctx: infer C extends Context } ? C : Context;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
	x: infer I,
) => void
	? I
	: never;

/**
 * the context the whole plugin requires: the intersection of every def's `C`. this is what
 * makes `install()` order type-checked (core invariant #4) — a def built over
 * `Context & { session: X }` forces the session plugin first.
 */
export type ConversationDefsContext<Defs> = UnionToIntersection<
	{ [K in keyof Defs]: CtxOf<Defs[K]> }[keyof Defs]
> &
	Context;

/** `enter(name, ...)` — `params` is required only when the def declares a non-optional `P`. */
export type EnterArgs<D> =
	undefined extends ConversationParamsOf<D>
		? [params?: ConversationParamsOf<D>]
		: [params: ConversationParamsOf<D>];

/** why a conversation ended — passed to `onLeave`. */
export type ConversationLeaveReason =
	/** the builder returned (or `halt()`ed). */
	| "finish"
	/** explicit `ctx.conversation.leave()`. */
	| "left"
	/** another `enter()` for the same key replaced it before it finished. */
	| "replaced"
	/** a `wait()`/`waitFor()`/`waitUntil()` call exceeded its timeout and the builder didn't catch it. */
	| "timeout"
	/** the builder threw. */
	| "error";

export interface ConversationLeaveInfo {
	readonly name: string;
	readonly params: unknown;
	readonly reason: ConversationLeaveReason;
	/** present when `reason === "error"`. */
	readonly error?: unknown;
	/** the builder's return value, present when `reason === "finish"` — cast with {@link ConversationResultOf} for a precise type. */
	readonly result?: unknown;
}

/** a point-in-time read of the active session for a key — `undefined` when none is running. */
export interface ConversationSnapshot<Defs extends ConversationDefs = ConversationDefs> {
	readonly name: ConversationName<Defs>;
	readonly params: unknown;
	readonly startedAt: number;
	readonly lastActivityAt: number;
}

/** the always-present control — `ctx.conversation`. */
export interface ConversationControl<Defs extends ConversationDefs = ConversationDefs> {
	/**
	 * start a registered conversation for this key. if one is already running it is cancelled
	 * first (`onLeave` fires with reason `"replaced"`, its parked `wait()` rejects, its `finally`
	 * runs) — so replacing never leaves two builders racing on the same chat.
	 *
	 * the returned promise resolves once the conversation has been *started* — it deliberately
	 * does **not** wait for the conversation to finish (the builder usually parks on a `wait()`
	 * call expecting a *later* update, and that update arrives through this very dispatch path;
	 * a promise that stayed pending until then would deadlock the handler that awaited it, and
	 * every later update for this key with it). use `onLeave` — its `info.result` carries the
	 * builder's return value (cast with {@link ConversationResultOf} for a precise type) — to
	 * observe completion instead.
	 */
	enter<K extends ConversationName<Defs>>(name: K, ...args: EnterArgs<Defs[K]>): Promise<void>;
	/** is a conversation currently running for this key? */
	readonly active: boolean;
	/** the running conversation's name, or `undefined`. */
	readonly current: ConversationName<Defs> | undefined;
	/** cancel the active conversation (a no-op when there is none). its parked `wait()` rejects and `onLeave` fires with reason `"left"`; resolves once the builder has fully unwound. */
	leave(): Promise<void>;
	/** a point-in-time read of the active session, or `undefined`. */
	snapshot(): ConversationSnapshot<Defs> | undefined;
}

export interface ConversationOptions<C extends Context = Context> {
	/** session key for an update. default: per user *per chat* (`chat.id:from.id`) — see `perChat`/`perUser`/`perChatUser`. `undefined` = no conversation machinery for this update (and `enter()` throws). */
	getKey?: (ctx: C) => string | undefined;
	/**
	 * let `/commands` bypass the active conversation so global handlers (`/cancel`, `/help`) keep
	 * working mid-dialog — checked before routing to `wait()`, regardless of `passthrough`.
	 * `true` (default): every command. an array: just those names. `false`: commands are
	 * ordinary conversation input.
	 */
	passCommands?: boolean | string[];
	/**
	 * what happens to an update that doesn't match the *currently parked* `wait()`/`waitFor()`
	 * filter. `true` (default): it falls through to the bot's normal handlers. `false`: it is
	 * queued (bounded by `queueLimit`) for a later `wait()` call instead of ever reaching another
	 * handler. a predicate decides per update.
	 */
	passthrough?: boolean | ((ctx: C) => MaybePromise<boolean>);
	/** default timeout (ms) for every `wait`/`waitFor`/`waitUntil`/`form.*` call; a call's own `{ timeout }` overrides it. unset = no timeout. */
	waitTimeout?: number;
	/** how many updates to hold while the builder is busy (running between `wait()` calls) before the oldest is dropped. default `100`. */
	queueLimit?: number;
	/**
	 * back the conversation with durable storage: the builder is replayed from a recorded update
	 * log on every update instead of staying parked in memory, so it survives a restart. **the
	 * builder must be deterministic** (no direct randomness/IO — see `cv.external()`) and every
	 * side effect must go through `ctx`/`cv` (not a closure over outside state). omit for the
	 * default in-memory coroutine.
	 */
	storage?: StorageAdapter<unknown>;
	/** clock override, mainly for tests. */
	now?: () => number;
	/** fires once per occupancy, right when a conversation starts (before the builder's first `await`). */
	onEnter?: (ctx: C, info: { name: string; params: unknown }) => unknown;
	/** fires on every exit — `info.reason` says why. */
	onLeave?: (ctx: C, info: ConversationLeaveInfo) => unknown;
	/**
	 * fires when the builder throws an error that isn't a timeout or an intentional exit.
	 * default: `console.error` — silently swallowing a broken conversation is worse than a noisy
	 * default, so this only needs overriding to redirect (not to avoid silence).
	 */
	onError?: (error: unknown, ctx: C, info: { name: string }) => unknown;
	/** fires when the busy-window queue is full and the oldest queued update is dropped to make room. */
	onOverflow?: (dropped: C, ctx: C, info: { name: string }) => unknown;
}

/**
 * the contract an engine (`live.ts`/`replay.ts`) implements; `wait.ts` builds the full
 * {@link Conversation} surface (`waitFor`/`waitUntil`/`form`) on top of this one primitive.
 */
export interface RawWait<C extends Context> {
	/** park until an update matches `match` (`undefined` = any), or `timeoutMs` elapses. */
	wait(
		match: ((ctx: C) => MaybePromise<boolean>) | undefined,
		timeoutMs: number | undefined,
	): Promise<C>;
	external<T>(fn: () => MaybePromise<T>): Promise<T>;
	readonly ctx: C;
	readonly signal: AbortSignal;
}
