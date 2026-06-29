import type { Context, Plugin } from "@yaebal/core";
import type { FlowDefinition } from "./builder.js";
import { memoryStorage } from "./storage.js";
import { decode } from "./tokens.js";
import type { AdvanceFor, FlowControl, OnboardingNamespace, OnboardingStorage } from "./types.js";
import {
	answerCallback,
	getInternals,
	globalKey,
	handleCallback,
	isEligibleForStep,
	loadGlobal,
	loadRecord,
	makeFlowControl,
	resolveCurrentStep,
	resolveScopeKey,
	type FlowCoordinator,
	type FlowRuntime,
} from "./runner.js";

const NS_MARKER = Symbol.for("@yaebal/onboarding/ns");

const flowRegistry = new Map<string, FlowRuntime>();

interface InternalNamespace extends OnboardingNamespace {
	[NS_MARKER]: true;
	"~controls": Map<string, FlowControl>;
	"~storages": Map<string, OnboardingStorage>;
	"~scopeKeys": Map<string, string>;
	"~coord": FlowCoordinator;
	"~ctx": Context;
}

let defaultStorageInstance: OnboardingStorage | null = null;

function getDefaultStorage(): OnboardingStorage {
	defaultStorageInstance ??= memoryStorage();
	return defaultStorageInstance;
}

export function createOnboardingPlugin(
	def: FlowDefinition,
): Plugin<Context, { onboarding: OnboardingNamespace }> & { advanceFor: AdvanceFor } {
	const storage = def.opts.storage ?? getDefaultStorage();
	const flowId = def.opts.id;
	const rt: FlowRuntime = { def, storage };

	flowRegistry.set(flowId, rt);

	const plugin: Plugin<Context, { onboarding: OnboardingNamespace }> = (composer) =>
		composer
			.derive(async (ctx) => {
				const ns = await upsertNamespace(ctx);
				await renderPending(ns);

				return { onboarding: ns as OnboardingNamespace };
			})
			.use(async (ctx, next) => {
				const ns = (ctx as unknown as Context & { onboarding: InternalNamespace }).onboarding;
				const control = ns[flowId] as FlowControl | undefined;

				if (!ctx.message || !control || control.status !== "active") return next();

				const stepId = control.currentStep;
				if (!stepId) return next();

				const step = def.steps.find((s) => s.id === stepId);
				if (!step?.config.advanceOn) return next();

				const matched = await step.config.advanceOn(ctx);
				if (matched) await control.next({ from: stepId });

				if (matched && step.config.passthrough === false) return;
				return next();
			})
			.use(async (ctx, next) => {
				const data = ctx.callbackQuery?.data;
				if (!data) return next();

				const token = decode(data);
				if (!token || token.flowId !== flowId) return next();

				const ns = (ctx as unknown as Context & { onboarding: InternalNamespace }).onboarding;
				if (token.op === "exitAll") {
					await ns.exitAll();
					await answerCallback(ctx);
					return;
				}

				const control = ns[flowId] as FlowControl | undefined;
				if (!control) return next();

				await handleCallback(ctx, control, token);
			});

	const advanceFor: AdvanceFor = async (opts) => {
		const scopeKey = resolveScopeKey(def, opts.ctx);
		const [globalRec, record] = await Promise.all([
			loadGlobal(storage, scopeKey),
			loadRecord(storage, flowId, scopeKey),
		]);
		const control = makeFlowControl(rt, opts.ctx, scopeKey, record, globalRec);

		return control.next(opts.from ? { from: opts.from } : undefined);
	};

	return Object.assign(plugin, { advanceFor });
}

