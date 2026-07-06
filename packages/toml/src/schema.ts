import { updateNames } from "@yaebal/core";
import { z } from "zod";
import type { TomlBotConfig } from "./types.js";

const requiredString = z.string().min(1);
const optionalString = z.string().optional();

const responseShape = {
	reply: optionalString,
	handler: requiredString.optional(),
};

function hasResponse(route: { reply?: string; handler?: string }): boolean {
	return route.reply !== undefined || route.handler !== undefined;
}

function requireResponse(route: { reply?: string; handler?: string }, ctx: z.RefinementCtx): void {
	if (!hasResponse(route)) {
		ctx.addIssue({ code: "custom", message: "must define either reply or handler" });
	}
}

function requireExactlyOneTrigger(
	route: Record<string, string | undefined>,
	ctx: z.RefinementCtx,
	first: string,
	second: string,
): void {
	const hasFirst = route[first] !== undefined;
	const hasSecond = route[second] !== undefined;

	if (hasFirst && hasSecond) {
		ctx.addIssue({ code: "custom", message: `must not define both ${first} and ${second}` });
	} else if (!hasFirst && !hasSecond) {
		ctx.addIssue({ code: "custom", message: `must define either ${first} or ${second}` });
	}
}

const regexString = requiredString.superRefine((source, ctx) => {
	try {
		new RegExp(source);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		ctx.addIssue({ code: "custom", message: `is not a valid regular expression: ${detail}` });
	}
});

const filterQueryString = requiredString.superRefine((query, ctx) => {
	const head = query.split(":")[0];

	if (head && !(updateNames as readonly string[]).includes(head)) {
		ctx.addIssue({
			code: "custom",
			message: `unknown update type "${head}" (expected one of: ${updateNames.join(", ")})`,
		});
	}
});

const commandSchema = z
	.object({
		name: requiredString,
		description: z.string().min(1).max(256).optional(),
		...responseShape,
	})
	.superRefine(requireResponse);

const hearSchema = z
	.object({
		text: optionalString,
		regex: regexString.optional(),
		...responseShape,
	})
	.superRefine((route, ctx) => {
		requireResponse(route, ctx);
		requireExactlyOneTrigger(route, ctx, "text", "regex");
	});

const messageSchema = z
	.object({
		on: filterQueryString,
		contains: optionalString,
		equals: optionalString,
		...responseShape,
	})
	.superRefine(requireResponse);

const callbackSchema = z
	.object({
		data: optionalString,
		regex: regexString.optional(),
		...responseShape,
	})
	.superRefine((route, ctx) => {
		requireResponse(route, ctx);
		requireExactlyOneTrigger(route, ctx, "data", "regex");
	});

export const tomlBotConfigSchema = z.object({
	bot: z
		.object({
			name: optionalString,
		})
		.optional(),
	commands: z.array(commandSchema).optional(),
	hears: z.array(hearSchema).optional(),
	messages: z.array(messageSchema).optional(),
	callbacks: z.array(callbackSchema).optional(),
});

function formatPath(path: PropertyKey[]): string {
	let out = "";

	for (const segment of path) {
		if (typeof segment === "number") {
			out += `[${segment}]`;
		} else {
			out += out ? `.${String(segment)}` : String(segment);
		}
	}

	return out || "config";
}

function isMissingRequired(issue: z.ZodIssue): boolean {
	const details = issue as z.ZodIssue & { input?: unknown; received?: string };
	const message = issue.message.toLowerCase();

	return (
		issue.code === "invalid_type" &&
		(details.input === undefined ||
			details.received === "undefined" ||
			message.includes("required") ||
			message.includes("undefined"))
	);
}

function formatIssue(issue: z.ZodIssue): string {
	const path = formatPath(issue.path);

	if (issue.code === "custom") return `${path} ${issue.message}`;
	if (isMissingRequired(issue)) return `${path} is required`;

	return `${path}: ${issue.message}`;
}

/** validate an already parsed toml bot config and return the normalized object. */
export function validateTomlConfig(input: unknown): TomlBotConfig {
	const result = tomlBotConfigSchema.safeParse(input);

	if (result.success) return result.data;

	throw new Error(result.error.issues.map(formatIssue).join("; "));
}
