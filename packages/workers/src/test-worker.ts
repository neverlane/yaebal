import { register } from "./index.js";

type TestTasks = {
	add: (pair: [number, number]) => number;
	echo: (value: { a: number }) => { a: number };
	boom: () => never;
	slow: (ms: number) => Promise<number>;
};

// fixture worker used by index.test.ts.
register<TestTasks>({
	add: (pair: [number, number]) => pair[0] + pair[1],
	echo: (value) => value,
	boom: () => {
		throw new Error("kaboom");
	},
	slow: async (ms: number) => {
		await new Promise((resolve) => setTimeout(resolve, ms));
		return ms;
	},
});
