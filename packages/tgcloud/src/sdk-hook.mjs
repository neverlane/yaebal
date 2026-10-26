/**
 * test-only resolver for the bare `sdk` import a bundled handler uses.
 * tgcloud provides that module; node doesn't. the test plants a fake on
 * `globalThis.__yaebalTestSdk` and this hook returns it.
 */
export async function resolve(specifier, context, next) {
	if (specifier === "sdk") {
		return { url: "yaebal-test-sdk:", shortCircuit: true };
	}
	return next(specifier, context);
}

export async function load(url, context, next) {
	if (url === "yaebal-test-sdk:") {
		return {
			format: "module",
			shortCircuit: true,
			source:
				"export const api = globalThis.__yaebalTestSdk.api;\nexport const InputFile = globalThis.__yaebalTestSdk.InputFile;\nexport const BotApiError = globalThis.__yaebalTestSdk.BotApiError;\n",
		};
	}
	return next(url, context);
}
