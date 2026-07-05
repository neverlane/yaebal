import { createHash } from "node:crypto";
import { register } from "@yaebal/workers";

export type Tasks = {
	digest: (input: string) => string;
	score: (input: { text: string; rounds: number }) => { score: number; length: number };
};

register<Tasks>({
	digest: (input) => createHash("sha256").update(input).digest("hex"),
	score: ({ text, rounds }) => {
		let score = 0;
		for (let i = 0; i < rounds; i++) {
			const code = text.charCodeAt(i % Math.max(1, text.length)) || 1;
			score = (score + code * (i + 17)) % 1_000_003;
		}

		return { score, length: text.length };
	},
});