async function upsertNamespace(ctx: Context): Promise<InternalNamespace> {
	const existing = (ctx as { onboarding?: unknown }).onboarding as InternalNamespace | undefined;
	if (existing?.[NS_MARKER]) {
		existing["~ctx"] = ctx;
		return existing;
	}

	const controls = new Map<string, FlowControl>();
	const storages = new Map<string, OnboardingStorage>();
	const scopeKeys = new Map<string, string>();
	let nsRef: InternalNamespace | null = null;

	const canonical = (): { storage: OnboardingStorage; scopeKey: string } | undefined => {
		const first = storages.entries().next().value;
		if (!first) return undefined;

		const [id, storage] = first;
		const scopeKey = scopeKeys.get(id);
		if (!scopeKey) return undefined;

		return { storage, scopeKey };
	};

	const coord: FlowCoordinator = {
		hasActiveOther(exceptFlowId) {
			for (const [id, control] of controls) {
				if (id === exceptFlowId) continue;
				if (control.status === "active" || control.status === "paused") return true;
			}

			return false;
		},

		async enqueueStart(entry) {
			const c = canonical();
			if (!c) return;

			const global = (await c.storage.get(globalKey(c.scopeKey))) ?? { kind: "global" as const };
			await c.storage.set(globalKey(c.scopeKey), {
				...global,
				queue: [...(global.queue ?? []), entry],
			});
		},

		async pauseOthers(starterFlowId) {
			const c = canonical();
			if (!c) return;

			let global = (await c.storage.get(globalKey(c.scopeKey))) ?? { kind: "global" as const };
			for (const [id, control] of controls) {
				if (id === starterFlowId || control.status !== "active") continue;

				await getInternals(control).pauseImpl();
				global = { ...global, preemptStack: [...(global.preemptStack ?? []), { flowId: id }] };
			}

			await c.storage.set(globalKey(c.scopeKey), global);
		},

		async onFlowTerminal(_flowId) {
			const c = canonical();
			if (!c) return;

			const global = (await c.storage.get(globalKey(c.scopeKey))) ?? { kind: "global" as const };
			const stack = global.preemptStack ?? [];

			if (stack.length > 0) {
				const next = stack[stack.length - 1];
				await c.storage.set(globalKey(c.scopeKey), {
					...global,
					preemptStack: stack.slice(0, -1),
				});

				const control = next ? controls.get(next.flowId) : undefined;
				await control?.start();
				return;
			}

			const queue = global.queue ?? [];
			const [head, ...rest] = queue;
			if (!head) return;

			await c.storage.set(globalKey(c.scopeKey), { ...global, queue: rest });
			await controls.get(head.flowId)?.start(head.from ? { from: head.from } : undefined);
		},
	};

	const ns: InternalNamespace = {
		[NS_MARKER]: true,
		"~controls": controls,
		"~storages": storages,
		"~scopeKeys": scopeKeys,
		"~coord": coord,
		"~ctx": ctx,
		list: [],

		get active() {
			for (const [id, control] of controls) {
				if (control.status === "active") return { id, step: control.currentStep ?? "" };
			}

			return null;
		},

		get allDisabled() {
			for (const control of controls.values()) {
				if (getInternals(control).globalLocal.disabled) return true;
			}

			return false;
		},

		flow(id) {
			return controls.get(id);
		},

		async disableAll() {
			await Promise.all(
				[...storages.entries()].map(async ([id, storage]) => {
					const scopeKey = scopeKeys.get(id);
					if (!scopeKey) return;

					const record = { kind: "global" as const, disabled: true };
					await storage.set(globalKey(scopeKey), record);
					const control = controls.get(id);
					if (control) getInternals(control).globalLocal = record;
				}),
			);
		},

		async enableAll() {
			await Promise.all(
				[...storages.entries()].map(async ([id, storage]) => {
					const scopeKey = scopeKeys.get(id);
					if (!scopeKey) return;

					const record = { kind: "global" as const, disabled: false };
					await storage.set(globalKey(scopeKey), record);
					const control = controls.get(id);
					if (control) getInternals(control).globalLocal = record;
				}),
			);
		},

		async exitAll() {
			for (const control of controls.values()) {
				if (control.status === "active" || control.status === "paused") {
					await getInternals(control).exitImpl("exitAll");
				}
			}

			await ns.disableAll();
		},
	};

	nsRef = ns;
	await refreshNamespace(nsRef);
	return ns;
}

async function refreshNamespace(ns: InternalNamespace): Promise<void> {
	for (const [flowId, rt] of flowRegistry) {
		const scopeKey = resolveScopeKey(rt.def, ns["~ctx"]);
		const [globalRec, record] = await Promise.all([
			loadGlobal(rt.storage, scopeKey),
			loadRecord(rt.storage, flowId, scopeKey),
		]);

		let activeRecord = record;
		if (
			record?.status === "active" &&
			record.stepId &&
			!rt.def.steps.some((s) => s.id === record.stepId)
		) {
			const { step } = resolveCurrentStep(rt.def, ns["~ctx"], record);
			activeRecord = step ? { ...record, stepId: step.id } : { ...record, status: "completed" };
			await rt.storage.set(`flow:${flowId}:${scopeKey}`, activeRecord);
		}

		const control = makeFlowControl(rt, ns["~ctx"], scopeKey, activeRecord, globalRec, ns["~coord"]);
		ns[flowId] = control;
		ns["~controls"].set(flowId, control);
		ns["~storages"].set(flowId, rt.storage);
		ns["~scopeKeys"].set(flowId, scopeKey);
		if (!ns.list.includes(flowId)) ns.list.push(flowId);
	}
}

async function renderPending(ns: InternalNamespace): Promise<void> {
	for (const [flowId, control] of ns["~controls"]) {
		const internals = getInternals(control);
		const pendingStepId = internals.local.pendingStepId;
		if (control.status !== "active" || !pendingStepId) continue;

		const rt = flowRegistry.get(flowId);
		const step = rt?.def.steps.find((s) => s.id === pendingStepId);
		if (!rt || !step || !isEligibleForStep(ns["~ctx"], step.config)) continue;

		const rendered = await internals.renderStep(step);
		const idx = rt.def.steps.findIndex((s) => s.id === step.id);
		if (!rendered.pending && idx >= 0 && idx + 1 >= rt.def.steps.length) {
			await internals.completeImpl();
		}
	}
}
