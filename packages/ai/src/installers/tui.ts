import { emitKeypressEvents } from "node:readline";

const ESC = "\x1b[";
export const color = {
	dim: (s: string) => `${ESC}2m${s}${ESC}22m`,
	bold: (s: string) => `${ESC}1m${s}${ESC}22m`,
	cyan: (s: string) => `${ESC}36m${s}${ESC}39m`,
	green: (s: string) => `${ESC}32m${s}${ESC}39m`,
	yellow: (s: string) => `${ESC}33m${s}${ESC}39m`,
};

export interface MultiSelectChoice {
	value: string;
	label: string;
	hint?: string;
	selected?: boolean;
}

/**
 * a zero-dependency interactive multi-select: ↑/↓ move, space toggles, `a` toggles all,
 * enter confirms, ctrl-c/esc cancels (resolves undefined). requires a tty.
 */
export function multiSelect(
	title: string,
	choices: MultiSelectChoice[],
): Promise<string[] | undefined> {
	const { stdin, stdout } = process;
	if (!stdin.isTTY) {
		return Promise.reject(
			new Error("interactive mode needs a tty — pass --agents <ids> (see --help) instead"),
		);
	}

	const selected = new Set(choices.filter((c) => c.selected === true).map((c) => c.value));
	let cursor = 0;
	let lines = 0;

	const render = (): void => {
		if (lines > 0) stdout.write(`${ESC}${lines}F${ESC}0J`);
		const rows = [
			`${color.bold(color.cyan("◆"))} ${color.bold(title)} ${color.dim("(space toggles, a = all, enter confirms)")}`,
			...choices.map((choice, index) => {
				const box = selected.has(choice.value) ? color.green("◼") : color.dim("◻");
				const pointer = index === cursor ? color.cyan("❯") : " ";
				const label = index === cursor ? color.bold(choice.label) : choice.label;
				const hint = choice.hint === undefined ? "" : ` ${color.dim(choice.hint)}`;
				return `${pointer} ${box} ${label}${hint}`;
			}),
		];
		stdout.write(`${rows.join("\n")}\n`);
		lines = rows.length;
	};

	emitKeypressEvents(stdin);
	const wasRaw = stdin.isRaw;
	stdin.setRawMode(true);
	stdin.resume();

	return new Promise((resolvePromise) => {
		const finish = (value: string[] | undefined): void => {
			stdin.off("keypress", onKeypress);
			stdin.setRawMode(wasRaw);
			stdin.pause();
			resolvePromise(value);
		};

		const onKeypress = (_chunk: unknown, key: { name?: string; ctrl?: boolean }): void => {
			if ((key.ctrl === true && key.name === "c") || key.name === "escape") {
				finish(undefined);
				return;
			}
			if (key.name === "return") {
				finish([...selected]);
				return;
			}
			if (key.name === "up") cursor = (cursor - 1 + choices.length) % choices.length;
			else if (key.name === "down") cursor = (cursor + 1) % choices.length;
			else if (key.name === "space") {
				const value = choices[cursor]?.value;
				if (value !== undefined) {
					if (selected.has(value)) selected.delete(value);
					else selected.add(value);
				}
			} else if (key.name === "a") {
				if (selected.size === choices.length) selected.clear();
				else for (const choice of choices) selected.add(choice.value);
			}
			render();
		};

		stdin.on("keypress", onKeypress);
		render();
	});
}
