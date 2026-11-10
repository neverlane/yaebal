import { callbackData, field } from "@yaebal/callback-data";
import { defineWidget, html, widgetClient, widgetState } from "@yaebal/widget";

/** the options a poll offers — one char on the wire each (an enum index). */
export const OPTIONS = ["pizza", "sushi", "tacos"] as const;
export type Option = (typeof OPTIONS)[number];

/** the query the widget sends when a button is tapped — the bot routes it with `bot.widgetQuery(vote, …)`. */
export const vote = callbackData("vote", { option: field.enum(OPTIONS) });

/** the shared state: the tally, revisioned so a late poll never overwrites a newer count. */
export type Tally = Record<Option, number>;
export const tally = widgetState<Tally>({
	revision: true,
	validate: (v): v is Tally =>
		typeof v === "object" &&
		v !== null &&
		OPTIONS.every((o) => typeof (v as Tally)[o] === "number"),
});

export const emptyTally = (): Tally => ({ pizza: 0, sushi: 0, tacos: 0 });

/**
 * the widget: three buttons and bars. its script runs inside telegram — it reads the tally with
 * `yw.onState`, and on a tap sends `yw.ask("vote", …)`; the bot answers with the new tally so the
 * bars move immediately, before the state edit even lands.
 */
export const poll = defineWidget({
	publicData: tally,
	html: html`${widgetClient({ actions: { vote }, revision: true })}
<style>
	body { margin: 0; font: var(--tg-text-font-size)/var(--tg-text-line-height) system-ui, sans-serif; color: var(--tg-theme-text-color); }
	.poll { display: grid; gap: 8px; padding: var(--tg-text-padding); }
	h3 { margin: 0 0 4px; font-size: 16px; }
	button { position: relative; display: flex; align-items: center; justify-content: space-between; width: 100%; height: var(--tg-button-height); padding: var(--tg-button-padding); border: 0; border-radius: var(--tg-button-radius); background: var(--tg-theme-secondary-bg-color); color: var(--tg-theme-text-color); font: var(--tg-button-font); overflow: hidden; }
	button i { position: absolute; inset: 0 auto 0 0; background: var(--tg-theme-button-color); opacity: .25; transition: width .3s; }
	button span { position: relative; }
	button.mine { outline: 2px solid var(--tg-theme-button-color); }
	.hint { color: var(--tg-theme-hint-color); font-size: 13px; min-height: 18px; }
</style>
<div class="poll">
	<h3>what's for lunch?</h3>
	${OPTIONS.map((o) => html`<button data-option="${o}"><i></i><span>${o}</span><span class="n">0</span></button>`)}
	<div class="hint" id="hint"></div>
</div>
<script>
	const buttons = [...document.querySelectorAll("button")];
	const hint = document.getElementById("hint");
	let mine = localStorage.getItem("vote");

	function draw(t) {
		if (!t) return;
		const total = Object.values(t).reduce((a, b) => a + b, 0) || 1;
		for (const b of buttons) {
			const n = t[b.dataset.option] || 0;
			b.querySelector(".n").textContent = n;
			b.querySelector("i").style.width = (100 * n) / total + "%";
			b.classList.toggle("mine", b.dataset.option === mine);
		}
	}

	yw.onState(({ publicData }) => draw(publicData));

	for (const b of buttons) {
		b.onclick = () => {
			hint.textContent = "…";
			// called synchronously in the tap handler — telegram requires that
			yw.ask("vote", { option: b.dataset.option }).then(
				(t) => {
					mine = b.dataset.option;
					try { localStorage.setItem("vote", mine); } catch (e) {}
					hint.textContent = "";
					draw(t);
				},
				(e) => {
					const code = yw.code(e);
					hint.textContent = code === "NOT_ALLOWED" ? "open the bot to vote" : code === "RATE_LIMITED" ? "slow down" : "try again";
				},
			);
		};
	}
	if (yw.w) yw.w.ready();
</script>`,
});
