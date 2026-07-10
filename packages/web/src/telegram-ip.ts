/**
 * telegram delivers webhooks only from two published subnets. checking the peer
 * ip is defence in depth on top of the secret token — a random scanner that
 * finds your endpoint can't even reach the handler. the client ip is
 * platform-specific (`cf-connecting-ip`, `x-forwarded-for`, `req.ip`, …), so you
 * pass it in; `@yaebal/web` doesn't guess it for you.
 *
 * @see https://core.telegram.org/bots/webhooks
 */

/** telegram's documented webhook source ranges, as `[network, prefix]` CIDRs. */
export const TELEGRAM_IP_RANGES: readonly (readonly [string, number])[] = [
	["149.154.160.0", 20],
	["91.108.4.0", 22],
];

function ipv4ToInt(ip: string): number | undefined {
	const parts = ip.split(".");
	if (parts.length !== 4) return undefined;

	let value = 0;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return undefined;
		const n = Number(part);
		if (n > 255) return undefined;
		value = value * 256 + n;
	}

	return value >>> 0;
}

/**
 * is `ip` inside a telegram webhook subnet? handles plain IPv4 and the
 * IPv4-mapped IPv6 form (`::ffff:149.154.167.51`) that some runtimes report.
 * unknown/IPv6 inputs return `false` — telegram publishes no IPv6 webhook range.
 */
export function isTelegramIp(ip: string | null | undefined): boolean {
	if (!ip) return false;

	const mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
	const value = ipv4ToInt(mapped.trim());
	if (value === undefined) return false;

	for (const [network, prefix] of TELEGRAM_IP_RANGES) {
		const base = ipv4ToInt(network);
		if (base === undefined) continue;

		const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
		if ((value & mask) === (base & mask)) return true;
	}

	return false;
}
