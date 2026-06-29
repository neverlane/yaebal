import { browser } from "$app/environment";

type Theme = "light" | "dark";

let current = $state<Theme>("dark");

export const theme = {
	get value(): Theme {
		return current;
	},
	
	init() {
		if (browser) {
			const saved = localStorage.getItem("theme") as Theme | null;
			current = saved ?? "dark";
		}
	},

	set(value: Theme) {
		current = value;
		
		if (browser) {
			document.documentElement.setAttribute("data-theme", value);
			localStorage.setItem("theme", value);
		}
	},

	toggle() {
		this.set(current === "dark" ? "light" : "dark");
	},
};
