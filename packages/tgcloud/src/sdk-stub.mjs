/**
 * stand-in for telegram serverless `sdk` while the bundler imports the bot
 * to see which updates it registers. the real module only exists inside a
 * tgcloud isolate, and importing the bot runs its schema (`integer().primaryKey()`),
 * so the stand-in has to be chainable. it never lands in the bundle — esbuild
 * keeps `sdk` external.
 *
 * if something else already resolves `sdk` (the test hook), that wins.
 */
const source = `
	function chain() {
		const fn = () => proxy;
		const proxy = new Proxy(fn, { get: () => proxy, apply: () => proxy });
		return proxy;
	}
	export const db = chain();
	export const api = chain();
	export const InputFile = chain();
	export class BotApiError extends Error {}
	export const integer = chain();
	export const table = chain();
	export const sql = chain();
	export const text = chain();
	export default {};
`;

export async function resolve(specifier, context, next) {
	if (specifier !== "sdk" && !specifier.startsWith("sdk/")) return next(specifier, context);
	try {
		return await next(specifier, context);
	} catch (error) {
		if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
		return {
			url: `yaebal-tgcloud-sdk:${encodeURIComponent(specifier)}`,
			shortCircuit: true,
		};
	}
}

export function load(url, context, next) {
	if (!url.startsWith("yaebal-tgcloud-sdk:")) return next(url, context);
	return { format: "module", shortCircuit: true, source };
}
