export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.svg"]),
	mimeTypes: {".svg":"image/svg+xml"},
	_: {
		client: {start:"_app/immutable/entry/start.2SQazvAH.js",app:"_app/immutable/entry/app.B76dkn1C.js",imports:["_app/immutable/entry/start.2SQazvAH.js","_app/immutable/chunks/D4KieXef.js","_app/immutable/chunks/CILFtpHi.js","_app/immutable/chunks/CZoOGrhn.js","_app/immutable/chunks/OA8UcISh.js","_app/immutable/entry/app.B76dkn1C.js","_app/immutable/chunks/C1FmrZbK.js","_app/immutable/chunks/CILFtpHi.js","_app/immutable/chunks/hsF3hrRr.js","_app/immutable/chunks/CBlwNYzs.js","_app/immutable/chunks/ItzQ5H_G.js","_app/immutable/chunks/CZoOGrhn.js","_app/immutable/chunks/CZZgRwnr.js","_app/immutable/chunks/PnyQD1R_.js","_app/immutable/chunks/BMxgNVbx.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js'))
		],
		remotes: {
			
		},
		routes: [
			
		],
		prerendered_routes: new Set(["/","/docs/getting-started/","/docs/","/docs/contexts/","/docs/context/","/docs/core/","/docs/hooks/","/docs/introduction/","/docs/media/","/docs/packages/","/docs/plugins/","/docs/plugins/again/","/docs/plugins/broadcast/","/docs/plugins/callback-data/","/docs/plugins/commands/","/docs/plugins/conversation/","/docs/plugins/files/","/docs/plugins/filters/","/docs/plugins/fmt/","/docs/plugins/i18n/","/docs/plugins/keyboard/","/docs/plugins/media-cache/","/docs/plugins/media-group/","/docs/plugins/morda/","/docs/plugins/pagination/","/docs/plugins/panel/","/docs/plugins/prompt/","/docs/plugins/ratelimiter/","/docs/plugins/router/","/docs/plugins/scenes/","/docs/plugins/session/","/docs/plugins/split/","/docs/plugins/throttle/","/docs/plugins/web/","/docs/runner/","/docs/runtimes/","/docs/scaffolding/","/docs/types/","/docs/webhooks/","/docs/workers/","/docs/yaebal/","/playground/"]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
