import { callbackData, field } from "@yaebal/callback-data";
import { defineWidget, html, widgetClient } from "@yaebal/widget";

/** the tip amounts the widget offers, in TON. */
export const AMOUNTS = ["0.1", "0.5", "1"] as const;

/** one action for the whole wallet flow: the `data` query asks for a transaction, `sent_transaction` reports it. */
export const tipAction = callbackData("tip", { amount: field.enum(AMOUNTS) });

/** a TON tip jar: `yw.pay()` asks the bot for a transaction and hands it straight to the wallet. */
export const tip = defineWidget({
	height: 120,
	html: html`${widgetClient({ actions: { tip: tipAction }, wallet: true })}
<style>
	.jar { display: grid; gap: 8px; padding: var(--tg-text-padding); color: var(--tg-theme-text-color); font: 15px system-ui, sans-serif; }
	.row { display: flex; gap: 8px; }
	.jar > div:first-child { font-weight: 600; }
	button { flex: 1; height: var(--tg-button-height); border: 0; border-radius: var(--tg-button-radius); background: var(--tg-button-bg); color: var(--tg-button-text); font: var(--tg-button-font); }
	button:disabled { opacity: var(--tg-button-disabled-opacity); }
	.hint { color: var(--tg-theme-hint-color); font-size: 13px; }
</style>
<div class="jar">
	<div>tip the bot 💎</div>
	<div class="row">${AMOUNTS.map((a) => html`<button data-amount="${a}">${a} TON</button>`)}</div>
	<div class="hint" id="hint"></div>
</div>
<script>
	const hint = document.getElementById("hint");
	const buttons = [...document.querySelectorAll("button")];
	if (!yw.w || !yw.w.wallet) {
		hint.textContent = "connect a TON wallet in telegram to tip";
		for (const b of buttons) b.disabled = true;
	}
	for (const b of buttons) {
		b.onclick = () => {
			hint.textContent = "confirm in your wallet…";
			yw.pay("tip", { amount: b.dataset.amount }).then(
				() => { hint.textContent = "thank you!"; yw.w.HapticFeedback.notificationOccurred("success"); },
				(e) => { hint.textContent = yw.code(e) === "REJECTED" ? "cancelled" : "payment failed — nothing was charged twice"; },
			);
		};
	}
</script>`,
});
