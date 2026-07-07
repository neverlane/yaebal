/** gzip+base64 code packing for playground share links (`?code=g.<payload>`). */

export async function encodeShare(text: string): Promise<string> {
	const bytes = new TextEncoder().encode(text);
	const compressed =
		"CompressionStream" in globalThis
			? new Uint8Array(
					await new Response(
						new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
					).arrayBuffer(),
				)
			: bytes;

	const binary = Array.from(compressed, (b) => String.fromCharCode(b)).join("");

	return `${compressed === bytes ? "p" : "g"}.${btoa(binary)}`;
}

export async function decodeShare(value: string): Promise<string> {
	const [kind, payload] = value.includes(".") ? value.split(".", 2) : ["p", value];
	const bytes = Uint8Array.from(atob(decodeURIComponent(payload ?? "")), (c) => c.charCodeAt(0));

	if (kind === "g" && "DecompressionStream" in globalThis) {
		return new Response(
			new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
		).text();
	}

	return new TextDecoder().decode(bytes);
}
