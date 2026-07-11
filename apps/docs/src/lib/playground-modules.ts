/**
 * everything a playground snippet can import at runtime. one registry shared by the
 * mock worker, the inline fallback and live mode — add a package here and every mode
 * picks it up (and the Monaco types come from `playground-dts.ts` automatically).
 *
 * only browser-safe packages belong here: `@yaebal/panel`, `@yaebal/router`,
 * `@yaebal/toml` and `@yaebal/workers` need node builtins at import time, and
 * `@yaebal/runner` drives real long polling, which the playground replaces.
 *
 * `yaebal` / `@yaebal/core` are NOT listed — each run injects them with a patched
 * `Bot`/`createBot` wired to the mock api (see `patchBotModule` in playground-sandbox).
 */
import * as again from "@yaebal/again";
import * as analytics from "@yaebal/analytics";
import * as auditLog from "@yaebal/audit-log";
import * as autoAnswer from "@yaebal/auto-answer";
import * as broadcast from "@yaebal/broadcast";
import * as cache from "@yaebal/cache";
import * as callbackData from "@yaebal/callback-data";
import * as commands from "@yaebal/commands";
import * as contexts from "@yaebal/contexts";
import * as conversation from "@yaebal/conversation";
import * as cron from "@yaebal/cron";
import * as featureFlags from "@yaebal/feature-flags";
import * as fileId from "@yaebal/file-id";
import * as files from "@yaebal/files";
import * as filters from "@yaebal/filters";
import * as fmt from "@yaebal/fmt";
import * as guards from "@yaebal/guards";
import * as i18n from "@yaebal/i18n";
import * as keyboard from "@yaebal/keyboard";
import * as mediaCache from "@yaebal/media-cache";
import * as mediaGroup from "@yaebal/media-group";
import * as morda from "@yaebal/morda";
import * as onboarding from "@yaebal/onboarding";
import * as pagination from "@yaebal/pagination";
import * as preview from "@yaebal/preview";
import * as prompt from "@yaebal/prompt";
import * as ratelimiter from "@yaebal/ratelimiter";
import * as rich from "@yaebal/rich";
import * as scenes from "@yaebal/scenes";
import * as session from "@yaebal/session";
import * as sklad from "@yaebal/sklad";
import * as split from "@yaebal/split";
import * as test from "@yaebal/test";
import * as throttle from "@yaebal/throttle";
import * as types from "@yaebal/types";
import * as typing from "@yaebal/typing";
import * as web from "@yaebal/web";

export const PLUGIN_MODULES: Record<string, unknown> = {
	"@yaebal/again": again,
	"@yaebal/analytics": analytics,
	"@yaebal/audit-log": auditLog,
	"@yaebal/auto-answer": autoAnswer,
	"@yaebal/broadcast": broadcast,
	"@yaebal/cache": cache,
	"@yaebal/callback-data": callbackData,
	"@yaebal/commands": commands,
	"@yaebal/contexts": contexts,
	"@yaebal/conversation": conversation,
	"@yaebal/cron": cron,
	"@yaebal/feature-flags": featureFlags,
	"@yaebal/file-id": fileId,
	"@yaebal/files": files,
	"@yaebal/filters": filters,
	"@yaebal/fmt": fmt,
	"@yaebal/guards": guards,
	"@yaebal/i18n": i18n,
	"@yaebal/keyboard": keyboard,
	"@yaebal/media-cache": mediaCache,
	"@yaebal/media-group": mediaGroup,
	"@yaebal/morda": morda,
	"@yaebal/onboarding": onboarding,
	"@yaebal/pagination": pagination,
	"@yaebal/preview": preview,
	"@yaebal/prompt": prompt,
	"@yaebal/ratelimiter": ratelimiter,
	"@yaebal/rich": rich,
	"@yaebal/scenes": scenes,
	"@yaebal/session": session,
	"@yaebal/sklad": sklad,
	"@yaebal/split": split,
	"@yaebal/test": test,
	"@yaebal/throttle": throttle,
	"@yaebal/types": types,
	"@yaebal/typing": typing,
	"@yaebal/web": web,
};
