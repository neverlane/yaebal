import {
	COMMAND_UPDATES,
	type Composer,
	type Context,
	matchQuery,
	messageOf,
	type Plugin,
} from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/sklad";
import type {
	ActiveScene,
	AnySceneDef,
	EnterOptions,
	GoOptions,
	LeaveInfo,
	LeaveOptions,
	LeaveReason,
	MaybePromise,
	SceneContext,
	SceneControl,
	SceneDef,
	SceneDefs,
	SceneDefsContext,
	SceneFrame,
	SceneSnapshot,
	StepDef,
	StepFn,
} from "./types.js";

export {
	type AskOptions,
	type AskText,
	ask,
	type StandardIssueLike,
	type StandardSchemaLike,
} from "./ask.js";
export type * from "./types.js";

/**
 * identity helper that pins a scene's context (`C`), state bag (`S`) and enter
 * params (`P`) so everything downstream is typed: `ctx.scene.state` inside
 * steps, `enter(name, { state, params })` at call sites, and the plugin's
 * required context (a def over `Context & { session: X }` makes installing
 * scenes before session a compile error).
 *
 * @example
 * const quest = defineScene<Context, { name: string; goal: string }>({
 *   steps: [
 *     ask("name", { question: "what's your name?" }),
 *     ask("goal", { question: "what's your launch goal?" }),
 *   ],
 *   onLeave: (ctx, info) =>
 *     info.reason === "finish" &&
 *     ctx.send(`saved: ${ctx.scene.state.name} → ${ctx.scene.state.goal}`),
 * });
 */
export function defineScene<C extends Context = Context, S extends object = object, P = undefined>(
	def: SceneDef<C, S, P>,
): SceneDef<C, S, P> {
	return def;
}

export interface ScenesOptions<C extends Context = Context> {
	/** where to persist scene snapshots. defaults to in-memory (lost on restart). */
	storage?: StorageAdapter<SceneSnapshot>;
	/**
	 * scene key for an update. defaults to `chat.id:from.id` — per user *per chat*,
	 * so wizards are safe in groups and don't follow the user across chats.
	 * `undefined` = no scene machinery for this update (and `enter()` throws).
	 */
	getKey?: (ctx: C) => string | undefined;
	/**
	 * what happens to updates the current step doesn't claim while a scene is
	 * active. `true` (default): they fall through to the bot's normal handlers.
	 * `false`: message-family updates the scene could ever claim are swallowed.
	 * a predicate exempts matching updates from the scene entirely (they skip
	 * the step even when it would claim them).
	 */
	passthrough?: boolean | ((ctx: C) => MaybePromise<boolean>);
	/**
	 * let `/commands` bypass an active scene so global handlers (`/cancel`,
	 * `/help`) keep working mid-wizard. `true` (default): every command;
	 * an array: just those names; `false`: commands are ordinary step input.
	 */
	passCommands?: boolean | string[];
	/**
	 * expire an abandoned scene this many milliseconds after its last activity.
	 * expiry fires `onLeave` with reason `"expired"` on the next update from
	 * that key, then the update flows as if no scene were active.
	 */
	ttl?: number;
	/** clock override, mainly for tests. */
	now?: () => number;
}

/** a step's default claim: fresh messages only — edits and channel posts never re-enter a wizard. */
const FRESH_MESSAGES: readonly string[] = ["message", "business_message"];

// internal, variance-free views of the user's defs. the public generics are
// re-established at the type level by `SceneControl` / `SceneContext`.
type InternalCtx = SceneContext<Context, Record<string, unknown>, unknown>;
type InternalStep = StepFn<Context, Record<string, unknown>, unknown>;

interface ResolvedStep {
	name?: string;
	on: readonly string[];
	handler: InternalStep;
}

interface ResolvedScene {
	def: {
		initial?: (ctx: Context) => object;
		onEnter?: InternalStep;
		onLeave?: (ctx: InternalCtx, info: LeaveInfo) => unknown;
		beforeStep?: InternalStep;
		afterStep?: InternalStep;
	};
	steps: ResolvedStep[];
	byName: Map<string, number>;
	/** update-type heads this scene's steps can ever claim ("" = a wildcard query like ":text"). */
	claims: Set<string>;
}

