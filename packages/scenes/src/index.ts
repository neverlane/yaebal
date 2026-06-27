import type { Context, Plugin } from "@yaebal/core";
import { MemoryStorage, type StorageAdapter } from "@yaebal/session";

/** Context inside a scene: the base context plus the scene control. */
export type SceneContext = Context & { scene: SceneControl };

/** A scene step. Reads the user's input (`ctx.text`), then `next()` / `leave()`. */
export type Step = (ctx: SceneContext) => unknown | Promise<unknown>;

/** A scene: an optional entry hook (asks the first question) and ordered steps. */
export interface SceneDef {
	enter?: Step;
	steps: Step[];
}

export interface SceneControl {
	/** Enter a scene (runs its `enter` hook). */
	enter(name: string): Promise<void>;
	/** Advance to the next step (the new step runs on the next message). */
	next(): void;
	/** Leave the current scene. */
	leave(): Promise<void>;
	/** The active scene name, if any. */
	readonly current: string | undefined;
	/** The current step index. */
	readonly step: number;
}

interface SceneState {
	scene: string;
	step: number;
}

export interface ScenesOptions {
	/** Where to persist scene state. Defaults to in-memory. */
	storage?: StorageAdapter<SceneState>;
	/** Scene key for an update. Default: per-chat (`ctx.chat.id`). */
	getKey?: (ctx: Context) => string | undefined;
}

/**
 * Scenes plugin: step-by-step wizards. Each step handles one user message and
 * asks the next question; `next()` advances, `leave()` exits. State lives per
 * chat, so this is safe under the sequential update loop (no suspended promises).
 *
 * While in a scene every message is consumed and never reaches other handlers —
 * so a `/cancel` won't fire its command unless a step checks for it
 * (`if (ctx.text === "/cancel") return ctx.scene.leave()`).
 */
export function scenes(
	defs: Record<string, SceneDef>,
	options: ScenesOptions = {},
): Plugin<Context, { scene: SceneControl }> {
	const storage = options.storage ?? new MemoryStorage<SceneState>();
	const getKey = options.getKey ?? ((ctx: Context) => ctx.chat?.id?.toString());

	// Per-request consume step, shared from `derive` (which builds the control and
	// owns the mutable state) to the routing `use` that runs after it.
	const runners = new WeakMap<Context, () => Promise<boolean>>();

	const plugin: Plugin<Context, { scene: SceneControl }> = (composer) =>
		composer
			.derive(async (ctx) => {
				const key = getKey(ctx);
				let state = key !== undefined ? await storage.get(key) : undefined;
				let advance = false;
				let left = false;

				const persist = async (): Promise<void> => {
					if (key === undefined) return;
					if (left || !state) await storage.delete(key);
					else await storage.set(key, state);
				};

				const control: SceneControl = {
					get current() {
						return state?.scene;
					},
					get step() {
						return state?.step ?? 0;
					},
					next() {
						advance = true;
					},
					async enter(name) {
						state = { scene: name, step: 0 };
						advance = false;
						left = false;
						await defs[name]?.enter?.(ctx as unknown as SceneContext);
						await persist();
					},
					async leave() {
						left = true;
						state = undefined;
						await persist();
					},
				};

				// In a scene with a message? run the current step instead of other handlers.
				runners.set(ctx, async () => {
					if (state && ctx.message) {
						const def = defs[state.scene];
						const step = def?.steps[state.step];
						if (step) {
							await step(ctx as unknown as SceneContext);
							if (!left && state) {
								if (advance) state = { scene: state.scene, step: state.step + 1 };
								// re-resolve from the current scene — a step may have switched it via enter()
								const length = defs[state.scene]?.steps.length ?? 0;
								if (state.step >= length) {
									state = undefined;
									left = true;
								}
								await persist();
							}
							return true; // consumed
						}
					}
					return false;
				});

				return { scene: control };
			})
			.use(async (ctx, next) => {
				const consumed = await runners.get(ctx)?.();
				runners.delete(ctx);
				if (!consumed) await next();
			});
	return plugin;
}
