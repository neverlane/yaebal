import { threadId } from "node:worker_threads";
import { move, register } from "./index.js";

/** fixture worker used by index.test.ts — one task per pool behavior under test. */
export type TestTasks = {
	add: (pair: [number, number]) => number;
	echo: (value: { a: number }) => { a: number };
	boom: () => never;
	typedBoom: () => never;
	slow: (ms: number) => Promise<number>;
	slowId: (ms: number) => Promise<number>;
	threadId: () => number;
	die: (code: number) => never;
	hang: () => Promise<never>;
	obedient: (ms: number) => Promise<string>;
	moveBack: (len: number) => Uint8Array;
	unclonableResult: () => () => void;
	registerAgainThrows: () => boolean;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

register<TestTasks>({
	add: (pair) => pair[0] + pair[1],
	echo: (value) => value,
	boom: () => {
		throw new Error("kaboom");
	},
	typedBoom: () => {
		throw new RangeError("out of range");
	},
	slow: async (ms) => {
		await sleep(ms);
		return ms;
	},
	slowId: async (ms) => {
		await sleep(ms);
		return threadId;
	},
	threadId: () => threadId,
	die: (code) => process.exit(code),
	hang: () => new Promise<never>(() => {}),
	obedient: (ms, { signal }) =>
		new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => resolve("done"), ms);
			signal.addEventListener(
				"abort",
				() => {
					clearTimeout(timer);
					reject(new Error("cancelled cooperatively"));
				},
				{ once: true },
			);
		}),
	moveBack: (len) => {
		const bytes = new Uint8Array(len).fill(7);
		return move(bytes, [bytes.buffer]);
	},
	unclonableResult: () => () => {},
	registerAgainThrows: () => {
		try {
			register({ nope: () => 0 });
			return false;
		} catch {
			return true;
		}
	},
});