function resolveScenes(defs: SceneDefs): Map<string, ResolvedScene> {
	const resolved = new Map<string, ResolvedScene>();

	for (const [name, rawDef] of Object.entries(defs)) {
		const def = rawDef as SceneDef<Context, Record<string, unknown>, unknown>;
		if (def.steps.length === 0) throw new Error(`scenes: scene "${name}" has no steps`);

		const steps: ResolvedStep[] = [];
		const byName = new Map<string, number>();
		const claims = new Set<string>();

		for (const step of def.steps) {
			const stepDef: StepDef<Context, Record<string, unknown>, unknown> = typeof step === "function"
				? { handler: step }
				: step;
			const on: readonly string[] =
				stepDef.on === undefined
					? FRESH_MESSAGES
					: Array.isArray(stepDef.on)
						? stepDef.on
						: [stepDef.on];

			if (stepDef.name !== undefined) {
				if (/^\d+$/.test(stepDef.name))
					throw new Error(
						`scenes: step "${stepDef.name}" in scene "${name}" — all-digit names collide with go(index)`,
					);
				if (byName.has(stepDef.name))
					throw new Error(`scenes: duplicate step name "${stepDef.name}" in scene "${name}"`);
				byName.set(stepDef.name, steps.length);
			}

			for (const query of on) {
				const [head = ""] = query.split(":");
				claims.add(head);
			}

			steps.push({ name: stepDef.name, on, handler: stepDef.handler });
		}

		resolved.set(name, { def, steps, byName, claims });
	}

	return resolved;
}

const defaultGetKey = (ctx: Context): string | undefined => {
	const chat = ctx.chat?.id;
	if (chat === undefined) return undefined;

	const from = ctx.from?.id;
	return from === undefined ? String(chat) : `${chat}:${from}`;
};

/**
 * scenes plugin: durable, step-by-step wizards. each step runs twice — a
 * `firstTime` pass that asks its question, then a processing pass per claimed
 * update — so steps are self-contained and `go`/`next`/`previous` can jump
 * anywhere. the snapshot (scene, step, state bag, params, sub-scene stack)
 * lives in a `StorageAdapter`, so with a persistent adapter a restart resumes
 * the user mid-wizard.
 *
 * routing is polite by default: updates the current step doesn't claim fall
 * through to normal handlers (`passthrough`), and `/commands` bypass the scene
 * (`passCommands`), so a global `/cancel` keeps working. steps claim fresh
 * messages only unless they declare `on` filter queries — any core query
 * works, including `"callback_query:data"` for inline-keyboard wizards.
 *
 * concurrency: snapshots are read-modify-write per update. the built-in
 * long poll is sequential and `@yaebal/runner`'s default per-chat lanes align
 * with the default key; webhook deployments must serialize updates per key
 * themselves or two simultaneous answers can race.
 */
