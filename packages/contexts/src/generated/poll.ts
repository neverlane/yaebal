// AUTO-GENERATED — do not edit by hand. regenerate: pnpm --filter @yaebal/contexts generate
import type { Api } from "@yaebal/core";
import type * as t from "@yaebal/types";

export interface PollContext extends t.Poll {}
export class PollContext {
	readonly api: Api;
	readonly update: t.Update;
	constructor(api: Api, update: t.Update) {
		this.api = api;
		this.update = update;
		Object.assign(this, update.poll ?? {});
	}

}
