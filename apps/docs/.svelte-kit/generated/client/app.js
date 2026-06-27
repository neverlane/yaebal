// in dev, this makes Vite inject its client as this module's first dependency,
// so that global constant replacements are installed before any other module
// (including user hooks) evaluates. In build it's inert.
import.meta.hot;




export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14'),
	() => import('./nodes/15'),
	() => import('./nodes/16'),
	() => import('./nodes/17'),
	() => import('./nodes/18'),
	() => import('./nodes/19'),
	() => import('./nodes/20'),
	() => import('./nodes/21'),
	() => import('./nodes/22'),
	() => import('./nodes/23'),
	() => import('./nodes/24'),
	() => import('./nodes/25'),
	() => import('./nodes/26'),
	() => import('./nodes/27'),
	() => import('./nodes/28'),
	() => import('./nodes/29'),
	() => import('./nodes/30'),
	() => import('./nodes/31'),
	() => import('./nodes/32'),
	() => import('./nodes/33'),
	() => import('./nodes/34'),
	() => import('./nodes/35'),
	() => import('./nodes/36'),
	() => import('./nodes/37'),
	() => import('./nodes/38'),
	() => import('./nodes/39'),
	() => import('./nodes/40'),
	() => import('./nodes/41'),
	() => import('./nodes/42'),
	() => import('./nodes/43'),
	() => import('./nodes/44')
];

export const server_loads = [];

export const dictionary = {
		"/": [3],
		"/docs": [4,[2]],
		"/docs/contexts": [6,[2]],
		"/docs/context": [5,[2]],
		"/docs/core": [7,[2]],
		"/docs/getting-started": [8,[2]],
		"/docs/hooks": [9,[2]],
		"/docs/introduction": [10,[2]],
		"/docs/media": [11,[2]],
		"/docs/packages": [12,[2]],
		"/docs/plugins": [13,[2]],
		"/docs/plugins/again": [14,[2]],
		"/docs/plugins/broadcast": [15,[2]],
		"/docs/plugins/callback-data": [16,[2]],
		"/docs/plugins/commands": [17,[2]],
		"/docs/plugins/conversation": [18,[2]],
		"/docs/plugins/files": [19,[2]],
		"/docs/plugins/filters": [20,[2]],
		"/docs/plugins/fmt": [21,[2]],
		"/docs/plugins/i18n": [22,[2]],
		"/docs/plugins/keyboard": [23,[2]],
		"/docs/plugins/media-cache": [24,[2]],
		"/docs/plugins/media-group": [25,[2]],
		"/docs/plugins/morda": [26,[2]],
		"/docs/plugins/pagination": [27,[2]],
		"/docs/plugins/panel": [28,[2]],
		"/docs/plugins/prompt": [29,[2]],
		"/docs/plugins/ratelimiter": [30,[2]],
		"/docs/plugins/router": [31,[2]],
		"/docs/plugins/scenes": [32,[2]],
		"/docs/plugins/session": [33,[2]],
		"/docs/plugins/split": [34,[2]],
		"/docs/plugins/throttle": [35,[2]],
		"/docs/plugins/web": [36,[2]],
		"/docs/runner": [37,[2]],
		"/docs/runtimes": [38,[2]],
		"/docs/scaffolding": [39,[2]],
		"/docs/types": [40,[2]],
		"/docs/webhooks": [41,[2]],
		"/docs/workers": [42,[2]],
		"/docs/yaebal": [43,[2]],
		"/playground": [44]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
	
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
export const encoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.encode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.js';

export const get_error_template = () => import('../shared/error-template.js').then(m => m.default);