import type { Context, FilterQuery } from "@yaebal/core";

export type MaybePromise<T> = T | Promise<T>;

/** a parent scene suspended by {@link ActiveScene.enterSub} — restored on `exitSub()`. */
export interface SceneFrame {
	scene: string;
	step: number;
	data: unknown;
	params: unknown;
}

/**
 * the record persisted per key. this is the whole durable footprint of a scene:
 * restart the bot with a persistent adapter and the user resumes mid-wizard,
 * state bag and all. must stay json-serializable (adapters round-trip it).
 */
export interface SceneSnapshot {
	scene: string;
	/** index into the scene's `steps` array. */
	step: number;
	/** the scene's state bag (`ctx.scene.state`). */
	data: unknown;
	/** what `enter()` was called with (`ctx.scene.params`). */
	params: unknown;
	/** true until the current step consumes its first update — the "ask the question" pass. */
	firstTime: boolean;
	/** epoch ms of the last write; drives the `ttl` option. */
	updatedAt: number;
	/** parent scenes suspended by `enterSub()`, innermost last. */
	stack?: SceneFrame[];
}

/** why a scene ended — passed to `onLeave`. */
export type LeaveReason =
	/** explicit `leave()` / `exitSub()`. */
	| "leave"
	/** the wizard ran past its last step (or a sub-scene finished back into its parent). */
	| "finish"
	/** another scene was entered over this one. */
	| "switch"
	/** `reenter()` ended the previous occupancy. */
	| "reenter"
	/** the `ttl` option expired an abandoned scene. */
	| "expired";

export interface LeaveInfo {
	reason: LeaveReason;
	/** `leave({ cancelled: true })` — "user aborted", as opposed to a plain exit. */
	cancelled: boolean;
}

export interface EnterOptions<S extends object = object, P = unknown> {
	/** seed the state bag — merged over the def's `initial(ctx)`. */
	state?: Partial<S>;
	/** arbitrary payload for the scene, exposed as `ctx.scene.params`. */
	params?: P;
	/** mark the scene active but skip `onEnter` and the first step's question pass. */
	silent?: boolean;
}

export interface GoOptions {
	/** land on the step in question-asking mode (default `true`); `false` = processing mode. */
	firstTime?: boolean;
	/** move the pointer without running the step's question pass now. */
	silent?: boolean;
}

export interface LeaveOptions {
	/** skip the scene's `onLeave` hook. */
	silent?: boolean;
	/** surfaced to `onLeave` as `info.cancelled`. */
	cancelled?: boolean;
}

/**
 * the in-scene control — what `ctx.scene` is inside steps and scene hooks.
 * one runtime object backs both this and {@link SceneControl}; the types are
 * two views of it (outside a scene the active-only members throw).
 */
export interface ActiveScene<S extends object = object, P = unknown> {
	/** the active scene's name. */
	readonly name: string;
	/**
	 * the scene's state bag. mutate it freely — it is persisted after every
	 * step run and every transition, and travels with the snapshot across
	 * restarts (keep it json-serializable).
	 */
	readonly state: S;
	/** what `enter()` was called with. */
	readonly params: P;
	/** the current step index. */
	readonly step: number;
	/** the current step's name, if it has one. */
	readonly stepName: string | undefined;
	/**
	 * true on the step's first run — the "ask the question" pass. after it the
	 * step re-runs in processing mode (`firstTime === false`) for every update
	 * it claims, until it navigates away.
	 */
	readonly firstTime: boolean;
	/** go to the next step and run its question pass now. past the last step = finish. */
	next(): Promise<void>;
	/** go back one step and re-ask its question. throws on the first step. */
	previous(): Promise<void>;
	/** jump to a step by index or name. */
	go(step: number | string, options?: GoOptions): Promise<void>;
	/** restart this scene from step 0 (fires `onLeave` with reason `"reenter"`, then `onEnter`). */
	reenter(options?: EnterOptions<S, P>): Promise<void>;
	/** end the scene — including any sub-scene stack. fires `onLeave` with reason `"leave"`. */
	leave(options?: LeaveOptions): Promise<void>;
	/** switch to another scene (fires this scene's `onLeave` with reason `"switch"`). */
	enter(name: string, options?: EnterOptions<object, unknown>): Promise<void>;
	/**
	 * suspend this scene and enter another; `exitSub()` (or the sub finishing)
	 * resumes this one at the current step, re-asking its question.
	 */
	enterSub(name: string, options?: EnterOptions<object, unknown>): Promise<void>;
	/** end the innermost sub-scene, merging `merge` into the parent's state bag. */
	exitSub(merge?: object): Promise<void>;
}

