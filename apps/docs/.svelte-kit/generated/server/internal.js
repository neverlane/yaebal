
import root from '../root.js';
import { set_building, set_prerendering } from '$app/env/internal';
import { set_assets } from '$app/paths/internal/server';
import { set_manifest, set_read_implementation } from '__sveltekit/server';
import { set_private_env, set_public_env } from '../../../../../node_modules/.pnpm/@sveltejs+kit@2.67.0_@sveltejs+vite-plugin-svelte@4.0.4_svelte@5.56.3_vite@5.4.21_@types+node_rtipkdc5cmpfpkbpynivevdozu/node_modules/@sveltejs/kit/src/runtime/shared-server.js';
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
		app: ({ head, body, assets, nonce, env }) => "<!doctype html>\n<html lang=\"en\">\n\t<head>\n\t\t<meta charset=\"utf-8\" />\n\t\t<link rel=\"icon\" href=\"" + assets + "/favicon.svg\" />\n\t\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\" />\n\t\t<meta name=\"theme-color\" content=\"#000000\" />\n\t\t<meta name=\"description\" content=\"yaebal — yet another telegram bot api library. type-safe, chainable, plugin-first.\" />\n\t\t<script>\n\t\t\t(() => {\n\t\t\t\ttry {\n\t\t\t\t\tconst saved = localStorage.getItem(\"theme\");\n\t\t\t\t\tconst theme = saved ?? \"dark\";\n\t\t\t\t\tdocument.documentElement.setAttribute(\"data-theme\", theme);\n\t\t\t\t} catch {\n\t\t\t\t\tdocument.documentElement.setAttribute(\"data-theme\", \"dark\");\n\t\t\t\t}\n\t\t\t})();\n\t\t</script>\n\t\t" + head + "\n\t</head>\n\t<body data-sveltekit-preload-data=\"hover\">\n\t\t<div style=\"display: contents\">" + body + "</div>\n\t</body>\n</html>\n",
		error
	},
	version_hash: "1v04dth"
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
