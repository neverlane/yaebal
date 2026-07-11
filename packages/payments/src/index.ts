import type { Api, Context, Plugin } from "@yaebal/core";
import type {
	CreateInvoiceLinkParams,
	EditUserStarSubscriptionParams,
	LabeledPrice,
	PreCheckoutQuery,
	SendInvoiceParams,
	SuccessfulPayment,
} from "@yaebal/types";

export type {
	CreateInvoiceLinkParams,
	LabeledPrice,
	PreCheckoutQuery,
	SendInvoiceParams,
	SuccessfulPayment,
} from "@yaebal/types";

/** currency code Telegram uses for in-app Stars payments. */
export const STARS_CURRENCY = "XTR";

/** the only `subscription_period` Telegram currently accepts — 30 days, in seconds. */
export const SUBSCRIPTION_PERIOD_SECONDS = 2_592_000;

/** the fields every invoice needs, independent of who processes the payment. */
export interface InvoiceParams {
	title: string;
	description: string;
	payload: string;
	provider_token?: string;
	currency: string;
	prices: LabeledPrice[];
	subscription_period?: number;
	max_tip_amount?: number;
	suggested_tip_amounts?: number[];
	provider_data?: string;
	photo_url?: string;
	photo_size?: number;
	photo_width?: number;
	photo_height?: number;
	need_name?: boolean;
	need_phone_number?: boolean;
	need_email?: boolean;
	need_shipping_address?: boolean;
	send_phone_number_to_provider?: boolean;
	send_email_to_provider?: boolean;
	is_flexible?: boolean;
}

/**
 * fluent, provider-agnostic invoice builder. defaults to Telegram Stars
 * (`.stars()`); switch to an external processor with `.provider(token, currency)`.
 * finish with `.toSendInvoiceParams(chatId)` (for `sendInvoice`) or
 * `.toCreateInvoiceLinkParams()` (for `createInvoiceLink`).
 */
export class InvoiceBuilder {
	#params: InvoiceParams;

	constructor(title: string, description: string, payload: string) {
		this.#params = {
			title,
			description,
			payload,
			currency: STARS_CURRENCY,
			provider_token: "",
			prices: [],
		};
	}

	/** pay with Telegram Stars — the default; clears any external provider token. */
	stars(): this {
		this.#params.currency = STARS_CURRENCY;
		this.#params.provider_token = "";
		return this;
	}

	/** pay through an external processor, using a `provider_token` obtained via @BotFather. */
	provider(token: string, currency: string): this {
		this.#params.provider_token = token;
		this.#params.currency = currency;
		return this;
	}

	/** append one price component (e.g. product price, tax, discount). */
	price(label: string, amount: number): this {
		this.#params.prices.push({ label, amount });
		return this;
	}

	/** replace the whole price breakdown at once. */
	setPrices(prices: LabeledPrice[]): this {
		this.#params.prices = [...prices];
		return this;
	}

	/**
	 * make this a Telegram Stars subscription (Bot API 7.6+ / Subscription API): the
	 * price is billed again every `periodSeconds` until the user or bot cancels it.
	 * forces Stars, since subscriptions aren't available with external providers.
	 * `periodSeconds` currently must be {@link SUBSCRIPTION_PERIOD_SECONDS} (30 days).
	 */
	subscription(periodSeconds: number = SUBSCRIPTION_PERIOD_SECONDS): this {
		this.stars();
		this.#params.subscription_period = periodSeconds;
		return this;
	}

	/** accept an optional tip, up to `amount` (ignored for Stars). */
	maxTip(amount: number): this {
		this.#params.max_tip_amount = amount;
		return this;
	}

	/** suggested tip amounts shown to the payer, strictly increasing and ≤ `maxTip`. */
	suggestedTips(...amounts: number[]): this {
		this.#params.suggested_tip_amounts = amounts;
		return this;
	}

	/** product photo shown above the invoice. */
	photo(url: string, options: { size?: number; width?: number; height?: number } = {}): this {
		this.#params.photo_url = url;
		if (options.size !== undefined) this.#params.photo_size = options.size;
		if (options.width !== undefined) this.#params.photo_width = options.width;
		if (options.height !== undefined) this.#params.photo_height = options.height;
		return this;
	}

	/** raw JSON handed to the payment provider (ignored for Stars). */
	providerData(data: string): this {
		this.#params.provider_data = data;
		return this;
	}

	needName(value = true): this {
		this.#params.need_name = value;
		return this;
	}

	needPhoneNumber(value = true): this {
		this.#params.need_phone_number = value;
		return this;
	}

	needEmail(value = true): this {
		this.#params.need_email = value;
		return this;
	}

	needShippingAddress(value = true): this {
		this.#params.need_shipping_address = value;
		return this;
	}

	sendPhoneNumberToProvider(value = true): this {
		this.#params.send_phone_number_to_provider = value;
		return this;
	}

	sendEmailToProvider(value = true): this {
		this.#params.send_email_to_provider = value;
		return this;
	}

	/** the final price depends on the shipping method chosen by the user (ignored for Stars). */
	flexible(value = true): this {
		this.#params.is_flexible = value;
		return this;
	}

	/** the provider-agnostic params built so far. */
	build(): InvoiceParams {
		return { ...this.#params, prices: [...this.#params.prices] };
	}

	/** params for `api.sendInvoice` — sends the invoice as a message in `chatId`. */
	toSendInvoiceParams(
		chatId: number | string,
		extra: Partial<Omit<SendInvoiceParams, keyof InvoiceParams | "chat_id">> = {},
	): SendInvoiceParams {
		return { chat_id: chatId, ...this.build(), ...extra };
	}

	/** params for `api.createInvoiceLink` — a shareable link, no chat required. */
	toCreateInvoiceLinkParams(
		extra: Partial<Omit<CreateInvoiceLinkParams, keyof InvoiceParams>> = {},
	): CreateInvoiceLinkParams {
		return { ...this.build(), ...extra };
	}
}

