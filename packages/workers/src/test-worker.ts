import { register } from "./index.js";

// Fixture worker used by index.test.ts.
register({
	add: (pair: [number, number]) => pair[0] + pair[1],
	echo: (value: unknown) => value,
	boom: () => {
		throw new Error("kaboom");
	},
	slow: async (ms: number) => {
		await new Promise((resolve) => setTimeout(resolve, ms));
		return ms;
	},
});
