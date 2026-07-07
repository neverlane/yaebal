/**
 * the real, generated `.d.ts` of every workspace package, inlined at build time and
 * keyed by a virtual `file:///node_modules/...` path for the Monaco TS worker. this is
 * what makes playground intellisense match the published packages exactly — no
 * hand-written stubs to drift out of sync (the old stubs typed `install`/`derive` as
 * Composer-only, so `bot.start()` after `.install(...)` was a phantom error).
 *
 * the `lib/` segment is flattened away so each package's entry sits at
 * `node_modules/<name>/index.d.ts`, which node10 resolution finds without a
 * package.json; relative `./x.js` imports inside the d.ts resolve to the sibling
 * `x.d.ts` files registered the same way. requires packages to be built (`pnpm build`).
 */
const RAW = import.meta.glob<string>(
	["../../../../packages/*/lib/**/*.d.ts", "!**/*.test.d.ts", "!**/create-yaebal/**"],
	{ query: "?raw", import: "default", eager: true },
);

export const PLAYGROUND_DTS: Record<string, string> = {};

for (const [file, content] of Object.entries(RAW)) {
	const match = file.match(/packages\/([^/]+)\/lib\/(.+)$/);
	if (!match) continue;

	const [, dir, rest] = match;
	const name = dir === "yaebal" ? "yaebal" : `@yaebal/${dir}`;

	PLAYGROUND_DTS[`file:///node_modules/${name}/${rest}`] = content;
}
