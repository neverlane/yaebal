// AUTO-GENERATED — do not edit by hand. Regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";

export interface BusinessConnectionContext extends t.BusinessConnection {}
export class BusinessConnectionContext {
	readonly api: Api;
	readonly update: t.Update;
	constructor(api: Api, update: t.Update) {
		this.api = api;
		this.update = update;
		Object.assign(this, update.business_connection ?? {});
	}
	/** Id of the user this update is from. */
	get senderId(): number {
		return this.user.id;
	}
	/** First name of the user this update is from. */
	get firstName(): string | undefined {
		return this.user.first_name;
	}
}
