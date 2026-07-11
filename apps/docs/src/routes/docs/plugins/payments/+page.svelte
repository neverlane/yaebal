<script lang="ts">
	import Code from "$lib/Code.svelte";

	const install = `pnpm add @yaebal/payments`;

	const usage = `import { invoice, payments } from "@yaebal/payments";

const bot = new Bot(process.env.BOT_TOKEN!)
  .install(
    payments({
      onPreCheckout: (ctx, query) => {
        // return true/nothing to approve, false or a string to decline
        return query.invoice_payload.startsWith("plan:");
      },
      onSuccessfulPayment: async (ctx, payment) => {
        await grantAccess(ctx.from!.id, payment.invoice_payload);
        await ctx.reply("thanks! access granted.");
      },
    }),
  )
  .command("buy", (ctx) => {
    const params = invoice("pro plan", "1 month of pro access", "plan:pro")
      .price("pro plan", 100)
      .toSendInvoiceParams(ctx.chat!.id);

    return ctx.api.sendInvoice(params);
  });`;

	const starsBuilder = `// stars (default)
invoice("tip", "buy me a coffee", "tip:1").price("tip", 25).toSendInvoiceParams(chatId);`;

	const externalBuilder = `// external provider
invoice("t-shirt", "black, medium", "shirt:1")
  .provider(process.env.PROVIDER_TOKEN!, "USD")
  .price("shirt", 1999)
  .flexible() // final price depends on shipping
  .needShippingAddress()
  .toSendInvoiceParams(chatId);`;

	const subscriptionBuilder = `// stars subscription (Subscription API, Bot API 7.6+) — forces stars
invoice("pro", "monthly pro access", "sub:pro")
  .price("pro", 100)
  .subscription() // every 30 days — the only period Telegram currently accepts
  .toCreateInvoiceLinkParams();`;

	const subscriptionOps = `import { cancelSubscription, isSubscriptionPayment, reactivateSubscription } from "@yaebal/payments";

if (isSubscriptionPayment(payment)) {
  await cancelSubscription(bot.api, {
    userId: ctx.from!.id,
    telegramPaymentChargeId: payment.telegram_payment_charge_id,
  });
}`;

	const testing = `import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { payments } from "@yaebal/payments";

const bot = new Composer<Context>().install(payments({ onPreCheckout: () => true }));
const env = createTestEnv(bot);

await env.createUser().sendSuccessfulPayment({ invoice_payload: "plan:pro" });`;
</script>

<svelte:head>
	<title>@yaebal/payments - yaebal</title>
</svelte:head>

<h1>@yaebal/payments</h1>
<p class="lead">
	typed invoice building and payment hooks for the Telegram Bot API. one fluent builder for both
	Telegram Stars and external payment providers, <code>onPreCheckout</code>/<code>onSuccessfulPayment</code>
	hooks that answer <code>pre_checkout_query</code> for you, and small helpers for the Stars
	Subscription API (Bot API 7.6+).
</p>

<h2>install</h2>
<Code code={install} title="terminal" lang="sh" />

<h2>usage</h2>
<p>
	<code>payments()</code> only installs the handlers you configure — leave <code>onPreCheckout</code>
	unset and no <code>pre_checkout_query</code> listener is registered at all.
</p>
<Code code={usage} title="bot.ts" />

<h2>the invoice builder</h2>
<p>
	<code>invoice(title, description, payload)</code> returns a fluent, provider-agnostic
	<code>InvoiceBuilder</code>. it defaults to Telegram Stars; call <code>.provider(token, currency)</code>
	to route through an external processor (Stripe, YooKassa, …) instead — the same builder, hooks
	and handler code work either way.
</p>
<Code code={starsBuilder} title="invoice-stars.ts" />
<Code code={externalBuilder} title="invoice-external.ts" />
<Code code={subscriptionBuilder} title="invoice-subscription.ts" />
<p>
	<code>.toSendInvoiceParams(chatId, extra?)</code> builds params for <code>api.sendInvoice</code>;
	<code>.toCreateInvoiceLinkParams(extra?)</code> builds params for <code>api.createInvoiceLink</code>
	(a shareable link, no chat required). both accept an <code>extra</code> object for one-off fields
	(<code>reply_markup</code>, <code>start_parameter</code>, …) without a dedicated builder method.
</p>

