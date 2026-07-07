import type { Step } from "./playground";
import { runMockScenario } from "./playground-sandbox";

self.onmessage = async (
	event: MessageEvent<{
		id: number;
		code: string;
		steps: Step[];
		width: number;
		theme: "light" | "dark";
	}>,
) => {
	const { id, code, steps, width, theme } = event.data;
	const result = await runMockScenario(code, steps, width, theme);

	self.postMessage({ id, ...result });
};
