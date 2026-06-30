import type { Context, FormatResult } from "@yaebal/core";
import { InlineKeyboard, type InlineKeyboardMarkup } from "@yaebal/keyboard";
import type { FlowDefinition } from "./builder.js";
import { buttonToOp, type DecodedToken, encode, newRunId } from "./tokens.js";
import type {
	ButtonKind,
	FlowControl,
	FlowStatus,
	LeaveReason,
	MediaSpec,
	NextResult,
	OnboardingRecord,
	OnboardingStorage,
	OnboardingViewCtx,
	Scope,
	ScopeControls,
	StartResult,
	StepButton,
	StepConfig,
} from "./types.js";

export function flowKey(flowId: string, scopeKey: string): string {
	return `flow:${flowId}:${scopeKey}`;
}

export function globalKey(scopeKey: string): string {
	return `global:${scopeKey}`;
}

export function resolveScopeKey(def: FlowDefinition, ctx: Context): string {
	const scope = def.opts.scope;
	if (typeof scope === "function") return scope(ctx);
	if (scope === "chat") return String(ctx.chat?.id ?? "anonymous");

	return String(ctx.from?.id ?? "anonymous");
}

export async function loadRecord(
	storage: OnboardingStorage,
	flowId: string,
	scopeKey: string,
): Promise<OnboardingRecord | null> {
	return (await storage.get(flowKey(flowId, scopeKey))) ?? null;
}

export async function loadGlobal(
	storage: OnboardingStorage,
	scopeKey: string,
): Promise<OnboardingRecord> {
	return (await storage.get(globalKey(scopeKey))) ?? { kind: "global", disabled: false };
}

async function saveRecord(
	storage: OnboardingStorage,
	flowId: string,
	scopeKey: string,
	record: OnboardingRecord,
): Promise<void> {
	await storage.set(flowKey(flowId, scopeKey), { ...record, updatedAt: Date.now() });
}

export function detectScope(ctx: Context): Scope {
	return ctx.chat?.type === "private" ? "dm" : "group";
}

const DM_DEFAULTS: Required<ScopeControls> = {
	next: true,
	skip: true,
	exit: true,
	dismiss: true,
};

const GROUP_DEFAULTS: Required<ScopeControls> = {
	next: false,
	skip: false,
	exit: true,
	dismiss: false,
};

export function effectiveControls(
	def: FlowDefinition,
	step: StepConfig<Record<string, unknown>, string>,
	scope: Scope,
): Required<ScopeControls> {
	const base = scope === "dm" ? DM_DEFAULTS : GROUP_DEFAULTS;
	const flowOverride = def.opts.controls?.[scope];
	const stepOverride = step.controls?.[scope];

	return { ...base, ...flowOverride, ...stepOverride };
}

export function isEligibleForStep(
	ctx: Context,
	step: StepConfig<Record<string, unknown>, string>,
): boolean {
	const renderIn = step.renderIn;

	if (!renderIn || renderIn === "any") return true;
	if (typeof renderIn === "function") {
		try {
			return Boolean(renderIn(ctx));
		} catch {
			return false;
		}
	}

	return detectScope(ctx) === renderIn;
}

export function buildTokens(
	def: FlowDefinition,
	step: StepConfig<Record<string, unknown>, string>,
	stepId: string,
	runId: string,
	data: Record<string, unknown>,
	scope: Scope,
): OnboardingViewCtx {
	const controls = effectiveControls(def, step, scope);

	return {
		flowId: def.opts.id,
		stepId,
		data,
		next: controls.next ? encode("next", def.opts.id, runId, stepId) : undefined,
		skip: controls.skip ? encode("skip", def.opts.id, runId, stepId) : undefined,
		exit: encode("exit", def.opts.id, runId, stepId),
		dismiss: controls.dismiss ? encode("dismiss", def.opts.id, runId, stepId) : undefined,
		exitAll: encode("exitAll", def.opts.id, runId, stepId),
		goto: (id) => encode("goto", def.opts.id, runId, stepId, id),
	};
}

export function getStepIndex(def: FlowDefinition, stepId: string | undefined): number {
	if (!stepId) return -1;
	return def.steps.findIndex((s) => s.id === stepId);
}

