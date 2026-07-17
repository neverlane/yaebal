/**
 * optional config file: `create-yaebal.json` in the cwd, an explicit
 * `--config <path>`, or a `"create-yaebal"` key in the local `package.json` —
 * so a team can commit defaults instead of retyping flags every time.
 *
 * cli flags always win. this module only produces values to fill gaps a flag
 * left `undefined`; `applyConfigFile` in `index.ts`'s pipeline does the merge.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ParsedArgs } from "./args.js";
import {
	AI_AGENT_IDS,
	isAiAgent,
	isDeploy,
	isPackageManager,
	isRuntime,
	isTemplate,
} from "./catalog.js";

export type ConfigFileShape = Partial<
	Pick<
		ParsedArgs,
		| "name"
		| "runtime"
		| "packageManager"
		| "template"
		| "plugins"
		| "deploy"
		| "ai"
		| "ci"
		| "git"
		| "install"
	>
>;

export interface ConfigFileResult {
	values: ConfigFileShape;
	/** where the values came from, for a friendly log line; undefined when nothing was found */
	source?: string;
	warnings: string[];
}

function validate(raw: unknown, source: string): ConfigFileResult {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return { values: {}, source, warnings: [`${source}: expected a json object`] };
	}

	const obj = raw as Record<string, unknown>;
	const warnings: string[] = [];
	const values: ConfigFileShape = {};

	if (typeof obj.name === "string") values.name = obj.name;

	if (obj.runtime !== undefined) {
		if (typeof obj.runtime === "string" && isRuntime(obj.runtime)) values.runtime = obj.runtime;
		else warnings.push(`${source}: "runtime" value ${JSON.stringify(obj.runtime)} is not valid`);
	}

	if (obj.packageManager !== undefined) {
		if (typeof obj.packageManager === "string" && isPackageManager(obj.packageManager)) {
			values.packageManager = obj.packageManager;
		} else {
			warnings.push(
				`${source}: "packageManager" value ${JSON.stringify(obj.packageManager)} is not valid`,
			);
		}
	}

	if (obj.template !== undefined) {
		if (typeof obj.template === "string" && isTemplate(obj.template))
			values.template = obj.template;
		else warnings.push(`${source}: "template" value ${JSON.stringify(obj.template)} is not valid`);
	}

	if (obj.plugins !== undefined) {
		if (Array.isArray(obj.plugins) && obj.plugins.every((p) => typeof p === "string")) {
			values.plugins = obj.plugins as string[];
		} else {
			warnings.push(`${source}: "plugins" must be an array of strings`);
		}
	}

	if (obj.deploy !== undefined) {
		if (typeof obj.deploy === "string" && isDeploy(obj.deploy)) values.deploy = obj.deploy;
		else warnings.push(`${source}: "deploy" value ${JSON.stringify(obj.deploy)} is not valid`);
	}

	if (obj.ai !== undefined) {
		if (Array.isArray(obj.ai) && obj.ai.every((a) => typeof a === "string")) {
			const unknown = (obj.ai as string[]).filter((a) => !isAiAgent(a));
			if (unknown.length === 0) {
				values.ai = obj.ai as string[];
			} else {
				warnings.push(
					`${source}: "ai" has unknown agent id(s) ${unknown
						.map((a) => JSON.stringify(a))
						.join(", ")} — known: ${AI_AGENT_IDS.join(", ")}`,
				);
			}
		} else {
			warnings.push(`${source}: "ai" must be an array of strings`);
		}
	}

	if (typeof obj.ci === "boolean") values.ci = obj.ci;
	if (typeof obj.git === "boolean") values.git = obj.git;
	if (typeof obj.install === "boolean") values.install = obj.install;

	return { values, source, warnings };
}

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * resolve config-file defaults: an explicit `--config <path>` always wins (and
 * is an error if missing/invalid); otherwise autodetect `create-yaebal.json`,
 * then a `"create-yaebal"` key in `package.json`, both in `cwd`. `disabled`
 * (`--no-config`) skips autodetection but not an explicit `--config`.
 */
export function loadConfigFile(
	cwd: string,
	explicitPath: string | undefined,
	disabled: boolean,
): ConfigFileResult {
	if (explicitPath !== undefined) {
		const path = resolve(cwd, explicitPath);
		if (!existsSync(path)) return { values: {}, warnings: [`--config ${explicitPath}: not found`] };

		try {
			return validate(readJson(path), explicitPath);
		} catch {
			return { values: {}, warnings: [`--config ${explicitPath}: invalid json`] };
		}
	}

	if (disabled) return { values: {}, warnings: [] };

	const jsonPath = join(cwd, "create-yaebal.json");
	if (existsSync(jsonPath)) {
		try {
			return validate(readJson(jsonPath), "create-yaebal.json");
		} catch {
			return { values: {}, warnings: ["create-yaebal.json: invalid json"] };
		}
	}

	const pkgPath = join(cwd, "package.json");
	if (existsSync(pkgPath)) {
		try {
			const pkg = readJson(pkgPath);
			if (pkg && typeof pkg === "object" && "create-yaebal" in pkg) {
				return validate(
					(pkg as Record<string, unknown>)["create-yaebal"],
					'package.json "create-yaebal"',
				);
			}
		} catch {
			// an unparsable package.json lying around in cwd isn't this tool's problem
		}
	}

	return { values: {}, warnings: [] };
}

/** cli flags always win — fills in only what a flag left `undefined`. */
export function applyConfigFile(args: ParsedArgs, config: ConfigFileShape): ParsedArgs {
	return {
		...args,
		name: args.name ?? config.name,
		runtime: args.runtime ?? config.runtime,
		packageManager: args.packageManager ?? config.packageManager,
		template: args.template ?? config.template,
		plugins: args.plugins ?? config.plugins,
		deploy: args.deploy ?? config.deploy,
		ai: args.ai ?? config.ai,
		ci: args.ci ?? config.ci,
		git: args.git ?? config.git,
		install: args.install ?? config.install,
	};
}
