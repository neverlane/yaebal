<script lang="ts">
	import Code from "$lib/Code.svelte";

	const invoice = `await ctx.sendInvoice({
  title: "pro plan",
  description: "one month of access",
  payload: "pro_monthly",
  currency: "XTR",
  prices: [{ label: "pro", amount: 250 }],
});`;

	const checkout = `bot.on("pre_checkout_query", async (ctx) => {
  const ok = await isOrderValid(ctx.invoice_payload, ctx.from.id);

  await ctx.answer(ok, {
    error_message: ok ? undefined : "order is no longer available",
  });
});`;

	const shipping = `bot.on("shipping_query", async (ctx) => {
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

	const success = `bot.on("message", async (ctx) => {
  const payment = ctx.successful_payment;
  if (!payment) return;

  await grantAccess(payment.invoice_payload, ctx.from!.id);
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
	the flow below in a typed, provider-agnostic invoice builder plus <code>onPreCheckout</code>/
	<code>onSuccessfulPayment</code> hooks, and adds Stars Subscription API helpers. this guide stays
	useful for the underlying protocol and for shipping/paid-media cases the plugin doesn't cover.
</div>

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
<Code code={invoice} title="invoice.ts" />

<h2>answer pre-checkout</h2>
<p>
	this is mandatory. if you do not answer, telegram cancels the payment. validate stock, plan id,
	user eligibility, and price-derived payloads here.
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

<h2>production rules</h2>
<ul>
	<li>never trust only the client-side button press; provision after <code>successful_payment</code>.</li>
	<li>make invoice payloads unique enough to map back to your order.</li>
	<li>answer <code>pre_checkout_query</code> fast; do not run slow external workflows there.</li>
	<li>store processed payment ids to avoid double provisioning after retries.</li>
	<li>test the flow with <a href="/docs/plugins/test/">@yaebal/test</a> before using a real provider.</li>
</ul>
