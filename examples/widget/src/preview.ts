// render both widgets as standalone browser pages — no bot, no telegram:
//   pnpm --filter @yaebal/example-widget preview && open examples/widget/preview-poll.html
import { writeFileSync } from "node:fs";
import { poll, vote } from "./poll.ts";
import { tip } from "./tip.ts";

const tallied = { pizza: 4, sushi: 7, tacos: 2 };

// answers: what the stub's request() resolves with, keyed by the exact query data
const answers = Object.fromEntries(
	(["pizza", "sushi", "tacos"] as const).map((option) => [
		vote.pack({ option }),
		{ ...tallied, [option]: tallied[option] + 1 },
	]),
);

const out = new URL("../", import.meta.url);
writeFileSync(
	new URL("preview-poll.html", out),
	poll.preview({ publicData: tallied }, { answers }),
);
writeFileSync(
	new URL("preview-poll-dark.html", out),
	poll.preview({ publicData: tallied }, { answers, colorScheme: "dark" }),
);
writeFileSync(new URL("preview-tip.html", out), tip.preview({}, { wallet: true }));

for (const [name, widget] of [
	["poll", poll],
	["tip", tip],
] as const) {
	const { size, issues } = await widget.check();
	console.log(
		`${name}: ${size.bytes} bytes, ${size.compressedBytes}/4096 compressed, ${issues.length} lint issues`,
	);
	for (const issue of issues)
		console.log(`  ${issue.severity} ${issue.rule} (line ${issue.line}): ${issue.message}`);
}
console.log("wrote examples/widget/preview-*.html");