export function resolveCurrentStep(
	def: FlowDefinition,
	ctx: Context,
	record: OnboardingRecord,
): { step: { id: string; config: StepConfig<Record<string, unknown>, string> } | null } {
	const idx = getStepIndex(def, record.stepId);
	if (idx >= 0) return { step: def.steps[idx] ?? null };

	const oldStepId = record.stepId ?? "";
	if (def.hooks.onMissingStep) {
		const decision = def.hooks.onMissingStep(ctx, {
			oldStepId,
			availableSteps: def.steps.map((s) => s.id),
		});

		if (decision === "complete" || decision === "exit") return { step: null };

		const found = def.steps.find((s) => s.id === decision);
		if (found) return { step: found };
	}

	return { step: def.steps[0] ?? null };
}

export interface FlowRuntime {
	def: FlowDefinition;
	storage: OnboardingStorage;
}

export interface FlowCoordinator {
	hasActiveOther(exceptFlowId: string): boolean;
	enqueueStart(entry: { flowId: string; from?: string }): Promise<void>;
	pauseOthers(starterFlowId: string): Promise<void>;
	onFlowTerminal(flowId: string, terminal: "completed" | "exited" | "dismissed"): Promise<void>;
}

const INTERNALS = Symbol.for("@yaebal/onboarding/control");

interface Internals {
	local: OnboardingRecord;
	globalLocal: OnboardingRecord;
	renderStep(step: { id: string; config: StepConfig<Record<string, unknown>, string> }): Promise<{
		pending: boolean;
	}>;
	startImpl(opts?: { from?: string; force?: boolean }): Promise<StartResult>;
	nextImpl(opts?: { from?: string }, reason?: "next" | "skip"): Promise<NextResult>;
	gotoImpl(id: string): Promise<void>;
	skipImpl(): Promise<void>;
	exitImpl(reason?: "user" | "preempt" | "exitAll"): Promise<void>;
	dismissImpl(): Promise<void>;
	undismissImpl(): Promise<void>;
	completeImpl(): Promise<void>;
	pauseImpl(): Promise<void>;
	sync(): Promise<void>;
}

export function getInternals(control: FlowControl): Internals {
	return (control as unknown as { [INTERNALS]: Internals })[INTERNALS];
}

