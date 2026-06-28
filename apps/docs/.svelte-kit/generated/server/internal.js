
import root from '../root.js';
import { set_building, set_prerendering } from '$app/env/internal';
import { set_assets } from '$app/paths/internal/server';
import { set_manifest, set_read_implementation } from '__sveltekit/server';
import { set_private_env, set_public_env } from '../../../../../node_modules/.pnpm/@sveltejs+kit@2.68.0_@svelt_4dddd8a9e5286e5a303b7c669f8f7963/node_modules/@sveltejs/kit/src/runtime/shared-server.js';
import error from '../shared/error-template.js';

export const options = {
	app_template_contains_nonce: false,
	async: false,
	csp: {"mode":"auto","directives":{"upgrade-insecure-requests":false,"block-all-mixed-content":false},"reportOnly":{"upgrade-insecure-requests":false,"block-all-mixed-content":false}},
	csrf_check_origin: true,
	csrf_trusted_origins: [],
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hash_routing: false,
	hooks: null, // added lazily, via `get_hooks`
	preload_strategy: "modulepreload",
	root,
	service_worker: false,
	service_worker_options: undefined,
	server_error_boundaries: false,
	templates: {
		app: ({ head, body, assets, nonce, env }) => "<!doctype html>\r\n<html lang=\"en\">\r\n\t<head>\r\n\t\t<meta charset=\"utf-8\" />\r\n\t\t<link rel=\"icon\" href=\"" + assets + "/favicon.svg\" />\r\n\t\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\" />\r\n\t\t<meta name=\"theme-color\" content=\"#000000\" />\r\n\t\t<meta name=\"description\" content=\"yaebal — yet another telegram bot api library. type-safe, chainable, plugin-first.\" />\r\n\t\t<script>\r\n\t\t\t(() => {\r\n\t\t\t\ttry {\r\n\t\t\t\t\tconst saved = localStorage.getItem(\"theme\");\r\n\t\t\t\t\tconst theme = saved ?? \"dark\";\r\n\t\t\t\t\tdocument.documentElement.setAttribute(\"data-theme\", theme);\r\n\t\t\t\t} catch {\r\n\t\t\t\t\tdocument.documentElement.setAttribute(\"data-theme\", \"dark\");\r\n\t\t\t\t}\r\n\t\t\t})();\r\n\t\t</script>\r\n\t\t" + head + "\r\n\t</head>\r\n\t<body data-sveltekit-preload-data=\"hover\">\r\n\t\t<div style=\"display: contents\">" + body + "</div>\r\n\t</body>\r\n</html>\r\n",
		error
	},
	version_hash: "q4gl8y"
};

export async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let handleValidationError;
	let init;
	

	let reroute;
	let transport;
	

	return {
		handle,
		handleFetch,
		handleError,
		handleValidationError,
		init,
		reroute,
		transport
	};
}

export { set_assets, set_building, set_manifest, set_prerendering, set_private_env, set_public_env, set_read_implementation };
