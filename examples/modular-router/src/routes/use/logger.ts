import { defineUse } from "../../router.js";

// `use/` files are for anything that doesn't fit the other three kinds — here, a plain logging
// middleware that runs before every command/hears/on route (use/ loads first, see the router
// docs' "registration order" section).
export default defineUse((ctx, next) => {
	console.log(`[modular-router] update #${ctx.update.update_id} (${ctx.updateType})`);
	return next();
});