export function makeFlowControl(
	rt: FlowRuntime,
	ctx: Context,
	scopeKey: string,
	record: OnboardingRecord | null,
	globalRec: OnboardingRecord,
	coord?: FlowCoordinator,
): FlowControl {
	const def = rt.def;
	let local: OnboardingRecord = record ?? {
		kind: "flow",
		flowId: def.opts.id,
		status: "null",
		data: {},
	};
	let globalLocal = globalRec;

	const sync = async (): Promise<void> => {
		await saveRecord(rt.storage, def.opts.id, scopeKey, local);
	};

	async function transition(
		status: FlowStatus,
		extra: Partial<OnboardingRecord> = {},
	): Promise<void> {
		local = { ...local, kind: "flow", flowId: def.opts.id, status, ...extra };
		await sync();
	}

	async function startImpl(opts: { from?: string; force?: boolean } = {}): Promise<StartResult> {
		if (globalLocal.disabled) return "opted-out";

		const status = local.status ?? "null";
		if (status === "dismissed") return "dismissed";

		if (status === "paused") {
			await transition("active");
			const current = def.steps.find((s) => s.id === local.stepId);
			if (current) await safeRender(current);
			return "resumed";
		}

		let preempted = false;
		if (status !== "active" && coord?.hasActiveOther(def.opts.id)) {
			if (def.opts.concurrency === "queue") {
				await coord.enqueueStart({
					flowId: def.opts.id,
					...(opts.from ? { from: opts.from } : {}),
				});
				return "queued";
			}

			if (def.opts.concurrency === "preempt") {
				await coord.pauseOthers(def.opts.id);
				preempted = true;
			}
		}

		if (status === "completed" && !opts.force) return "already-completed";
		if (status === "active" && def.opts.resumeOnStart && !opts.force) return "already-active";

		const startIdx = opts.from ? getStepIndex(def, opts.from) : 0;
		const firstStep = def.steps[startIdx >= 0 ? startIdx : 0];
		if (!firstStep) return "already-completed";

		local = {
			kind: "flow",
			flowId: def.opts.id,
			status: "active",
			runId: newRunId(),
			data: local.data ?? {},
			startedAt: Date.now(),
			...(ctx.chat?.id !== undefined ? { chatId: ctx.chat.id } : {}),
		};
		await sync();

		await enterStep(firstStep.id, "next");

		return preempted ? "preempted" : status === "null" ? "started" : "resumed";
	}

	async function pauseImpl(): Promise<void> {
		if (local.status !== "active") return;
		await transition("paused");
	}

	async function nextImpl(
		opts: { from?: string } = {},
		reason: "next" | "skip" = "next",
	): Promise<NextResult> {
		if (local.status !== "active") return "inactive";
		if (opts.from && opts.from !== local.stepId) return "step-mismatch";

		const idx = getStepIndex(def, local.stepId);
		if (idx < 0) {
			const { step } = resolveCurrentStep(def, ctx, local);
			if (!step) {
				await completeImpl();
				return "completed";
			}

			return enterStep(step.id, reason);
		}

		const nextStep = def.steps[idx + 1];
		if (!nextStep) {
			await completeImpl();
			return "completed";
		}

		return enterStep(nextStep.id, reason);
	}

	async function gotoImpl(id: string): Promise<void> {
		if (local.status !== "active") return;
		await enterStep(id, "goto");
	}

	async function skipImpl(): Promise<void> {
		await nextImpl({}, "skip");
	}

	async function exitImpl(reason: "user" | "preempt" | "exitAll" = "user"): Promise<void> {
		if (local.status !== "active" && local.status !== "paused") return;

		const at = local.stepId ?? "";
		await runLeave(at, null, "exit");
		await transition("exited");

		await def.hooks.onExit?.(ctx, { at, reason });
		await coord?.onFlowTerminal(def.opts.id, "exited");
	}

	async function dismissImpl(): Promise<void> {
		const at = local.stepId ?? "";
		await runLeave(at, null, "dismiss");
		await transition("dismissed");

		await def.hooks.onDismiss?.(ctx, { at });
		await coord?.onFlowTerminal(def.opts.id, "dismissed");
	}

	async function undismissImpl(): Promise<void> {
		if (local.status !== "dismissed") return;
		await transition("null");
	}

	async function completeImpl(): Promise<void> {
		const at = local.stepId ?? "";
		const data = local.data ?? {};

		await runLeave(at, null, "complete");
		await transition("completed");

		await def.hooks.onComplete?.(ctx, { data });
		await coord?.onFlowTerminal(def.opts.id, "completed");
	}

	async function enterStep(
		targetId: string,
		reason: "next" | "skip" | "goto",
	): Promise<NextResult> {
		let nextId: string | undefined = targetId;
		let from = local.stepId ?? null;
		let leaveReason: LeaveReason = reason;

		while (nextId) {
			const target = def.steps.find((s) => s.id === nextId);
			if (!target) {
				await completeImpl();
				return "completed";
			}

			await runLeave(from, target.id, leaveReason);
			await def.hooks.onStepChange?.(ctx, { from, to: target.id });
			await target.config.onEnter?.(ctx);

			local = { ...local, stepId: target.id, pendingStepId: undefined };
			await sync();

			if (await target.config.skipWhen?.(ctx)) {
				from = target.id;
				leaveReason = "skip";

				const idx = getStepIndex(def, target.id);
				nextId = def.steps[idx + 1]?.id;
				if (!nextId) {
					await completeImpl();
					return "completed";
				}

				continue;
			}

			const rendered = await safeRender(target);
			const idx = getStepIndex(def, target.id);
			if (idx >= 0 && idx + 1 >= def.steps.length && !rendered.pending) {
				await completeImpl();
				return "completed";
			}

			return "advanced";
		}

		return "inactive";
	}

	async function runLeave(
		from: string | null,
		to: string | null,
		reason: LeaveReason,
	): Promise<void> {
		if (!from) return;

		const prev = def.steps.find((s) => s.id === from);
		await prev?.config.onLeave?.(ctx, { to, reason });
	}

	async function safeRender(step: {
		id: string;
		config: StepConfig<Record<string, unknown>, string>;
	}): Promise<{ pending: boolean }> {
		const out = await renderStep(def, ctx, step, local.runId ?? "", local.data ?? {});
		if (out.pending) {
			local = { ...local, pendingStepId: step.id };
			await sync();
			return { pending: true };
		}

		local = {
			...local,
			pendingStepId: local.pendingStepId === step.id ? undefined : local.pendingStepId,
			...(out.messageId !== undefined ? { messageId: out.messageId } : {}),
		};
		await sync();

		return { pending: false };
	}

	async function run<T>(fallback: T, op: string, fn: () => Promise<T>): Promise<T> {
		try {
			return await fn();
		} catch (error) {
			if (def.opts.errors === "throw") throw error;
			console.error(`[@yaebal/onboarding][${def.opts.id}] ${op}:`, error);
			return fallback;
		}
	}

	const control: FlowControl = {
		get status() {
			return (local.status ?? "null") as FlowStatus;
		},
		get isActive() {
			return local.status === "active";
		},
		get isDismissed() {
			return local.status === "dismissed";
		},
		get currentStep() {
			return (local.stepId ?? null) as string | null;
		},
		get data() {
			local.data ??= {};
			return local.data;
		},
		start: (opts) => run<StartResult>("already-active", "start", () => startImpl(opts)),
		next: (opts) => run<NextResult>("inactive", "next", () => nextImpl(opts)),
		goto: (id) => run<void>(undefined, "goto", () => gotoImpl(id)),
		skip: () => run<void>(undefined, "skip", () => skipImpl()),
		exit: () => run<void>(undefined, "exit", () => exitImpl("user")),
		dismiss: () => run<void>(undefined, "dismiss", () => dismissImpl()),
		undismiss: () => run<void>(undefined, "undismiss", () => undismissImpl()),
		complete: () => run<void>(undefined, "complete", () => completeImpl()),
	};

	Object.defineProperty(control, INTERNALS, {
		enumerable: false,
		value: {
			get local() {
				return local;
			},
			set local(value: OnboardingRecord) {
				local = value;
			},
			get globalLocal() {
				return globalLocal;
			},
			set globalLocal(value: OnboardingRecord) {
				globalLocal = value;
			},
			renderStep: safeRender,
			startImpl,
			nextImpl,
			gotoImpl,
			skipImpl,
			exitImpl,
			dismissImpl,
			undismissImpl,
			completeImpl,
			pauseImpl,
			sync,
		} satisfies Internals,
	});

	return control;
}

