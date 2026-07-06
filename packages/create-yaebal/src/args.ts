/**
 * dependency-free argv parser. produces a partial set of scaffold options plus
 * the behavioural flags (`--yes`, `--no-install`, `--no-tui`, …). anything the
 * user didn't pass stays `undefined` so a front-end can ask for it.
 */

import {
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
	git?: boolean;
	install?: boolean;
	/** force tui on/off; undefined = auto-detect */
	tui?: boolean;
	/** accept defaults for everything not provided (non-interactive) */
	yes: boolean;
	help: boolean;
	version: boolean;
	/** unknown flags we encountered, surfaced as warnings */
	unknown: string[];
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

export function parseArgs(argv: string[]): ParsedArgs {
	const out: ParsedArgs = { yes: false, help: false, version: false, unknown: [] };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) continue;

		// allow `--flag=value`
		const eq = arg.indexOf("=");
		const flag = arg.startsWith("--") && eq !== -1 ? arg.slice(0, eq) : arg;
		const inlineValue = arg.startsWith("--") && eq !== -1 ? arg.slice(eq + 1) : undefined;
		const next = (): string | undefined => inlineValue ?? argv[++i];

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
				if (v && isRuntime(v)) out.runtime = v;

				break;
			}
			case "-m":
			case "--pm":
			case "--package-manager": {
				const v = next();
				if (v && isPackageManager(v)) out.packageManager = v;

				break;
			}
			case "-t":
			case "--template": {
				const v = next();
				if (v && isTemplate(v)) out.template = v;
				break;
			}
			case "-p":
			case "--plugins": {
				const v = next();
				if (v !== undefined) out.plugins = resolvePlugins(v);

				break;
			}
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
  -t, --template <minimal|echo|commands|buttons|conversation|i18n|session-counter|webhook|runner|rich-message|broadcast|toml|plugin>
  -p, --plugins <a,b | all | none>        comma list of @yaebal plugins
      --git / --no-git                    initialise a git repo (+ first commit)
      --install / --no-install            install dependencies after scaffolding
      --tui / --no-tui                    force the interactive ui on/off
  -y, --yes                               accept defaults, no prompts
  -h, --help                              show this help
  -v, --version                           print version

examples:
  create-yaebal my-bot
  create-yaebal my-bot -r bun -t commands -p session,again,fmt
  create-yaebal my-plugin -t plugin --yes
  create-yaebal my-bot --plugins all --yes --no-install
`;