export function scenes<Defs extends SceneDefs>(
	defs: Defs,
	options: ScenesOptions<SceneDefsContext<Defs>> = {},
): Plugin<SceneDefsContext<Defs>, { scene: SceneControl<Defs> }> {
	const resolved = resolveScenes(defs);
	const storage = options.storage ?? new MemoryStorage<SceneSnapshot>();
	const getKey = (options.getKey ?? defaultGetKey) as (ctx: Context) => string | undefined;
	const passthrough = (options.passthrough ?? true) as
		| boolean
		| ((ctx: Context) => MaybePromise<boolean>);
	const passCommands = options.passCommands ?? true;
	const ttl = options.ttl;
	const now = options.now ?? Date.now;

	const requireScene = (name: string): ResolvedScene => {
		const scene = resolved.get(name);
		if (!scene)
			throw new Error(
				`scenes: unknown scene "${name}" — registered: ${[...resolved.keys()].join(", ")}`,
			);
		return scene;
	};

	/** does this update carry a command that `passCommands` exempts from the scene? */
	const isPassedCommand = (ctx: Context): boolean => {
		if (passCommands === false) return false;
		if (!COMMAND_UPDATES.has(ctx.updateType)) return false;

		const text = messageOf(ctx.update)?.text;
		if (text === undefined || !text.startsWith("/")) return false;
		if (passCommands === true) return true;

		const [head = ""] = text.slice(1).split(/\s/, 1);
		const [base = ""] = head.split("@");
		return passCommands.some((command) => command.toLowerCase() === base.toLowerCase());
	};

	// per-request consume step, shared from `derive` (which builds the control and
	// owns the mutable snapshot) to the routing `use` that runs after it.
	const runners = new WeakMap<Context, () => Promise<boolean>>();

	const plugin = (composer: Composer<Context>) =>
		composer
			.derive(async (ctx) => {
				if ((ctx as { scene?: unknown }).scene !== undefined)
					throw new Error(
						"scenes: already installed on this composer — register every scene in a single scenes({ ... }) call",
					);

				const key = getKey(ctx);
				let snapshot: SceneSnapshot | undefined =
					key !== undefined ? await storage.get(key) : undefined;
				// bumped by every transition; the step runner compares epochs to know
				// whether the handler already navigated (and persisted) on its own.
				let epoch = 0;
				// suppresses nested onLeave when a hook itself navigates.
				let inLeaveHook = false;

				const sctx = ctx as unknown as InternalCtx;

				const persist = async (): Promise<void> => {
					if (key === undefined) return;

					if (snapshot) {
						snapshot.updatedAt = now();
						await storage.set(key, snapshot);
					} else {
						await storage.delete(key);
					}
				};

				const requireKey = (): void => {
					if (key === undefined)
						throw new Error(
							"scenes: no storage key for this update — the default getKey needs ctx.chat; pass options.getKey to enter scenes from keyless updates (inline queries, …)",
						);
				};

				const requireActive = (): SceneSnapshot => {
					if (!snapshot) throw new Error("scenes: no active scene on this update");
					return snapshot;
				};

				const fireLeave = async (reason: LeaveReason, cancelled: boolean): Promise<void> => {
					if (!snapshot || inLeaveHook) return;
					const scene = resolved.get(snapshot.scene);
					if (!scene?.def.onLeave) return;

					inLeaveHook = true;
					try {
						await scene.def.onLeave(sctx, { reason, cancelled });
					} finally {
						inLeaveHook = false;
					}
				};

				/** run the current step once (with before/after hooks); persists unless the handler navigated. */
				const runStep = async (): Promise<void> => {
					const active = requireActive();
					const scene = resolved.get(active.scene);
					const step = scene?.steps[active.step];
					if (!scene || !step) return;

					const before = epoch;
					if (scene.def.beforeStep) {
						await scene.def.beforeStep(sctx);
						if (epoch !== before) return;
					}

					await step.handler(sctx);
					if (epoch !== before) return;

					if (scene.def.afterStep) {
						await scene.def.afterStep(sctx);
						if (epoch !== before) return;
					}

					active.firstTime = false;
					await persist();
				};

				const beginScene = async (
					name: string,
					enterOptions: EnterOptions<object, unknown>,
					stack: SceneFrame[] | undefined,
				): Promise<void> => {
					requireKey();
					const scene = requireScene(name);

					epoch++;
					snapshot = {
						scene: name,
						step: 0,
						data: { ...(scene.def.initial?.(ctx) ?? {}), ...(enterOptions.state ?? {}) },
						params: enterOptions.params,
						firstTime: true,
						updatedAt: now(),
						...(stack && stack.length > 0 ? { stack } : {}),
					};
					// persist before the hooks: if onEnter throws, the user *is* in the
					// scene (step 0, question pending) instead of half-entered nowhere.
					await persist();

					if (enterOptions.silent) return;

					if (scene.def.onEnter) {
						const before = epoch;
						await scene.def.onEnter(sctx);
						if (epoch !== before) return;
					}

					await runStep();
				};

				/** resume the top stack frame (after a sub-scene ended), re-asking its step. */
				const popFrame = async (merge: object | undefined): Promise<void> => {
					const active = requireActive();
					const stack = active.stack ?? [];
					const frame = stack[stack.length - 1];
					if (!frame) return;

					const rest = stack.slice(0, -1);
					epoch++;
					snapshot = {
						scene: frame.scene,
						step: frame.step,
						data: merge ? { ...(frame.data as object), ...merge } : frame.data,
						params: frame.params,
						firstTime: true,
						updatedAt: now(),
						...(rest.length > 0 ? { stack: rest } : {}),
					};
					await persist();
					await runStep();
				};

				/** the wizard ran past its last step: pop back to the parent, or end for good. */
				const finish = async (): Promise<void> => {
					const active = requireActive();
					await fireLeave("finish", false);

					if (active.stack?.length) return popFrame(undefined);

					epoch++;
					snapshot = undefined;
					await persist();
				};

				const goToIndex = async (index: number, goOptions: GoOptions): Promise<void> => {
					const active = requireActive();
					const scene = requireScene(active.scene);

					if (index < 0 || index > scene.steps.length)
						throw new Error(
							`scenes: step ${index} is out of range for scene "${active.scene}" (${scene.steps.length} steps)`,
						);
					if (index === scene.steps.length) return finish();

					epoch++;
					active.step = index;
					active.firstTime = goOptions.firstTime ?? true;
					await persist();

					if (!goOptions.silent && active.firstTime) await runStep();
				};

				const control: ActiveScene<Record<string, unknown>, unknown> &
					SceneControl<Record<string, AnySceneDef>> = {
					get current() {
						return snapshot?.scene;
					},
					get active() {
						return snapshot !== undefined;
					},
					get name() {
						return requireActive().scene;
					},
					get state() {
						return requireActive().data as Record<string, unknown>;
					},
					get params() {
						return requireActive().params;
					},
					get step() {
						return requireActive().step;
					},
					get stepName() {
						const active = requireActive();
						return resolved.get(active.scene)?.steps[active.step]?.name;
					},
					get firstTime() {
						return snapshot?.firstTime ?? false;
					},

					async enter(name: string, enterOptions: EnterOptions<object, unknown> = {}) {
						requireScene(name); // validate before tearing anything down
						if (snapshot) await fireLeave("switch", false);
						return beginScene(name, enterOptions, undefined);
					},

					async enterSub(name: string, enterOptions: EnterOptions<object, unknown> = {}) {
						const active = requireActive();
						requireScene(name);
						const frame: SceneFrame = {
							scene: active.scene,
							step: active.step,
							data: active.data,
							params: active.params,
						};
						return beginScene(name, enterOptions, [...(active.stack ?? []), frame]);
					},

					async exitSub(merge?: object) {
						const active = requireActive();
						if (!active.stack?.length) return control.leave();

						await fireLeave("leave", false);
						return popFrame(merge);
					},

					async reenter(enterOptions: EnterOptions<object, unknown> = {}) {
						const active = requireActive();
						const name = active.scene;
						const params = enterOptions.params ?? active.params;
						const stack = active.stack;

						await fireLeave("reenter", false);
						return beginScene(name, { ...enterOptions, params }, stack);
					},

					async leave(leaveOptions: LeaveOptions = {}) {
						if (!snapshot) return;

						if (!leaveOptions.silent) {
							await fireLeave("leave", leaveOptions.cancelled ?? false);
							// unwind suspended parents so their cleanup hooks run too
							let stack: SceneFrame[] = snapshot.stack ?? [];
							while (stack.length > 0) {
								const frame = stack[stack.length - 1];
								if (!frame) break;
								stack = stack.slice(0, -1);
								snapshot = {
									scene: frame.scene,
									step: frame.step,
									data: frame.data,
									params: frame.params,
									firstTime: false,
									updatedAt: now(),
									...(stack.length > 0 ? { stack } : {}),
								};
								await fireLeave("leave", leaveOptions.cancelled ?? false);
							}
						}

						epoch++;
						snapshot = undefined;
						await persist();
					},

					async next() {
						return goToIndex(requireActive().step + 1, {});
					},

					async previous() {
						return goToIndex(requireActive().step - 1, {});
					},

					async go(target: number | string, goOptions: GoOptions = {}) {
						if (typeof target === "number") return goToIndex(target, goOptions);

						const active = requireActive();
						const index = requireScene(active.scene).byName.get(target);
						if (index === undefined)
							throw new Error(`scenes: no step named "${target}" in scene "${active.scene}"`);
						return goToIndex(index, goOptions);
					},
				};

				// self-heal: a snapshot pointing at a renamed scene or a step that no
				// longer exists (a deploy shrank the wizard) is deleted, not left to
				// shadow the user forever. stale sub-scene frames are dropped the same way.
				if (snapshot && key !== undefined) {
					const scene = resolved.get(snapshot.scene);
					if (!scene || snapshot.step >= scene.steps.length) {
						await storage.delete(key);
						snapshot = undefined;
					} else if (snapshot.stack) {
						const stack = snapshot.stack.filter((frame) => {
							const parent = resolved.get(frame.scene);
							return parent !== undefined && frame.step < parent.steps.length;
						});
						snapshot.stack = stack.length > 0 ? stack : undefined;
					}
				}

				// ttl: an abandoned scene expires lazily, on the key's next update.
				if (snapshot && ttl !== undefined && now() - snapshot.updatedAt > ttl) {
					Object.assign(ctx as object, { scene: control });
					await fireLeave("expired", false);
					epoch++;
					snapshot = undefined;
					await persist();
				}

				// in a scene? decide, in the routing `use` below, whether this update
				// belongs to the current step or falls through.
				runners.set(ctx, async () => {
					const active = snapshot;
					if (!active) return false;
					const scene = resolved.get(active.scene);
					const step = scene?.steps[active.step];
					if (!scene || !step) return false;

					if (isPassedCommand(ctx)) return false;
					if (typeof passthrough === "function" && (await passthrough(ctx))) return false;

					const claimed = step.on.some((query) => matchQuery(ctx, query));
					if (!claimed) {
						if (passthrough === false)
							return scene.claims.has("") || scene.claims.has(ctx.updateType);
						return false;
					}

					await runStep();
					return true;
				});

				return { scene: control as unknown as SceneControl<Defs> };
			})
			.use(async (ctx, next) => {
				const run = runners.get(ctx);
				runners.delete(ctx);

				const consumed = run ? await run() : false;
				if (!consumed) await next();
			});

	return plugin as Plugin<SceneDefsContext<Defs>, { scene: SceneControl<Defs> }>;
}
