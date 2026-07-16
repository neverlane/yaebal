// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";

export interface SubscriptionContext extends t.BotSubscriptionUpdated {}
export class SubscriptionContext {
	readonly api: Api;
	readonly update: t.Update;
	constructor(api: Api, update: t.Update) {
		this.api = api;
		this.update = update;
		Object.assign(this, update.subscription ?? {});
	}
	/** id of the user this update is from. */
	get senderId(): number {
		return this.user.id;
	}
	/** first name of the user this update is from. */
	get firstName(): string | undefined {
		return this.user.first_name;
	}
}
