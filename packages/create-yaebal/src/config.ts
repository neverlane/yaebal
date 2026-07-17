/**
 * the fully-resolved set of choices that drives generation. every front-end
 * (flags-only, plain prompts, tui) produces one of these; `writeProject` and
 * `renderFiles` consume it.
 */

import type { ParsedArgs } from "./args.js";
import {
	AI_AGENT_IDS,
	type DeployTarget,
	type PackageManager,
	PLUGIN_IDS,
	type Runtime,
	type TemplateId,
} from "./catalog.js";
import { defaultPackageManager } from "./scaffold.js";
import { detectPackageManager, detectRuntime } from "./util.js";

export interface Selections {
	name: string;
	runtime: Runtime;
	packageManager: PackageManager;
	template: TemplateId;
	plugins: string[];
	/** "none" for the plugin template — a plugin package has nowhere to deploy */
	deploy: DeployTarget;
	/** ai coding agents to pre-configure in the generated project ([] = none) */
	ai: string[];
	ci: boolean;
	git: boolean;
	install: boolean;
}

/** the sensible default for each field, given what the user already passed. */
export function defaults(args: ParsedArgs): Selections {
	const runtime = args.runtime ?? detectRuntime();
	const packageManager =
		args.packageManager ?? detectPackageManager() ?? defaultPackageManager(runtime);
	const template = args.template ?? "minimal";

	return {
		name: args.name ?? "my-bot",
		runtime,
		packageManager,
		template,
		plugins: template === "plugin" ? [] : (args.plugins ?? ["session", "again", "fmt"]),
		deploy: template === "plugin" ? "none" : (args.deploy ?? "none"),
		ai: args.ai ?? [],
		ci: args.ci ?? false,
		git: args.git ?? true,
		install: args.install ?? false,
	};
}

/** drop any plugin ids that aren't in the catalog, preserving order + dedupe. */
export function sanitizePlugins(ids: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];

	for (const id of ids) {
		if (PLUGIN_IDS.includes(id) && !seen.has(id)) {
			seen.add(id);
			out.push(id);
		}
	}

	return out;
}

/** drop any agent ids `@yaebal/ai` doesn't know, preserving order + dedupe. */
export function sanitizeAgents(ids: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];

	for (const id of ids) {
		if (AI_AGENT_IDS.includes(id) && !seen.has(id)) {
			seen.add(id);
			out.push(id);
		}
	}

	return out;
}
