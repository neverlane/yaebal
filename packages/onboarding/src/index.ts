/**
 * @yaebal/onboarding
 *
 * declarative, typed onboarding flows for first-run tours, feature hints, and
 * product tutorials. build a flow, install it, then start it from any handler
 * through `ctx.onboarding.<id>.start()`.
 */

export {
	createOnboarding,
	type FlowDefinition,
	type FlowHooks,
	type OnboardingBuilder,
} from "./builder.js";
export { MemoryOnboardingStorage, memoryStorage } from "./storage.js";
export { decode as decodeOnboardingToken, encode as encodeOnboardingToken } from "./tokens.js";
export type {
	AdvanceFor,
	AdvanceForOpts,
	ButtonKind,
	ConcurrencyMode,
	ControlsConfig,
	CreateOnboardingOpts,
	ErrorMode,
	ExitReason,
	FlowControl,
	FlowStatus,
	LeaveReason,
	MediaSpec,
	NextResult,
	OnboardingNamespace,
	OnboardingPlugin,
	OnboardingRecord,
	OnboardingStorage,
	OnboardingViewCtx,
	Scope,
	ScopeControls,
	ScopeResolver,
	SendText,
	StartResult,
	StepButton,
	StepConfig,
	StepContent,
	StepHooks,
} from "./types.js";