/** the context steps and scene hooks receive: the bot context plus the in-scene control. */
export type SceneContext<
	C extends Context = Context,
	S extends object = object,
	P = unknown,
> = C & { scene: ActiveScene<S, P> };

export type StepFn<C extends Context = Context, S extends object = object, P = unknown> = (
	ctx: SceneContext<C, S, P>,
) => unknown;

/** the object form of a step: a handler plus routing metadata. */
export interface StepDef<C extends Context = Context, S extends object = object, P = unknown> {
	/** name for `go("name")` jumps. must be unique within the scene, not all-digits. */
	name?: string;
	/**
	 * which updates this step claims, as core filter queries. defaults to fresh
	 * messages only (`["message", "business_message"]`) — edits, channel posts
	 * and everything else fall through to the bot's normal handlers.
	 */
	on?: FilterQuery | FilterQuery[];
	handler: StepFn<C, S, P>;
}

/** a step: a bare handler (fresh messages only) or the object form with routing. */
export type Step<C extends Context = Context, S extends object = object, P = unknown> =
	| StepFn<C, S, P>
	| StepDef<C, S, P>;

/**
 * a scene definition. `S` is the state bag, `P` the enter params — declare them
 * via {@link defineScene} so `ctx.scene.state` / `enter()` options are typed.
 */
export interface SceneDef<C extends Context = Context, S extends object = object, P = undefined> {
	/** type-level carrier — never present at runtime (the `Filter["~adds"]` trick from core). */
	readonly "~types"?: { state: S; params: P; ctx: C };
	/** build the initial state bag. `enter({ state })` is merged over it. */
	initial?: (ctx: C) => S;
	/** fires once per occupancy, right before the first step's question pass. */
	onEnter?: StepFn<C, S, P>;
	/** fires on every exit — `info.reason` says why, state is still readable. */
	onLeave?: (ctx: SceneContext<C, S, P>, info: LeaveInfo) => unknown;
	/** runs before every step execution; navigating here skips the step. */
	beforeStep?: StepFn<C, S, P>;
	/** runs after every step execution (skipped when the step navigated away). */
	afterStep?: StepFn<C, S, P>;
	steps: ReadonlyArray<Step<C, S, P>>;
}

// biome-ignore lint/suspicious/noExplicitAny: variance escape hatch — `any` is what lets one Record constraint accept heterogeneous, precisely-typed defs (each read path re-extracts the real types via SceneStateOf/SceneParamsOf).
export type AnySceneDef = SceneDef<any, any, any>;

/** the record `scenes()` takes: name → definition. */
export type SceneDefs = Record<string, AnySceneDef>;

export type SceneName<Defs> = keyof Defs & string;

type TypesOf<D> = D extends { "~types"?: infer T } ? NonNullable<T> : never;

/** extract a def's state bag type (as declared via {@link defineScene}). */
export type SceneStateOf<D> = TypesOf<D> extends { state: infer S extends object } ? S : object;

/** extract a def's enter-params type. */
export type SceneParamsOf<D> = TypesOf<D> extends { params: infer P } ? P : undefined;

type CtxOf<D> = TypesOf<D> extends { ctx: infer C extends Context } ? C : Context;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
	x: infer I,
) => void
	? I
	: never;

/**
 * the context the whole plugin requires: the intersection of every def's `C`.
 * this is what makes `install()` order type-checked (core invariant #4) — a def
 * built over `Context & { session: S }` forces the session plugin first.
 */
export type SceneDefsContext<Defs> = UnionToIntersection<
	{ [K in keyof Defs]: CtxOf<Defs[K]> }[keyof Defs]
> &
	Context;

/** `enter(name, options)` — the options (and `params`) are typed per scene. */
export type EnterArgs<D> =
	undefined extends SceneParamsOf<D>
		? [options?: EnterOptions<SceneStateOf<D>, SceneParamsOf<D>>]
		: [options: EnterOptions<SceneStateOf<D>, SceneParamsOf<D>> & { params: SceneParamsOf<D> }];

/**
 * the always-present control — what `ctx.scene` is *outside* steps. handlers
 * reached via passthrough (a global `/cancel`) use it to inspect or end the
 * active scene.
 */
export interface SceneControl<Defs = SceneDefs> {
	/** enter a scene. throws on an unknown name and on keyless updates. */
	enter<K extends SceneName<Defs>>(name: K, ...args: EnterArgs<Defs[K]>): Promise<void>;
	/** end the active scene (a no-op when there is none). */
	leave(options?: LeaveOptions): Promise<void>;
	/** the active scene's name for this update's key, or `undefined`. */
	readonly current: SceneName<Defs> | undefined;
	/** is a scene active for this update's key? */
	readonly active: boolean;
}