/** start a fluent invoice — see {@link InvoiceBuilder}. */
export function invoice(title: string, description: string, payload: string): InvoiceBuilder {
	return new InvoiceBuilder(title, description, payload);
}

/** true if `payment`/`query` was (or would be) settled in Telegram Stars rather than an external currency. */
export function isStarsPayment(payment: Pick<SuccessfulPayment, "currency">): boolean {
	return payment.currency === STARS_CURRENCY;
}

/** true if this successful payment is part of a recurring Stars subscription. */
export function isSubscriptionPayment(payment: SuccessfulPayment): boolean {
	return payment.subscription_expiration_date !== undefined;
}

/**
 * what a pre-checkout hook decided: `true`/`undefined` approves; `false` declines with a
 * generic message; a `string` declines with that message shown to the payer; an object
 * gives full control over both fields.
 */
export type PreCheckoutDecision =
	| boolean
	| string
	| { ok: boolean; errorMessage?: string }
	| undefined;

function normalizeDecision(decision: PreCheckoutDecision): { ok: boolean; errorMessage?: string } {
	if (decision === undefined || decision === true) return { ok: true };
	if (decision === false) return { ok: false };
	if (typeof decision === "string") return { ok: false, errorMessage: decision };
	return decision;
}

export interface PaymentsOptions {
	/**
	 * decide whether to proceed with a pre-checkout. Telegram requires an answer within 10
	 * seconds — return (or resolve) `true`/nothing to approve, `false`/a string/`{ ok, errorMessage }`
	 * to decline. left unset, no `pre_checkout_query` handler is installed at all.
	 */
	onPreCheckout?: (
		ctx: Context,
		query: PreCheckoutQuery,
	) => PreCheckoutDecision | Promise<PreCheckoutDecision>;
	/** runs after a `successful_payment` message arrives — fulfil the order, grant access, etc. */
	onSuccessfulPayment?: (ctx: Context, payment: SuccessfulPayment) => unknown | Promise<unknown>;
	/** call `answerPreCheckoutQuery` with `onPreCheckout`'s decision automatically. defaults to `true`. */
	autoAnswerPreCheckout?: boolean;
}

/**
 * wires `onPreCheckout`/`onSuccessfulPayment` onto `pre_checkout_query` and
 * `message:successful_payment`. provider-agnostic — the same hooks fire whether the
 * invoice was paid in Stars or through an external processor.
 */
export function payments(options: PaymentsOptions = {}): Plugin<Context, Record<never, never>> {
	return (composer) => {
		if (options.onPreCheckout) {
			const onPreCheckout = options.onPreCheckout;
			const autoAnswer = options.autoAnswerPreCheckout ?? true;

			composer.on("pre_checkout_query", async (ctx, next) => {
				const query = ctx.update.pre_checkout_query!;
				const decision = normalizeDecision(await onPreCheckout(ctx, query));

				if (autoAnswer) {
					await ctx.api.answerPreCheckoutQuery({
						pre_checkout_query_id: query.id,
						ok: decision.ok,
						...(decision.errorMessage ? { error_message: decision.errorMessage } : {}),
					});
				}

				await next();
			});
		}

		if (options.onSuccessfulPayment) {
			const onSuccessfulPayment = options.onSuccessfulPayment;

			composer.on("message:successful_payment", async (ctx, next) => {
				await onSuccessfulPayment(ctx, ctx.message.successful_payment);
				await next();
			});
		}

		return composer;
	};
}

export interface StarSubscriptionParams {
	/** the user whose subscription is being edited. */
	userId: number;
	/** the subscription's `SuccessfulPayment.telegram_payment_charge_id`. */
	telegramPaymentChargeId: string;
}

/**
 * cancel further billing for a Stars subscription — it stays active until the current
 * period ends, matching Telegram's own `editUserStarSubscription(is_canceled: true)`.
 */
export function cancelSubscription(api: Api, params: StarSubscriptionParams): Promise<boolean> {
	return api.editUserStarSubscription(toEditParams(params, true));
}

/** re-enable a subscription previously stopped with {@link cancelSubscription}. */
export function reactivateSubscription(api: Api, params: StarSubscriptionParams): Promise<boolean> {
	return api.editUserStarSubscription(toEditParams(params, false));
}

function toEditParams(
	params: StarSubscriptionParams,
	isCanceled: boolean,
): EditUserStarSubscriptionParams {
	return {
		user_id: params.userId,
		telegram_payment_charge_id: params.telegramPaymentChargeId,
		is_canceled: isCanceled,
	};
}
