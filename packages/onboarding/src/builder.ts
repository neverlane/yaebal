import type { Context } from "@yaebal/core";
import { createOnboardingPlugin } from "./plugin.js";
import type {
	AdvanceFor,
	CreateOnboardingOpts,
	ErrorMode,
	ExitReason,
	FlowControl,
	OnboardingNamespace,
	OnboardingPlugin,
	OnboardingStorage,
	ScopeResolver,
	StepConfig,
} from "./types.js";

export interface FlowDefinition {
	opts: {
		id: string;
		storage?: OnboardingStorage;
		concurrency: "queue" | "preempt" | "parallel";
		resumeOnStart: boolean;
		scope: ScopeResolver;
		controls?: CreateOnboardingOpts["controls"];
		errors: ErrorMode;
	};
	steps: { id: string; config: StepConfig<Record<string, unknown>, string> }[];
	hooks: FlowHooks;
}

export interface FlowHooks {
	onComplete?: (ctx: Context, meta: { data: Record<string, unknown> }) => unknown;
	onExit?: (ctx: Context, meta: { at: string; reason: ExitReason }) => unknown;
	onDismiss?: (ctx: Context, meta: { at: string }) => unknown;
	onStepChange?: (ctx: Context, meta: { from: string | null; to: string }) => unknown;
	onMissingStep?: (
		ctx: Context,
		meta: { oldStepId: string; availableSteps: string[] },
	) => string | "complete" | "exit";
}

export interface OnboardingBuilder<
	Data extends object,
	Steps extends string,
	Id extends string = string,
> {
	step<NewId extends string>(
		id: NewId,
		config: StepConfig<Data, Steps | NewId>,
	): OnboardingBuilder<Data, Steps | NewId, Id>;

	onComplete(
		handler: (ctx: Context, meta: { data: Record<string, unknown> }) => unknown,
	): OnboardingBuilder<Data, Steps, Id>;
	onExit(
		handler: (ctx: Context, meta: { at: Steps; reason: ExitReason }) => unknown,
	): OnboardingBuilder<Data, Steps, Id>;
	onDismiss(
		handler: (ctx: Context, meta: { at: Steps }) => unknown,
	): OnboardingBuilder<Data, Steps, Id>;
	onStepChange(
		handler: (ctx: Context, meta: { from: Steps | null; to: Steps }) => unknown,
	): OnboardingBuilder<Data, Steps, Id>;
	onMissingStep(
		handler: (
			ctx: Context,
			meta: { oldStepId: string; availableSteps: Steps[] },
		) => Steps | "complete" | "exit",
	): OnboardingBuilder<Data, Steps, Id>;

	build(): OnboardingPlugin<Id, Steps>;
	"~build"(): FlowDefinition;
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function validateId(kind: string, id: string): void {
	if (!ID_PATTERN.test(id)) {
		throw new Error(
			`@yaebal/onboarding: ${kind} id "${id}" must use only letters, numbers, _ and -`,
		);
	}
}

export function createOnboarding<
	Data extends object = Record<string, unknown>,
	Id extends string = string,
>(opts: CreateOnboardingOpts<Id>): OnboardingBuilder<Data, never, Id> {
	if (!opts.id) throw new Error("@yaebal/onboarding: `id` is required");
	validateId("flow", opts.id);

	const def: FlowDefinition = {
		opts: {
			id: opts.id,
			storage: opts.storage,
			concurrency: opts.concurrency ?? "queue",
			resumeOnStart: opts.resumeOnStart ?? true,
			scope: opts.scope ?? "user",
			controls: opts.controls,
			errors: opts.errors ?? "console",
		},
		steps: [],
		hooks: {},
	};

	const builder: OnboardingBuilder<Data, never, Id> = {
		step(id, config) {
			validateId("step", id);
			if (def.steps.some((s) => s.id === id)) {
				throw new Error(`@yaebal/onboarding[${def.opts.id}]: duplicate step id "${id}"`);
			}

			def.steps.push({
				id,
				config: config as unknown as StepConfig<Record<string, unknown>, string>,
			});

			return builder as never;
		},

		onComplete(handler) {
			def.hooks.onComplete = handler;
			return builder;
		},

		onExit(handler) {
			def.hooks.onExit = handler as FlowHooks["onExit"];
			return builder;
		},

		onDismiss(handler) {
			def.hooks.onDismiss = handler as FlowHooks["onDismiss"];
			return builder;
		},

		onStepChange(handler) {
			def.hooks.onStepChange = handler as FlowHooks["onStepChange"];
			return builder;
		},

		onMissingStep(handler) {
			def.hooks.onMissingStep = handler as FlowHooks["onMissingStep"];
			return builder;
		},

		build() {
			assertHasSteps(def);

			return createOnboardingPlugin(def) as unknown as OnboardingPlugin<Id, never> & {
				advanceFor: AdvanceFor<never>;
			};
		},

		"~build"() {
			assertHasSteps(def);
			return def;
		},
	};

	return builder;
}

function assertHasSteps(def: FlowDefinition): void {
	if (def.steps.length === 0) {
		throw new Error(`@yaebal/onboarding[${def.opts.id}]: at least one step is required`);
	}
}

export type { AdvanceFor, FlowControl, OnboardingNamespace, OnboardingPlugin };