async function renderStep(
	def: FlowDefinition,
	ctx: Context,
	step: { id: string; config: StepConfig<Record<string, unknown>, string> },
	runId: string,
	data: Record<string, unknown>,
): Promise<{ messageId?: number; pending: boolean }> {
	if (!isEligibleForStep(ctx, step.config)) return { pending: true };

	const scope = detectScope(ctx);
	const tokens = buildTokens(def, step.config, step.id, runId, data, scope);
	const { keyboard, hasButtons } = buildKeyboard(step.config, tokens);
	const replyMarkup = hasButtons ? keyboard : undefined;
	const text = await resolveText(step.config, ctx);
	const media = await resolveMedia(step.config, ctx);

	if (media) {
		const messageId = await sendMedia(ctx, media, text, replyMarkup);
		return { messageId, pending: false };
	}

	if (!text) return { pending: false };

	const message = ctx.callbackQuery?.message;
	const chatId = message?.chat?.id ?? ctx.chat?.id;
	if (ctx.updateType === "callback_query" && message && chatId !== undefined) {
		try {
			await ctx.api.call("editMessageText", {
				chat_id: chatId,
				message_id: message.message_id,
				...textParams(text),
				...(replyMarkup ? { reply_markup: replyMarkup } : {}),
			});
			return { messageId: message.message_id, pending: false };
		} catch {
			// some callback messages cannot be edited; fall back to sending a fresh one.
		}
	}

	const sent = await ctx.send(text.text, {
		...(text.entities ? { entities: text.entities } : {}),
		...(replyMarkup ? { reply_markup: replyMarkup } : {}),
	});

	return { messageId: extractMessageId(sent), pending: false };
}

async function resolveText(
	step: StepConfig<Record<string, unknown>, string>,
	ctx: Context,
): Promise<{ text: string; entities?: FormatResult["entities"] } | undefined> {
	const value = typeof step.text === "function" ? await step.text(ctx) : step.text;
	if (value === undefined) return undefined;
	if (typeof value === "string") return { text: value };

	return { text: value.text, entities: value.entities };
}

async function resolveMedia(
	step: StepConfig<Record<string, unknown>, string>,
	ctx: Context,
): Promise<MediaSpec | undefined> {
	return typeof step.media === "function" ? await step.media(ctx) : step.media;
}

function textParams(text: {
	text: string;
	entities?: FormatResult["entities"];
}): Record<string, unknown> {
	return {
		text: text.text,
		...(text.entities ? { entities: text.entities } : {}),
	};
}

