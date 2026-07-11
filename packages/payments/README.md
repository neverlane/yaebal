# @yaebal/payments

typed invoice building and payment hooks for the Telegram Bot API. one fluent builder for both Telegram Stars and external payment providers, `onPreCheckout`/`onSuccessfulPayment` hooks that answer `pre_checkout_query` for you, and small helpers for the Stars Subscription API (Bot API 7.6+).

## install

```sh
pnpm add @yaebal/payments
```

## usage

```ts
import { invoice, payments } from "@yaebal/payments";

bot
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
	});
```

`payments()` only installs the handlers you configure — leave `onPreCheckout` unset and no `pre_checkout_query` listener is registered at all.

## the invoice builder

`invoice(title, description, payload)` returns a fluent, provider-agnostic `InvoiceBuilder`. it defaults to Telegram Stars; call `.provider(token, currency)` to route through an external processor (Stripe, YooKassa, …) instead — the same builder, hooks and handler code work either way.

```ts
import { invoice } from "@yaebal/payments";

// stars (default)
invoice("tip", "buy me a coffee", "tip:1").price("tip", 25).toSendInvoiceParams(chatId);

// external provider
invoice("t-shirt", "black, medium", "shirt:1")
	.provider(process.env.PROVIDER_TOKEN!, "USD")
	.price("shirt", 1999)
	.flexible() // final price depends on shipping
	.needShippingAddress()
	.toSendInvoiceParams(chatId);

// stars subscription (Subscription API, Bot API 7.6+) — forces stars
invoice("pro", "monthly pro access", "sub:pro")
	.price("pro", 100)
	.subscription() // every 30 days — the only period Telegram currently accepts
	.toCreateInvoiceLinkParams();
```

`.toSendInvoiceParams(chatId, extra?)` builds params for `api.sendInvoice`; `.toCreateInvoiceLinkParams(extra?)` builds params for `api.createInvoiceLink` (a shareable link, no chat required). both accept an `extra` object for one-off fields (`reply_markup`, `start_parameter`, …) without a dedicated builder method.

## hooks

```ts
payments({
	onPreCheckout: (ctx, query) => { ... },     // decide whether to proceed
	onSuccessfulPayment: (ctx, payment) => { ... }, // fulfil the order
	autoAnswerPreCheckout: true,                // default: answerPreCheckoutQuery for you
});
```

`onPreCheckout`'s return value decides the answer Telegram gets:

| return | effect |
|---|---|
| `true` / nothing | `{ ok: true }` |
| `false` | `{ ok: false }` (generic decline) |
| a `string` | `{ ok: false, error_message: <string> }` |
| `{ ok, errorMessage? }` | full control |

Telegram requires an answer within 10 seconds of `pre_checkout_query`, so keep the hook fast (defer anything slow to `onSuccessfulPayment`, which runs after the payment already went through). set `autoAnswerPreCheckout: false` to call `ctx.api.answerPreCheckoutQuery` yourself instead.

`onSuccessfulPayment` runs on `message:successful_payment`; `payment.telegram_payment_charge_id` is your key for refunds and subscription edits.

## subscriptions (Subscription API, Bot API 7.6+)

```ts
import { cancelSubscription, isSubscriptionPayment, reactivateSubscription } from "@yaebal/payments";

if (isSubscriptionPayment(payment)) {
	await cancelSubscription(bot.api, {
		userId: ctx.from!.id,
		telegramPaymentChargeId: payment.telegram_payment_charge_id,
	});
}
```

`cancelSubscription`/`reactivateSubscription` wrap `editUserStarSubscription` — cancelling stops future billing but leaves the subscription active until the current period ends, matching Telegram's own semantics. `isStarsPayment`/`isSubscriptionPayment` are small guards over `SuccessfulPayment` for branching on currency/recurrence.

refunding a Stars payment (subscription or one-off) and listing the bot's Star ledger are already typed on `Api` directly — no wrapper needed: `api.refundStarPayment(...)`, `api.getStarTransactions(...)`.

## testing

`@yaebal/test`'s `UserActor` already models the payment flow: `sendPreCheckoutQuery()` emits the query, and `sendSuccessfulPayment()` runs it end-to-end — it throws if the bot never answered `ok: true`, exactly like real Telegram never firing `successful_payment` after a decline.

```ts
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import { payments } from "@yaebal/payments";

const bot = new Composer<Context>().install(payments({ onPreCheckout: () => true }));
const env = createTestEnv(bot);

await env.createUser().sendSuccessfulPayment({ invoice_payload: "plan:pro" });
```

---

part of [**yaebal**](https://github.com/neverlane/yaebal) — a type-safe, runtime-agnostic Telegram Bot API framework. MIT.