<h2>hooks</h2>
<p>
	<code>onPreCheckout</code>'s return value decides the answer Telegram gets:
</p>
<table>
	<thead>
		<tr><th>return</th><th>effect</th></tr>
	</thead>
	<tbody>
		<tr><td><code>true</code> / nothing</td><td><code>{"{ ok: true }"}</code></td></tr>
		<tr><td><code>false</code></td><td><code>{"{ ok: false }"}</code> (generic decline)</td></tr>
		<tr><td>a <code>string</code></td><td><code>{"{ ok: false, error_message: <string> }"}</code></td></tr>
		<tr><td><code>{"{ ok, errorMessage? }"}</code></td><td>full control</td></tr>
	</tbody>
</table>
<p>
	Telegram requires an answer within 10 seconds of <code>pre_checkout_query</code>, so keep the hook
	fast (defer anything slow to <code>onSuccessfulPayment</code>, which runs after the payment
	already went through). set <code>autoAnswerPreCheckout: false</code> to call
	<code>ctx.api.answerPreCheckoutQuery</code> yourself instead.
</p>
<p>
	<code>onSuccessfulPayment</code> runs on <code>message:successful_payment</code>; <code>payment.telegram_payment_charge_id</code>
	is your key for refunds and subscription edits.
</p>

<h2>subscriptions (Subscription API, Bot API 7.6+)</h2>
<Code code={subscriptionOps} title="subscription.ts" />
<p>
	<code>cancelSubscription</code>/<code>reactivateSubscription</code> wrap <code>editUserStarSubscription</code>
	— cancelling stops future billing but leaves the subscription active until the current period
	ends, matching Telegram's own semantics. <code>isStarsPayment</code>/<code>isSubscriptionPayment</code>
	are small guards over <code>SuccessfulPayment</code> for branching on currency/recurrence.
</p>
<p>
	refunding a Stars payment (subscription or one-off) and listing the bot's Star ledger are already
	typed on <code>Api</code> directly — no wrapper needed: <code>api.refundStarPayment(...)</code>,
	<code>api.getStarTransactions(...)</code>.
</p>

<h2>api</h2>
<table>
	<thead>
		<tr><th>export</th><th>signature</th><th>description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>invoice</code></td>
			<td><code>(title, description, payload) =&gt; InvoiceBuilder</code></td>
			<td>starts a fluent, provider-agnostic invoice</td>
		</tr>
		<tr>
			<td><code>payments</code></td>
			<td><code>(options?: PaymentsOptions) =&gt; Plugin&lt;Context, Record&lt;never, never&gt;&gt;</code></td>
			<td>wires <code>onPreCheckout</code>/<code>onSuccessfulPayment</code> onto the bot</td>
		</tr>
		<tr>
			<td><code>cancelSubscription</code> / <code>reactivateSubscription</code></td>
			<td><code>(api: Api, params) =&gt; Promise&lt;boolean&gt;</code></td>
			<td>toggles <code>editUserStarSubscription</code>'s <code>is_canceled</code> flag</td>
		</tr>
		<tr>
			<td><code>isStarsPayment</code> / <code>isSubscriptionPayment</code></td>
			<td><code>(payment) =&gt; boolean</code></td>
			<td>guards over <code>SuccessfulPayment</code></td>
		</tr>
		<tr>
			<td><code>STARS_CURRENCY</code> / <code>SUBSCRIPTION_PERIOD_SECONDS</code></td>
			<td><code>"XTR"</code> / <code>2_592_000</code></td>
			<td>constants used internally, exported for your own params</td>
		</tr>
	</tbody>
</table>

<h2>testing</h2>
<p>
	<a href="/docs/plugins/test/"><code>@yaebal/test</code></a>'s <code>UserActor</code> already
	models the payment flow: <code>sendPreCheckoutQuery()</code> emits the query, and
	<code>sendSuccessfulPayment()</code> runs it end-to-end — it throws if the bot never answered
	<code>ok: true</code>, exactly like real Telegram never firing <code>successful_payment</code>
	after a decline.
</p>
<Code code={testing} title="payments.test.ts" />

<div class="note">
	<strong>pairs with the payments &amp; stars guide.</strong> see
	<a href="/docs/telegram/payments/">payments &amp; stars</a> for the underlying Telegram protocol
	(shipping queries, paid media, production rules) — this plugin covers the invoice-building and
	pre-checkout/successful-payment wiring on top of it.
</div>
