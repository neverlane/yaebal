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

const commandSchema = z
	.object({
		name: requiredString,
		description: optionalString,
		...responseShape,
	})
	.superRefine((route, ctx) => {
		if (!hasResponse(route)) {
			ctx.addIssue({ code: "custom", message: "must define either reply or handler" });
		}
	});

const hearSchema = z
	.object({
		text: requiredString,
		...responseShape,
	})
	.superRefine((route, ctx) => {
		if (!hasResponse(route)) {
			ctx.addIssue({ code: "custom", message: "must define either reply or handler" });
		}
	});

const messageSchema = z
	.object({
		on: requiredString,
		contains: optionalString,
		equals: optionalString,
		...responseShape,
	})
	.superRefine((route, ctx) => {
		if (!hasResponse(route)) {
			ctx.addIssue({ code: "custom", message: "must define either reply or handler" });
		}
	});

const callbackSchema = z
	.object({
		data: requiredString,
		...responseShape,
	})
	.superRefine((route, ctx) => {
		if (!hasResponse(route)) {
			ctx.addIssue({ code: "custom", message: "must define either reply or handler" });
		}
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
