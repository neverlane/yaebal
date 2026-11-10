import { WIDGET_LIMITS, WidgetError } from "./limits.js";
import type { WidgetTonMessage, WidgetTonTransaction } from "./telegram-widget.js";

/**
 * TON wallet payments from a widget. the flow telegram documents:
 *
 * 1. the widget calls `request(data, { wallet: true })` on a tap (the client's `yw.pay()`); the
 *    bot's query is `{ type: "data", wallet_card }`.
 * 2. the bot answers with a TON Connect transaction — {@link tonTransaction} builds and checks it.
 * 3. the widget hands it to `wallet.sendTransaction(tx, data)` within 10 s of the answer.
 * 4. the bot gets `{ type: "sent_transaction", wallet, msg_hash }` and must verify the transfer
 *    on-chain itself (look `msg_hash` up in a TON api) before delivering anything.
 */

/** TON Connect's network ids. */
export const TON_NETWORK = { mainnet: "-239", testnet: "-3" } as const;

/** one transfer of a {@link tonTransaction}. */
export interface TonTransfer {
	/** user-friendly destination address. */
	address: string;
	/** nanotons — a bigint, a safe integer, or a decimal string. use {@link toNano} for TON amounts. */
	amount: bigint | number | string;
	/** base64 BoC payload (e.g. a comment cell). */
	payload?: string;
	/** base64 BoC state init. */
	stateInit?: string;
}

export interface TonTransactionOptions {
	/** 1–255 transfers. */
	messages: readonly TonTransfer[];
	/** seconds from `now` the wallet may still send it (default 300). ignored when `validUntil` is set. */
	validFor?: number;
	/** absolute unix-seconds deadline. */
	validUntil?: number;
	/** `"mainnet"`, `"testnet"`, or a raw TON Connect network id. omit to let the wallet decide. */
	network?: keyof typeof TON_NETWORK | (string & {});
	/** the clock, in ms (tests). default `Date.now()`. */
	now?: number;
}

const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const DECIMAL = /^\d+$/;

function nano(amount: TonTransfer["amount"], index: number): string {
	const value =
		typeof amount === "bigint"
			? amount.toString()
			: typeof amount === "number"
				? Number.isSafeInteger(amount)
					? String(amount)
					: ""
				: amount.trim();
	if (!DECIMAL.test(value)) {
		throw new WidgetError(
			"WIDGET_TON_INVALID",
			`messages[${index}].amount must be a non-negative integer number of nanotons, got ${String(amount)}`,
		);
	}
	return value.replace(/^0+(?=\d)/, "");
}

function boc(value: string | undefined, field: string, index: number): string | undefined {
	if (value === undefined) return undefined;
	if (!BASE64.test(value)) {
		throw new WidgetError("WIDGET_TON_INVALID", `messages[${index}].${field} must be base64`);
	}
	return value;
}

/**
 * build a TON Connect transaction for a widget's wallet — the json the bot answers the
 * `wallet: true` query with (pass it to `ctx.widget.answer(...)`).
 *
 * ```ts
 * ctx.widget.answer(tonTransaction({ messages: [{ address: SHOP, amount: toNano("1.5") }] }));
 * ```
 */
export function tonTransaction(options: TonTransactionOptions): WidgetTonTransaction {
	const { messages } = options;
	if (messages.length === 0 || messages.length > WIDGET_LIMITS.tonMessagesMax) {
		throw new WidgetError(
			"WIDGET_TON_INVALID",
			`a transaction carries 1-${WIDGET_LIMITS.tonMessagesMax} messages, got ${messages.length}`,
		);
	}

	const out: WidgetTonMessage[] = messages.map((m, i) => {
		if (typeof m.address !== "string" || m.address.trim() === "") {
			throw new WidgetError(
				"WIDGET_TON_INVALID",
				`messages[${i}].address must be a non-empty string`,
			);
		}
		const message: WidgetTonMessage = { address: m.address.trim(), amount: nano(m.amount, i) };
		const payload = boc(m.payload, "payload", i);
		const stateInit = boc(m.stateInit, "stateInit", i);
		if (payload !== undefined) message.payload = payload;
		if (stateInit !== undefined) message.stateInit = stateInit;
		return message;
	});

	const now = Math.floor((options.now ?? Date.now()) / 1000);
	const validUntil = options.validUntil ?? now + (options.validFor ?? 300);
	if (!Number.isInteger(validUntil) || validUntil <= now) {
		throw new WidgetError(
			"WIDGET_TON_INVALID",
			`valid_until must be a future unix time, got ${validUntil}`,
		);
	}

	const tx: WidgetTonTransaction = { valid_until: validUntil, messages: out };
	if (options.network !== undefined) {
		tx.network =
			options.network in TON_NETWORK
				? TON_NETWORK[options.network as keyof typeof TON_NETWORK]
				: options.network;
	}
	return tx;
}

/**
 * convert a TON amount to nanotons (1 TON = 10⁹), exactly — pass strings for fractional amounts
 * (`toNano("0.05")`); a number is accepted when it has at most 9 decimals in its shortest form.
 */
export function toNano(ton: string | number | bigint): string {
	if (typeof ton === "bigint") {
		if (ton < 0n) throw new WidgetError("WIDGET_TON_INVALID", "amount must not be negative");
		return (ton * 1_000_000_000n).toString();
	}
	const text = typeof ton === "number" ? String(ton) : ton.trim();
	const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(text);
	if (!match) {
		throw new WidgetError(
			"WIDGET_TON_INVALID",
			`${JSON.stringify(text)} is not a non-negative TON amount with at most 9 decimals`,
		);
	}
	const whole = BigInt(match[1] as string);
	const fraction = BigInt((match[2] ?? "").padEnd(9, "0"));
	return (whole * 1_000_000_000n + fraction).toString();
}

/** convert nanotons back to a TON decimal string (`"1500000000"` → `"1.5"`). */
export function fromNano(nanotons: string | bigint): string {
	const value = typeof nanotons === "bigint" ? nanotons : BigInt(nanotons);
	const negative = value < 0n;
	const abs = negative ? -value : value;
	const whole = abs / 1_000_000_000n;
	const fraction = (abs % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
	return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/**
 * parse a `sign_data` query's `sign_data` (telegram sends it JSON-serialized). returns
 * `undefined` for malformed input. verify the signature against `wallet.public_key` before
 * trusting it — the signed domain is `bot<bot_id>`.
 */
export function parseSignData(signData: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(signData);
		return typeof value === "object" && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}
