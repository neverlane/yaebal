import type { TelegramError } from "@yaebal/core";

/**
 * the slice of telegram serverless `sdk` that the api adapter talks to.
 * structural on purpose: the real `sdk` only exists inside a tgcloud isolate,
 * and tests pass a fake with the same shape.
 */
export interface TgcloudSdkApi {
	[method: string]: ((...args: never[]) => Promise<unknown>) | undefined;
	getFileContent?(fileId: string): Promise<Uint8Array>;
}

export interface TgcloudInputFile {
	readonly bytes: Uint8Array;
	readonly filename: string;
}

export interface TgcloudSdk {
	api: TgcloudSdkApi;
	InputFile: new (
		bytes: Uint8Array,
		filename: string,
		options?: { type?: string },
	) => TgcloudInputFile;
	BotApiError: abstract new (
		...args: never[]
	) => {
		code: number;
		description: string;
		method?: string;
		parameters?: TelegramError["parameters"];
	};
}

/** how {@link createSdkApi} reaches `sdk` — injected, never imported. */
export interface SdkBridge {
	api: TgcloudSdkApi;
	InputFile: TgcloudSdk["InputFile"];
	isBotApiError(error: unknown): error is InstanceType<TgcloudSdk["BotApiError"]>;
}
