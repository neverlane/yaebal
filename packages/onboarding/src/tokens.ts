import type { ButtonKind } from "./types.js";

export const PREFIX = "onb";
const SEP = ":";

export type Op = "next" | "skip" | "exit" | "dismiss" | "exitAll" | "goto";

export interface DecodedToken {
	op: Op;
	flowId: string;
	runId: string;
	stepId: string;
	target?: string;
}

export function encode(
	op: Op,
	flowId: string,
	runId: string,
	stepId: string,
	target?: string,
): string {
	const base = `${PREFIX}${SEP}${op}${SEP}${flowId}${SEP}${runId}${SEP}${stepId}`;
	const out = target ? `${base}${SEP}${target}` : base;

	if (out.length > 64) {
		throw new Error(
			`@yaebal/onboarding: callback_data too long (${out.length} > 64). shorten flowId/stepId.`,
		);
	}

	return out;
}

export function decode(data: string): DecodedToken | null {
	if (!data.startsWith(`${PREFIX}${SEP}`)) return null;

	const parts = data.split(SEP);
	if (parts.length < 5) return null;

	const [, op, flowId, runId, stepId, target] = parts;
	if (!op || !flowId || !runId || !stepId) return null;
	if (!isOp(op)) return null;

	const result: DecodedToken = { op, flowId, runId, stepId };
	if (target) result.target = target;

	return result;
}

const OPS: Record<Op, true> = {
	next: true,
	skip: true,
	exit: true,
	dismiss: true,
	exitAll: true,
	goto: true,
};

function isOp(s: string): s is Op {
	return s in OPS;
}

const BUTTON_TO_OP: Record<ButtonKind, Op> = {
	next: "next",
	skip: "skip",
	exit: "exit",
	dismiss: "dismiss",
	exitAll: "exitAll",
};

export function buttonToOp(kind: ButtonKind): Op {
	return BUTTON_TO_OP[kind];
}

export function newRunId(): string {
	return Math.random().toString(36).slice(2, 8);
}
