import type { Bot, Context, Update } from "@yaebal/core";
import { createSdkFetch } from "./api.js";
import { type TgcloudHandlerContext, updateFromHandler } from "./handlers.js";
import type { TgcloudSdk } from "./sdk.js";

declare const __YAEBAL_TGCLOUD_INPUT__: string;
declare const __YAEBAL_TGCLOUD_EXPORT__: string;
declare const __YAEBAL_TGCLOUD_ENTRY__: string;

/**
 * runtime entry, bundled once per update type. esbuild replaces the three
 * constants and inlines the bot; `sdk` stays a bare import because tgcloud
 * provides it and forbids every other package.
 *
 * `fetch` is swapped before the bot module loads. the client reads the global
 * on each call and keeps every hook that was registered on it, so `autoRetry`
 * and the rest still wrap the `sdk` transport instead of a copy of it.
 */
const sdk = (await import("sdk" as string)) as TgcloudSdk;
const platformFetch = globalThis.fetch;

globalThis.fetch = createSdkFetch(
	{
		api: sdk.api,
		InputFile: sdk.InputFile,
		isBotApiError: (error): error is InstanceType<TgcloudSdk["BotApiError"]> =>
			error instanceof sdk.BotApiError,
	},
	platformFetch,
);

type BotModule = Record<string, Bot<Context> | undefined>;

const imported = (await import(__YAEBAL_TGCLOUD_INPUT__)) as BotModule;
const exported = imported[__YAEBAL_TGCLOUD_EXPORT__];
if (!exported) {
	throw new Error(
		`@yaebal/tgcloud: ${__YAEBAL_TGCLOUD_INPUT__} did not export "${__YAEBAL_TGCLOUD_EXPORT__}"`,
	);
}
const bot: Bot<Context> = exported;

const readFile = sdk.api.getFileContent?.bind(sdk.api);
Object.assign(bot.api, {
	downloadFile: async (fileId: string) => {
		if (!readFile) throw new Error("@yaebal/tgcloud: sdk.api.getFileContent is missing");
		return { filePath: fileId, bytes: await readFile(fileId) };
	},
});

const type = __YAEBAL_TGCLOUD_ENTRY__;

export default async function handle(payload: unknown, ctx?: TgcloudHandlerContext): Promise<void> {
	await bot.handleUpdate(updateFromHandler(type, payload, ctx) as Update);
}
