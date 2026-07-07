/** the playground's window set + its dock presets. */
import { type LayoutNode, leaf, split } from "./window-manager.svelte";

export const PG_KEYS = ["side", "editor", "result", "state", "console"] as const;
export type PgKey = (typeof PG_KEYS)[number];

export const PG_MIN = {
	side: { w: 200, h: 180 },
	editor: { w: 360, h: 260 },
	result: { w: 320, h: 240 },
	state: { w: 260, h: 220 },
	console: { w: 260, h: 130 },
} satisfies Record<PgKey, { w: number; h: number }>;

export function initialTree(): LayoutNode<PgKey> {
	return split(
		"row",
		0.13,
		leaf("side"),
		split(
			"row",
			0.39,
			leaf("editor"),
			split("col", 0.68, leaf("result"), split("row", 0.5, leaf("state"), leaf("console"))),
		),
	);
}

export type PresetKind = "default" | "editor" | "preview" | "debug";

export function presetTree(kind: PresetKind): LayoutNode<PgKey> {
	if (kind === "editor")
		return split(
			"row",
			0.13,
			leaf("side"),
			split(
				"row",
				0.72,
				leaf("editor"),
				split("col", 0.64, leaf("result"), split("row", 0.5, leaf("state"), leaf("console"))),
			),
		);
	if (kind === "preview")
		return split(
			"row",
			0.13,
			leaf("side"),
			split(
				"row",
				0.42,
				split("col", 0.68, leaf("result"), split("row", 0.5, leaf("state"), leaf("console"))),
				leaf("editor"),
			),
		);
	if (kind === "debug")
		return split(
			"row",
			0.13,
			leaf("side"),
			split(
				"col",
				0.68,
				split("row", 0.5, leaf("editor"), leaf("result")),
				split("row", 0.5, leaf("state"), leaf("console")),
			),
		);

	return initialTree();
}

/** center-drop may swap whole horizontal groups only around the editor column. */
export function canSwapGroups(source: PgKey, target: PgKey, dx: number, dy: number): boolean {
	return (
		source !== "side" &&
		target !== "side" &&
		(source === "editor" || target === "editor") &&
		Math.abs(dx) > Math.abs(dy) * 1.25
	);
}
