/** colour palettes, fonts, and the avatar colour ring. */

export interface Palette {
	bg0: string;
	bg1: string;
	out: string;
	outText: string;
	in: string;
	inText: string;
	meta: string;
	tick: string;
	link: string;
	name: string;
	code: string;
	media: string;
	media2: string;
	bar: string;
	barTrack: string;
	scrim: string;
	button: string;
	buttonText: string;
	buttonStroke: string;
	cardLine: string;
}

/** `"light"` / `"dark"` pick a built-in look; pass a full or partial `Palette` for a custom theme. */
export type Theme = "light" | "dark" | Partial<Palette>;

export const PALETTES: Record<"dark" | "light", Palette> = {
	light: {
		bg0: "#d8e8c7",
		bg1: "#c2dcae",
		out: "#e4f7d2",
		outText: "#0c1f0c",
		in: "#ffffff",
		inText: "#0b1320",
		meta: "#8aa18c",
		tick: "#54b757",
		link: "#3a8fd6",
		name: "#3a8fd6",
		code: "#bb4d3a",
		media: "#c4d0d9",
		media2: "#aebccb",
		bar: "#54a0e0",
		barTrack: "rgba(0,0,0,0.08)",
		scrim: "rgba(0,0,0,0.4)",
		button: "#ffffff",
		buttonText: "#3a8fd6",
		buttonStroke: "rgba(0,0,0,0.06)",
		cardLine: "rgba(0,0,0,0.08)",
	},
	dark: {
		bg0: "#0e1621",
		bg1: "#1a2733",
		out: "#2b5278",
		outText: "#ffffff",
		in: "#182533",
		inText: "#ffffff",
		meta: "#7d8e9e",
		tick: "#64b5f6",
		link: "#6ab3f3",
		name: "#6ab3f3",
		code: "#e2a07a",
		media: "#2a3744",
		media2: "#1f2a35",
		bar: "#5fa8dd",
		barTrack: "rgba(255,255,255,0.1)",
		scrim: "rgba(0,0,0,0.45)",
		button: "#17212b",
		buttonText: "#7da6c9",
		buttonStroke: "rgba(255,255,255,0.06)",
		cardLine: "rgba(255,255,255,0.08)",
	},
};

/** resolve `theme` (preset name or custom palette) + `palette` overrides into a concrete Palette. */
export function resolvePalette(
	theme: Theme | undefined,
	overrides: Partial<Palette> | undefined,
): Palette {
	if (theme === undefined || theme === "light")
		return overrides ? { ...PALETTES.light, ...overrides } : PALETTES.light;
	if (theme === "dark") return overrides ? { ...PALETTES.dark, ...overrides } : PALETTES.dark;

	// theme itself is a partial palette — layer it (and any explicit overrides) over the light preset
	return { ...PALETTES.light, ...theme, ...overrides };
}

export const AVATAR_COLORS = [
	"#e17076",
	"#7bc862",
	"#65aadd",
	"#a695e7",
	"#ee7aae",
	"#6ec9cb",
	"#faa774",
];

export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
export const MONO = "'SF Mono','JetBrains Mono','Roboto Mono',Consolas,monospace";

// layout constants shared across modules
export const FS = 14;
export const LH = 19;
export const ASC = 13;
export const PADX = 11;
export const PADY = 7;
export const charW = FS * 0.54;
export const monoW = FS * 0.6;
