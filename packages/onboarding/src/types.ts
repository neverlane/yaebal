import type { Context, FormatResult, MediaSource, Plugin } from "@yaebal/core";

export type MaybePromise<T> = T | Promise<T>;
export type SendText = string | FormatResult;

export type FlowStatus = "null" | "active" | "exited" | "completed" | "dismissed" | "paused";
export type ExitReason = "user" | "preempt" | "exitAll";
export type LeaveReason = "next" | "skip" | "goto" | "exit" | "dismiss" | "complete";

export type StartResult =
	| "started"
	| "resumed"
	| "already-active"
	| "already-completed"
	| "dismissed"
	| "opted-out"
	| "queued"
	| "preempted";

export type NextResult = "advanced" | "completed" | "inactive" | "step-mismatch";

export interface OnboardingRecord {
	kind: "flow" | "global";
	flowId?: string;
	runId?: string;
	status?: FlowStatus;
	stepId?: string;
	pendingStepId?: string;
	chatId?: number;
	messageId?: number;
	data?: Record<string, unknown>;
	startedAt?: number;
	updatedAt?: number;
	disabled?: boolean;
	queue?: { flowId: string; from?: string }[];
	preemptStack?: { flowId: string }[];
}

export interface OnboardingStorage {
	get(key: string): MaybePromise<OnboardingRecord | undefined>;
	set(key: string, value: OnboardingRecord): MaybePromise<void>;
	delete(key: string): MaybePromise<void>;
}

export type ButtonKind = "next" | "skip" | "exit" | "dismiss" | "exitAll";

export type StepButton<Steps extends string = string> =
	| ButtonKind
	| { text: string; kind: ButtonKind }
	| { text: string; goto: Steps }
	| { text: string; callbackData: string }
	| { text: string; url: string };

export interface ScopeControls {
	next?: boolean;
	skip?: boolean;
	exit?: boolean;
	dismiss?: boolean;
}

export interface ControlsConfig {
	dm?: ScopeControls;
	group?: ScopeControls;
}

export type Scope = "dm" | "group";

export interface MediaSpec {
	type: "photo" | "video" | "animation" | "document" | "audio";
	media: MediaSource | string;
	extra?: Record<string, unknown>;
}

export type StepContent<Data extends object, Steps extends string> = {
	text?: SendText | ((ctx: Context) => MaybePromise<SendText>);
	media?: MediaSpec | ((ctx: Context) => MaybePromise<MediaSpec>);
	buttons?: StepButton<Steps>[];
	buttonLabels?: Partial<Record<ButtonKind, string>>;
	__data?: Data;
};

export interface StepHooks<Steps extends string> {
	advanceOn?: (ctx: Context) => MaybePromise<boolean>;
	passthrough?: boolean;
	skipWhen?: (ctx: Context) => MaybePromise<boolean>;
	renderIn?: "dm" | "group" | "any" | ((ctx: Context) => boolean);
	controls?: ControlsConfig;
	onEnter?: (ctx: Context) => MaybePromise<unknown>;
	onLeave?: (ctx: Context, meta: { to: Steps | null; reason: LeaveReason }) => MaybePromise<unknown>;
}

export type StepConfig<Data extends object, Steps extends string> = StepContent<Data, Steps> &
	StepHooks<Steps>;

export interface OnboardingViewCtx<Steps extends string = string> {
	flowId: string;
	stepId: Steps;
	data: Record<string, unknown>;
	next: string | undefined;
	skip: string | undefined;
	exit: string;
	dismiss: string | undefined;
	exitAll: string;
	goto(id: Steps): string;
}

export interface FlowControl<Steps extends string = string> {
	readonly status: FlowStatus;
	readonly isActive: boolean;
	readonly isDismissed: boolean;
	readonly currentStep: Steps | null;
	readonly data: Record<string, unknown>;

	start(opts?: { from?: Steps; force?: boolean }): Promise<StartResult>;
	next(opts?: { from?: Steps }): Promise<NextResult>;
	goto(id: Steps): Promise<void>;
	skip(): Promise<void>;
	exit(): Promise<void>;
	dismiss(): Promise<void>;
	undismiss(): Promise<void>;
	complete(): Promise<void>;
}

export interface OnboardingNamespace {
	readonly active: { id: string; step: string } | null;
	readonly list: string[];
	readonly allDisabled: boolean;

	disableAll(): Promise<void>;
	enableAll(): Promise<void>;
	exitAll(): Promise<void>;
	flow(id: string): FlowControl | undefined;

	[flowId: string]: unknown;
}

export type ScopeResolver = "user" | "chat" | ((ctx: Context) => string);
export type ConcurrencyMode = "queue" | "preempt" | "parallel";
export type ErrorMode = "console" | "throw";

export interface CreateOnboardingOpts<Id extends string = string> {
	id: Id;
	storage?: OnboardingStorage;
	concurrency?: ConcurrencyMode;
	resumeOnStart?: boolean;
	scope?: ScopeResolver;
	controls?: ControlsConfig;
	errors?: ErrorMode;
}

export interface AdvanceForOpts<Steps extends string = string> {
	ctx: Context;
	from?: Steps;
}

export type AdvanceFor<Steps extends string = string> = (opts: AdvanceForOpts<Steps>) => Promise<NextResult>;

export type OnboardingPlugin<Id extends string, Steps extends string> = Plugin<
	Context,
	{ onboarding: OnboardingNamespace & Record<Id, FlowControl<Steps>> }
> & {
	advanceFor: AdvanceFor<Steps>;
};
