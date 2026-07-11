/**
 * compile smoke test: every template's generated project must type-check against
 * the real workspace `@yaebal/*` packages ("everything it generates type-checks
 * against the real `@yaebal/*` apis" — this is what enforces it). runs over the
 * built `lib/` output of the workspace, so `pnpm build` must have run first
 * (root `pnpm test` does).
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { DEPLOYS, PLUGIN_IDS, TEMPLATES, type TemplateId } from "./catalog.js";
import { renderFiles, type ScaffoldOptions } from "./scaffold.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** the compiler options `renderFiles` puts in a generated bot project's tsconfig. */
const GENERATED_OPTIONS: ts.CompilerOptions = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	lib: ["lib.es2023.d.ts"],
	strict: true,
	noUncheckedIndexedAccess: true,
	verbatimModuleSyntax: true,
	skipLibCheck: true,
	allowImportingTsExtensions: true,
	noEmit: true,
	types: ["node"],
	typeRoots: [join(repoRoot, "node_modules/@types")],
	// resolve "@yaebal/x" to the built workspace package instead of npm
	paths: { "@yaebal/*": [join(repoRoot, "packages/*/lib/index.d.ts")] },
};

function writeProject(dir: string, files: Record<string, string>): void {
	for (const [path, content] of Object.entries(files)) {
		const target = join(dir, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content);
	}
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
	return diagnostics.map((d) => {
		const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
		if (!d.file || d.start === undefined) return message;
		const { line } = d.file.getLineAndCharacterOfPosition(d.start);
		return `${d.file.fileName}:${line + 1} ${message}`;
	});
}

test("every generated project type-checks against the workspace packages", () => {
	assert.ok(
		existsSync(join(repoRoot, "packages/core/lib/index.d.ts")),
		"workspace lib/ output missing — run `pnpm build` at the repo root first",
	);

	const root = mkdtempSync(join(tmpdir(), "yaebal-scaffold-typecheck-"));

	try {
		const entries: string[] = [];

		const renderOpts = (dirLabel: string, opts: ScaffoldOptions) => {
			const dir = join(root, dirLabel);
			const files = renderFiles(opts);
			writeProject(dir, files);
			for (const path of Object.keys(files)) {
				if (path.endsWith(".ts")) entries.push(join(dir, path));
			}
		};

		const render = (name: string, template: TemplateId, plugins: string[]) =>
			renderOpts(`gen-${name}`, { name, runtime: "node", plugins, template });

		// every template on its own (the plugin template contributes its test file too)
		for (const { value } of TEMPLATES) render(value, value, []);
		// and the whole plugin catalog at once — proves every import/install/setup wiring compiles
		render("all-plugins", "minimal", [...PLUGIN_IDS]);

		// every deploy target — cloudflare/vercel replace/add a real entry that
		// imports from @yaebal/web, on top of both a polling and a webhook template.
		for (const { value: deploy } of DEPLOYS) {
			if (deploy === "none") continue;
			renderOpts(`gen-deploy-${deploy}-minimal`, {
				name: `deploy-${deploy}-minimal`,
				runtime: "node",
				plugins: [],
				template: "minimal",
				deploy,
				ci: true,
			});
			renderOpts(`gen-deploy-${deploy}-webhook`, {
				name: `deploy-${deploy}-webhook`,
				runtime: "node",
				plugins: [],
				template: "webhook",
				deploy,
			});
		}

		// project names that collide with identifiers the plugin template's own
		// files import/declare (bot/test/assert/token/process) used to generate
		// broken code (TDZ self-reference, duplicate imports, a shadowed global).
		for (const name of ["bot", "test", "assert", "token", "process", "context"]) {
			renderOpts(`gen-plugin-collision-${name}`, {
				name,
				runtime: "node",
				plugins: [],
				template: "plugin",
			});
		}

		const program = ts.createProgram(entries, GENERATED_OPTIONS);
		assert.deepEqual(formatDiagnostics(ts.getPreEmitDiagnostics(program)), []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
