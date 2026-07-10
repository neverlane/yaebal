import { createHash } from "node:crypto";
import { register } from "@yaebal/workers";

/** the task map shared with createPool<Tasks>() in index.ts — names, args and results stay typed on both sides. */
export type Tasks = {
	digest: (input: string) => string;
	score: (input: { text: string; rounds: number }) => { score: number; length: number };
};

register<Tasks>({
	digest: (input) => createHash("sha256").update(input).digest("hex"),

	// a deliberately cpu-heavy loop. it watches `signal` so a run() timeout (or abort) cancels it
	// promptly and the worker lives to serve the next task instead of being killed.
	score: ({ text, rounds }, { signal }) => {
		let score = 0;
		for (let i = 0; i < rounds; i++) {
			if ((i & 0xffff) === 0 && signal.aborted) throw new Error("scoring aborted");
			const code = text.charCodeAt(i % Math.max(1, text.length)) || 1;
			score = (score + code * (i + 17)) % 1_000_003;
		}

		return { score, length: text.length };
	},
});