async function sendMedia(
	ctx: Context,
	media: MediaSpec,
	text: { text: string; entities?: FormatResult["entities"] } | undefined,
	replyMarkup: InlineKeyboardMarkup | undefined,
): Promise<number | undefined> {
	const chatId = ctx.chat?.id;
	if (chatId === undefined) return undefined;

	const methods: Record<MediaSpec["type"], string> = {
		photo: "sendPhoto",
		video: "sendVideo",
		animation: "sendAnimation",
		document: "sendDocument",
		audio: "sendAudio",
	};

	const sent = await ctx.api.call(methods[media.type], {
		chat_id: chatId,
		[media.type]: media.media,
		...(text ? { caption: text.text } : {}),
		...(text?.entities ? { caption_entities: text.entities } : {}),
		...(replyMarkup ? { reply_markup: replyMarkup } : {}),
		...media.extra,
	});

	return extractMessageId(sent);
}

function buildKeyboard(
	step: StepConfig<Record<string, unknown>, string>,
	tokens: OnboardingViewCtx,
): { keyboard: InlineKeyboardMarkup; hasButtons: boolean } {
	const kb = new InlineKeyboard();
	let added = 0;

	for (const button of step.buttons ?? []) {
		const resolved = resolveButton(button, step.buttonLabels, tokens);
		if (!resolved) continue;

		if (added > 0) kb.row();
		if (resolved.url) kb.url(resolved.text, resolved.url);
		else kb.text(resolved.text, resolved.callbackData);

		added++;
	}

	return { keyboard: kb.build(), hasButtons: added > 0 };
}

function resolveButton(
	button: StepButton,
	labels: Partial<Record<ButtonKind, string>> | undefined,
	tokens: OnboardingViewCtx,
):
	| { text: string; callbackData: string; url?: undefined }
	| { text: string; url: string; callbackData: string }
	| null {
	if (typeof button === "string") {
		const data = pickToken(button, tokens);
		return data ? { text: labels?.[button] ?? defaultLabel(button), callbackData: data } : null;
	}

	if ("kind" in button) {
		const data = pickToken(button.kind, tokens);
		return data ? { text: button.text, callbackData: data } : null;
	}

	if ("goto" in button) return { text: button.text, callbackData: tokens.goto(button.goto) };
	if ("callbackData" in button) return { text: button.text, callbackData: button.callbackData };

	return { text: button.text, url: button.url, callbackData: "" };
}

function pickToken(kind: ButtonKind, tokens: OnboardingViewCtx): string | undefined {
	if (kind === "next") return tokens.next;
	if (kind === "skip") return tokens.skip;
	if (kind === "exit") return tokens.exit;
	if (kind === "dismiss") return tokens.dismiss;

	return tokens.exitAll;
}

function defaultLabel(kind: ButtonKind): string {
	if (kind === "next") return "next";
	if (kind === "skip") return "skip";
	if (kind === "dismiss") return "don't show again";
	if (kind === "exitAll") return "exit all";

	return "exit";
}

function extractMessageId(sent: unknown): number | undefined {
	if (sent && typeof sent === "object" && "message_id" in sent) {
		const id = (sent as { message_id: unknown }).message_id;
		if (typeof id === "number") return id;
	}

	if (sent && typeof sent === "object" && "id" in sent) {
		const id = (sent as { id: unknown }).id;
		if (typeof id === "number") return id;
	}

	return undefined;
}

export async function handleCallback(
	ctx: Context,
	control: FlowControl,
	token: DecodedToken,
): Promise<boolean> {
	const internals = getInternals(control);
	const local = internals.local;

	if (local.runId && token.runId && local.runId !== token.runId) {
		await answerCallback(ctx, "already moving on");
		return true;
	}

	const needsStepMatch = token.op === "next" || token.op === "skip" || token.op === "goto";
	if (needsStepMatch && local.stepId !== token.stepId) {
		await answerCallback(ctx, "already moving on");
		return true;
	}

	if (token.op === "next") await internals.nextImpl();
	else if (token.op === "skip") await internals.skipImpl();
	else if (token.op === "goto" && token.target) await internals.gotoImpl(token.target);
	else if (token.op === "exit") await internals.exitImpl("user");
	else if (token.op === "dismiss") await internals.dismissImpl();
	else if (token.op === "exitAll") await internals.exitImpl("exitAll");

	await answerCallback(ctx);
	return true;
}

export async function answerCallback(ctx: Context, text?: string): Promise<void> {
	try {
		await ctx.answerCallbackQuery(text ? { text } : {});
	} catch {
		// telegram allows answering a callback query only once.
	}
}

export function actionForButton(kind: ButtonKind): string {
	return buttonToOp(kind);
}
