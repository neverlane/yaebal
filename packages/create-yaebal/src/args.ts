/**
 * dependency-free argv parser. produces a partial set of scaffold options plus
 * the behavioural flags (`--yes`, `--no-install`, `--no-tui`, …). anything the
 * user didn't pass stays `undefined` so a front-end can ask for it.
 */

import {
	AI_AGENT_IDS,
	type DeployTarget,
	isDeploy,
	isPackageManager,
	isRuntime,
	isTemplate,
	type PackageManager,
	PLUGIN_IDS,
	type Runtime,
	type TemplateId,
} from "./catalog.js";

export interface ParsedArgs {
	name?: string;
	runtime?: Runtime;
	packageManager?: PackageManager;
	template?: TemplateId;
	/** undefined = not provided; [] = explicitly none */
	plugins?: string[];
	deploy?: DeployTarget;
	/** ai coding agents to pre-configure; undefined = not provided; [] = explicitly none */
	ai?: string[];
	/** ship a github actions ci workflow */
	ci?: boolean;
	git?: boolean;
	install?: boolean;
	/** force tui on/off; undefined = auto-detect */
	tui?: boolean;
	/** explicit config-file path (`-c/--config <path>`) */
	configPath?: string;
	/** skip the `create-yaebal.json` / package.json autodetect entirely */
	noConfig?: boolean;
	/** print the result as machine-readable json instead of the ansi summary */
	json?: boolean;
	/** accept defaults for everything not provided (non-interactive) */
	yes: boolean;
	help: boolean;
	version: boolean;
	/** unknown flags we encountered, surfaced as warnings */
	unknown: string[];
	/** known flags given a missing or invalid value, surfaced as warnings */
	warnings: string[];
}

function resolvePlugins(raw: string): string[] {
	const v = raw.trim().toLowerCase();

	if (v === "" || v === "none") return [];
	if (v === "all") return [...PLUGIN_IDS];

	return v
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function resolveAgents(raw: string): string[] {
	const v = raw.trim().toLowerCase();

	if (v === "" || v === "none") return [];
	if (v === "all") return [...AI_AGENT_IDS];

	return v
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function parseArgs(argv: string[]): ParsedArgs {
	const out: ParsedArgs = {
		yes: false,
		help: false,
		version: false,
		unknown: [],
		warnings: [],
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) continue;

		// allow `--flag=value`
		const eq = arg.indexOf("=");
		const flag = arg.startsWith("--") && eq !== -1 ? arg.slice(0, eq) : arg;
		const inlineValue = arg.startsWith("--") && eq !== -1 ? arg.slice(eq + 1) : undefined;

		// only consumes `argv[i + 1]` as this flag's value when it doesn't look
		// like another flag — otherwise a missing value would silently eat (and
		// drop) the next flag instead of just leaving this one unset.
		const next = (): string | undefined => {
			if (inlineValue !== undefined) return inlineValue;
			const candidate = argv[i + 1];
			if (candidate === undefined || candidate.startsWith("-")) return undefined;
			i++;
			return candidate;
		};

		switch (flag) {
			case "-h":
			case "--help":
				out.help = true;
				break;
			case "-v":
			case "--version":
				out.version = true;
				break;
			case "-y":
			case "--yes":
				out.yes = true;
				break;
			case "-r":
			case "--runtime": {
				const v = next();
				if (v === undefined) out.warnings.push("--runtime needs a value (node, bun or deno)");
				else if (isRuntime(v)) out.runtime = v;
				else out.warnings.push(`--runtime "${v}" is not valid — expected node, bun or deno`);
				break;
			}
			case "-m":
			case "--pm":
			case "--package-manager": {
				const v = next();
				if (v === undefined) {
					out.warnings.push("--pm needs a value (npm, pnpm, yarn, bun or deno)");
				} else if (isPackageManager(v)) out.packageManager = v;
				else out.warnings.push(`--pm "${v}" is not valid — expected npm, pnpm, yarn, bun or deno`);
				break;
			}
			case "-t":
			case "--template": {
				const v = next();
				if (v === undefined) out.warnings.push("--template needs a value");
				else if (isTemplate(v)) out.template = v;
				else out.warnings.push(`--template "${v}" is not a known template`);
				break;
			}
			case "-p":
			case "--plugins": {
				const v = next();
				if (v === undefined) out.warnings.push("--plugins needs a value (a,b | all | none)");
				else out.plugins = resolvePlugins(v);
				break;
			}
			case "-d":
			case "--deploy": {
				const v = next();
				if (v === undefined) out.warnings.push("--deploy needs a value");
				else if (isDeploy(v)) out.deploy = v;
				else out.warnings.push(`--deploy "${v}" is not a known deploy target`);
				break;
			}
			case "--ai": {
				const v = next();
				if (v === undefined) out.warnings.push("--ai needs a value (a,b | all | none)");
				else out.ai = resolveAgents(v);
				break;
			}
			case "--ci":
				out.ci = true;
				break;
			case "--no-ci":
				out.ci = false;
				break;
			case "--git":
				out.git = true;
				break;
			case "--no-git":
				out.git = false;
				break;
			case "--install":
				out.install = true;
				break;
			case "--no-install":
				out.install = false;
				break;
			case "--tui":
				out.tui = true;
				break;
			case "--no-tui":
				out.tui = false;
				break;
			case "-c":
			case "--config": {
				const v = next();
				if (v === undefined) out.warnings.push("--config needs a path");
				else out.configPath = v;
				break;
			}
			case "--no-config":
				out.noConfig = true;
				break;
			case "--json":
				out.json = true;
				break;
			default:
				if (arg.startsWith("-")) out.unknown.push(arg);
				else if (out.name === undefined) out.name = arg.trim();
				else out.unknown.push(arg);
		}
	}

	return out;
}

export const HELP = `create-yaebal — scaffold a type-safe telegram bot

usage:
  create-yaebal [name] [options]

options:
  -r, --runtime <node|bun|deno>           target runtime (default: detected)
  -m, --pm <npm|pnpm|yarn|bun|deno>       package manager (default: detected)
  -t, --template <id>                     minimal · echo · commands · buttons ·
                                           conversation · i18n · session-counter ·
                                           webhook · runner · rich-message ·
                                           broadcast · toml · plugin
  -p, --plugins <a,b | all | none>        comma list of @yaebal plugins
  -d, --deploy <target>                   none · docker · compose · fly ·
                                           railway · cloudflare · vercel
      --ai <a,b | all | none>             set up ai coding agents: claude ·
                                           cursor · codex · opencode · copilot ·
                                           windsurf · zed · gemini · agents-md
      --ci / --no-ci                      add a github actions ci workflow
      --git / --no-git                    initialise a git repo (+ first commit)
      --install / --no-install            install dependencies after scaffolding
      --tui / --no-tui                    force the interactive ui on/off
  -c, --config <path>                     read defaults from a config file
                                           (default: autodetect create-yaebal.json
                                           or a "create-yaebal" key in package.json)
      --no-config                         skip config-file autodetect
  -y, --yes                               accept defaults, no prompts
      --json                              print the result as json (with --yes)
  -h, --help                              show this help
  -v, --version                           print version

examples:
  create-yaebal my-bot
  create-yaebal my-bot -r bun -t commands -p session,again,fmt
  create-yaebal my-bot -t webhook -d cloudflare --ci --yes
  create-yaebal my-bot --ai claude,cursor --yes
  create-yaebal my-plugin -t plugin --yes
  create-yaebal my-bot --plugins all --yes --no-install
`;
