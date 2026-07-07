// the encoding primitives file_id strings are built from, bottom to top:
// TL binary (little-endian, bigint-aware) → zero-byte RLE → url-safe base64.
// pure JS, no Buffer — works on node/bun/deno and edge runtimes alike.

import { FileIdParseError } from "./errors.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = (() => {
	const table = new Int8Array(128).fill(-1);
	for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;

	return table;
})();

/** decode TDLib's url-safe base64 (no padding; stray `=` tolerated). */
export function base64urlDecode(input: string): Uint8Array {
	const out = new Uint8Array(Math.floor((input.length * 3) / 4));
	let acc = 0;
	let bits = 0;
	let n = 0;

	for (let i = 0; i < input.length; i++) {
		if (input.charAt(i) === "=") continue;

		const code = input.charCodeAt(i);
		const value = code < 128 ? (LOOKUP[code] ?? -1) : -1;
		if (value === -1) {
			throw new FileIdParseError(`invalid base64url character at index ${i}`, input);
		}

		acc = (acc << 6) | value;
		bits += 6;

		if (bits >= 8) {
			bits -= 8;
			out[n++] = (acc >> bits) & 0xff;
		}
	}

	return out.subarray(0, n);
}

/** encode bytes as TDLib's url-safe base64 (no padding). */
export function base64urlEncode(bytes: Uint8Array): string {
	let out = "";

	for (let i = 0; i < bytes.length; i += 3) {
		const b0 = bytes[i] as number;
		const b1 = bytes[i + 1];
		const b2 = bytes[i + 2];

		out += ALPHABET.charAt(b0 >> 2);
		out += ALPHABET.charAt(((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4));
		if (b1 !== undefined) out += ALPHABET.charAt(((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6));
		if (b2 !== undefined) out += ALPHABET.charAt(b2 & 0b111111);
	}

	return out;
}

/** run-length encode zero bytes (`0, 0, 0` → `0, 3`) — what telegram applies before base64url. */
export function rleEncode(input: Uint8Array): Uint8Array {
	const out: number[] = [];
	let zeros = 0;

	for (const byte of input) {
		if (byte === 0) {
			zeros++;
			continue;
		}

		if (zeros > 0) {
			out.push(0, zeros);
			zeros = 0;
		}

		out.push(byte);
	}

	if (zeros > 0) out.push(0, zeros);

	return new Uint8Array(out);
}

/** inverse of {@link rleEncode}. */
export function rleDecode(input: Uint8Array): Uint8Array {
	const out: number[] = [];
	let prev: number | null = null;

	for (const byte of input) {
		if (prev === 0) {
			for (let i = 0; i < byte; i++) out.push(0);
			prev = null;
			continue;
		}

		if (prev !== null) out.push(prev);
		prev = byte;
	}

	if (prev !== null) out.push(prev);

	return new Uint8Array(out);
}

/** little-endian reader with hard bounds checks — truncated input fails loud, not with NaNs. */
export class BinaryReader {
	readonly #bytes: Uint8Array;
	readonly #view: DataView;
	#offset = 0;

	constructor(bytes: Uint8Array) {
		this.#bytes = bytes;
		this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	}

	get position(): number {
		return this.#offset;
	}

	get remaining(): number {
		return this.#bytes.byteLength - this.#offset;
	}

	#need(count: number): void {
		if (this.remaining < count) {
			throw new FileIdParseError(
				`truncated payload: needed ${count} byte(s) at offset ${this.#offset}, had ${this.remaining}`,
			);
		}
	}

	readInt32(): number {
		this.#need(4);
		const value = this.#view.getInt32(this.#offset, true);
		this.#offset += 4;

		return value;
	}

	readUint32(): number {
		this.#need(4);
		const value = this.#view.getUint32(this.#offset, true);
		this.#offset += 4;

		return value;
	}

	readInt64(): bigint {
		this.#need(8);
		const value = this.#view.getBigInt64(this.#offset, true);
		this.#offset += 8;

		return value;
	}

	readUint8(): number {
		this.#need(1);
		return this.#bytes[this.#offset++] as number;
	}

	readBytes(count: number): Uint8Array {
		this.#need(count);
		const slice = this.#bytes.slice(this.#offset, this.#offset + count);
		this.#offset += count;

		return slice;
	}

	skip(count: number): void {
		this.#need(count);
		this.#offset += count;
	}
}

/** little-endian writer; `toBytes()` concatenates everything written. */
export class BinaryWriter {
	readonly #chunks: Uint8Array[] = [];

	writeInt32(value: number): void {
		const chunk = new Uint8Array(4);
		new DataView(chunk.buffer).setInt32(0, value, true);
		this.#chunks.push(chunk);
	}

	writeUint32(value: number): void {
		const chunk = new Uint8Array(4);
		new DataView(chunk.buffer).setUint32(0, value, true);
		this.#chunks.push(chunk);
	}

	writeInt64(value: bigint): void {
		const chunk = new Uint8Array(8);
		new DataView(chunk.buffer).setBigInt64(0, value, true);
		this.#chunks.push(chunk);
	}

	writeUint8(value: number): void {
		this.#chunks.push(new Uint8Array([value]));
	}

	writeBytes(bytes: Uint8Array): void {
		this.#chunks.push(bytes);
	}

	toBytes(): Uint8Array {
		let length = 0;
		for (const chunk of this.#chunks) length += chunk.byteLength;

		const out = new Uint8Array(length);
		let offset = 0;
		for (const chunk of this.#chunks) {
			out.set(chunk, offset);
			offset += chunk.byteLength;
		}

		return out;
	}
}

const alignTo4 = (value: number): number => (4 - (value % 4)) % 4;

/** write TL `string` framing: length prefix, bytes, zero-padding to 4-byte alignment. */
export function packTlString(writer: BinaryWriter, bytes: Uint8Array): void {
	const length = bytes.byteLength;

	if (length <= 253) {
		writer.writeUint8(length);
		writer.writeBytes(bytes);

		const pad = alignTo4(length + 1);
		if (pad > 0) writer.writeBytes(new Uint8Array(pad));

		return;
	}

	writer.writeUint8(254);
	writer.writeUint8(length & 0xff);
	writer.writeUint8((length >> 8) & 0xff);
	writer.writeUint8((length >> 16) & 0xff);
	writer.writeBytes(bytes);

	const pad = alignTo4(length);
	if (pad > 0) writer.writeBytes(new Uint8Array(pad));
}

/** read TL `string` framing written by {@link packTlString}. */
export function unpackTlString(reader: BinaryReader): Uint8Array {
	const first = reader.readUint8();

	if (first === 254) {
		const length = reader.readUint8() | (reader.readUint8() << 8) | (reader.readUint8() << 16);
		const bytes = reader.readBytes(length);
		const pad = alignTo4(length);
		if (pad > 0) reader.skip(pad);

		return bytes;
	}

	const bytes = reader.readBytes(first);
	const pad = alignTo4(first + 1);
	if (pad > 0) reader.skip(pad);

	return bytes;
}
