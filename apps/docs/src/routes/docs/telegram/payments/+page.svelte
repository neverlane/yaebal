<script lang="ts">
	import Code from "$lib/Code.svelte";
	import Try from "$lib/Try.svelte";

	const pluginSetup = `import { createBot } from "yaebal";
import { cancelSubscription, invoice, isStarsPayment, payments } from "@yaebal/payments";

const grantAccess = async (payload: string, userId: number) => {};
const isOrderValid = async (payload: string, userId: number) => true;

export const bot = createBot(process.env.BOT_TOKEN!)
  .install(
    payments({
      onPreCheckout: (ctx, query) => isOrderValid(query.invoice_payload, query.from.id),
      // return true/undefined to approve, false or a string to decline — see
      // PreCheckoutDecision for the full { ok, errorMessage } form.
      onSuccessfulPayment: async (ctx, payment) => {
        await grantAccess(payment.invoice_payload, ctx.from!.id);
        await ctx.reply(isStarsPayment(payment) ? "thanks for the stars!" : "payment received");
      },
    }),
  )
  .command("upgrade", (ctx) =>
    ctx.sendInvoice(
      invoice("pro plan", "one month of access", "pro_monthly").stars().price("pro", 250).build(),
    ),
  );`;

	const subscriptionSnippet = `import { cancelSubscription, invoice } from "@yaebal/payments";

declare const api: Parameters<typeof cancelSubscription>[0];

// billed again every 30 days until cancelled — forces Stars, subscriptions
// aren't available through external providers.
const subscriptionInvoice = invoice("pro plan", "monthly, cancel anytime", "pro_sub")
  .subscription()
  .build();

// stays active until the current period ends, matching Telegram's own
// editUserStarSubscription(is_canceled: true).
await cancelSubscription(api, { userId: 12345, telegramPaymentChargeId: "..." });`;

	const invoiceRaw = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.command("upgrade", (ctx) =>
  ctx.sendInvoice({
    title: "pro plan",
    description: "one month of access",
    payload: "pro_monthly",
    currency: "XTR",
    prices: [{ label: "pro", amount: 250 }],
  }),
);`;

	const checkout = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);
const isOrderValid = async (payload: string, userId: number) => true;

bot.on("pre_checkout_query", async (ctx) => {
  const ok = await isOrderValid(ctx.invoice_payload, ctx.from.id);

  await ctx.answer(ok, {
    error_message: ok ? undefined : "order is no longer available",
  });
});`;

	const shipping = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);

bot.on("shipping_query", async (ctx) => {
  await ctx.answer(true, {
    shipping_options: [
      {
        id: "standard",
        title: "standard",
        prices: [{ label: "shipping", amount: 0 }],
      },
    ],
  });
});`;

	const success = `import { createBot } from "yaebal";

const bot = createBot(process.env.BOT_TOKEN!);
const grantAccess = async (payload: string, userId: number) => {};

// the "message:successful_payment" filter query narrows ctx.message.successful_payment
// to a plain SuccessfulPayment (media/service fields nest under ctx.message — unlike
// "message:text", which narrows a flat ctx.text) — no manual "if (!payment) return".
bot.on("message:successful_payment", async (ctx) => {
  await grantAccess(ctx.message.successful_payment.invoice_payload, ctx.from!.id);
  await ctx.reply("payment received");
});`;
</script>

<svelte:head>
	<title>payments — yaebal</title>
</svelte:head>

<h1>payments</h1>
<p class="lead">
	build telegram payments, stars invoices, shipping checks, pre-checkout validation, and paid media
	flows with yaebal.
</p>

<div class="note">
	<strong>reach for <a href="/docs/plugins/payments/">@yaebal/payments</a> first.</strong> it wraps
	the raw protocol below in a fluent, provider-agnostic <code>InvoiceBuilder</code> plus
	<code>onPreCheckout</code>/<code>onSuccessfulPayment</code> options on one <code>payments()</code>
	plugin, and adds Stars Subscription API helpers. this guide still covers the underlying protocol
	directly for shipping/paid-media cases the plugin doesn't wrap.
</div>
<Code code={pluginSetup} title="payments-plugin.ts" />
<p>
	<code>invoice(title, description, payload)</code> starts the fluent builder —
	<code>.stars()</code> (the default) or <code>.provider(token, currency)</code> for an external
	processor, <code>.price(label, amount)</code> per line item, then <code>.build()</code> for
	<code>ctx.sendInvoice()</code> or <code>.toCreateInvoiceLinkParams()</code> for a shareable link
	instead of an in-chat message. <code>.subscription()</code> turns it into a recurring Stars
	subscription (Bot API 7.6+):
</p>
<Code code={subscriptionSnippet} title="subscription.ts" />

<h2>the flow</h2>
<p>
	telegram payments are a four-step protocol: send an invoice, optionally answer a shipping query,
	answer the pre-checkout query within 10 seconds, then handle the successful payment service event.
</p>

<h2>send a stars invoice</h2>
<p>
	stars use <code>currency: "XTR"</code>. for stars, the provider token is omitted or empty and the
	prices array usually has one item.
</p>
<Code code={invoiceRaw} title="invoice.ts" />

<h2>answer pre-checkout</h2>
<p>
	this is mandatory. if you do not answer, telegram cancels the payment. validate stock, plan id,
	user eligibility, and price-derived payloads here. <code>ctx.answer()</code> accepts either a
	positional <code>(ok, extra?)</code> for the common case, or a single params object when you need
	every field of <code>AnswerPreCheckoutQueryParams</code> at once.
</p>
<Code code={checkout} title="pre-checkout.ts" />

<h2>shipping query</h2>
<p>
	if the invoice needs shipping, telegram asks for available shipping options before checkout.
</p>
<Code code={shipping} title="shipping.ts" />

<h2>successful payment</h2>
<p>
	grant access only after the <code>successful_payment</code> service event arrives. the invoice
	payload comes back unchanged, so use it as your internal order key.
</p>
<Code code={success} title="success.ts" />
<Try id="payments-stars" title="try it — stars flow" />

<h2>production rules</h2>
<ul>
	<li>never trust only the client-side button press; provision after <code>successful_payment</code>.</li>
	<li>make invoice payloads unique enough to map back to your order.</li>
	<li>answer <code>pre_checkout_query</code> fast; do not run slow external workflows there.</li>
	<li>store processed payment ids to avoid double provisioning after retries.</li>
	<li>use <code>isStarsPayment(payment)</code> to branch stars vs. external-provider fulfillment instead of checking <code>currency === "XTR"</code> by hand.</li>
	<li>test the flow with <a href="/docs/plugins/test/">@yaebal/test</a> before using a real provider.</li>
</ul>
