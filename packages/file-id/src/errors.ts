/** the input was malformed — bad base64url, truncated TL payload, unknown type tag, … */
export class FileIdParseError extends Error {
	/** the offending `file_id` / `file_unique_id` string, when known. */
	readonly input?: string;

	constructor(message: string, input?: string) {
		super(message);

		this.name = "FileIdParseError";
		if (input !== undefined) this.input = input;
	}
}

/**
 * the `file_id` declares a format version newer than this package understands —
 * telegram bumped the binary layout. open an issue when you hit this.
 */
export class UnsupportedFileIdVersionError extends Error {
	readonly version: number;
	readonly subVersion: number;

	constructor(version: number, subVersion: number) {
		super(`unsupported file_id version ${version}.${subVersion}`);

		this.name = "UnsupportedFileIdVersionError";
		this.version = version;
		this.subVersion = subVersion;
	}
}
