import assert from "node:assert/strict";
import test from "node:test";
import { Composer, type Context } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import {
	cancelSubscription,
	invoice,
	isStarsPayment,
	isSubscriptionPayment,
	payments,
	reactivateSubscription,
	STARS_CURRENCY,
	SUBSCRIPTION_PERIOD_SECONDS,
} from "./index.js";

test("invoice(): defaults to stars with an empty provider_token", () => {
	const params = invoice("pro", "pro plan", "plan:pro").price("plan", 100).build();

	assert.equal(params.currency, STARS_CURRENCY);
	assert.equal(params.provider_token, "");
	assert.deepEqual(params.prices, [{ label: "plan", amount: 100 }]);
});

test("invoice(): .provider() switches to an external processor", () => {
	const params = invoice("t-shirt", "black, medium", "shirt:1")
		.provider("provider-token", "USD")
		.price("shirt", 1999)
		.build();

	assert.equal(params.currency, "USD");
	assert.equal(params.provider_token, "provider-token");
});

test("invoice(): .subscription() forces stars and sets subscription_period", () => {
	const params = invoice("pro", "monthly pro access", "sub:pro")
		.provider("provider-token", "USD") // should be overridden by subscription()
		.price("pro", 100)
		.subscription()
		.build();

	assert.equal(params.currency, STARS_CURRENCY);
	assert.equal(params.provider_token, "");
	assert.equal(params.subscription_period, SUBSCRIPTION_PERIOD_SECONDS);
});

test("invoice(): toSendInvoiceParams() adds chat_id and allows overrides", () => {
	const params = invoice("tip", "tip jar", "tip:1")
		.price("tip", 1)
		.toSendInvoiceParams(42, { start_parameter: "tip" });

	assert.equal(params.chat_id, 42);
	assert.equal(params.start_parameter, "tip");
	assert.equal(params.title, "tip");
});

test("invoice(): toCreateInvoiceLinkParams() has no chat_id", () => {
	const params = invoice("tip", "tip jar", "tip:1").price("tip", 1).toCreateInvoiceLinkParams();

	assert.equal((params as unknown as { chat_id?: unknown }).chat_id, undefined);
	assert.equal(params.title, "tip");
});

test("isStarsPayment()/isSubscriptionPayment()", () => {
	assert.equal(isStarsPayment({ currency: "XTR" }), true);
	assert.equal(isStarsPayment({ currency: "USD" }), false);

	assert.equal(
		isSubscriptionPayment({
			currency: "XTR",
			total_amount: 100,
			invoice_payload: "p",
			telegram_payment_charge_id: "c",
			provider_payment_charge_id: "p",
			subscription_expiration_date: 123,
		}),
		true,
	);
	assert.equal(
		isSubscriptionPayment({
			currency: "XTR",
			total_amount: 100,
			invoice_payload: "p",
			telegram_payment_charge_id: "c",
			provider_payment_charge_id: "p",
		}),
		false,
	);
});

test("payments(): approves pre-checkout and runs onSuccessfulPayment", async () => {
	const received: unknown[] = [];
	const bot = new Composer<Context>().install(
		payments({
			onPreCheckout: () => true,
			onSuccessfulPayment: (_ctx, payment) => {
				received.push(payment.invoice_payload);
			},
		}),
	);

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendSuccessfulPayment({ invoice_payload: "plan:pro" });

	assert.deepEqual(env.lastApiCall("answerPreCheckoutQuery")?.params, {
		pre_checkout_query_id: env.lastApiCall("answerPreCheckoutQuery")?.params?.pre_checkout_query_id,
		ok: true,
	});
	assert.deepEqual(received, ["plan:pro"]);
});

test("payments(): a string decision declines with that error message", async () => {
	const bot = new Composer<Context>().install(payments({ onPreCheckout: () => "out of stock" }));

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendPreCheckoutQuery();

	assert.deepEqual(env.lastApiCall("answerPreCheckoutQuery")?.params, {
		pre_checkout_query_id: env.lastApiCall("answerPreCheckoutQuery")?.params?.pre_checkout_query_id,
		ok: false,
		error_message: "out of stock",
	});

	// real Telegram never fires successful_payment after a declined pre-checkout.
	await assert.rejects(user.sendSuccessfulPayment());
});

test("payments(): autoAnswerPreCheckout:false leaves answering to the caller", async () => {
	const bot = new Composer<Context>().install(
		payments({
			autoAnswerPreCheckout: false,
			onPreCheckout: (ctx, query) => {
				void ctx.api.answerPreCheckoutQuery({ pre_checkout_query_id: query.id, ok: true });
			},
		}),
	);

	const env = createTestEnv(bot);
	await env.createUser().sendPreCheckoutQuery();

	assert.equal(env.callsTo("answerPreCheckoutQuery").length, 1);
});

test("cancelSubscription()/reactivateSubscription() edit the subscription via the api", async () => {
	const bot = new Composer<Context>();
	const env = createTestEnv(bot);

	await cancelSubscription(env.api, { userId: 1, telegramPaymentChargeId: "charge_1" });
	assert.deepEqual(env.lastApiCall("editUserStarSubscription")?.params, {
		user_id: 1,
		telegram_payment_charge_id: "charge_1",
		is_canceled: true,
	});

	await reactivateSubscription(env.api, { userId: 1, telegramPaymentChargeId: "charge_1" });
	assert.deepEqual(env.lastApiCall("editUserStarSubscription")?.params, {
		user_id: 1,
		telegram_payment_charge_id: "charge_1",
		is_canceled: false,
	});
});
