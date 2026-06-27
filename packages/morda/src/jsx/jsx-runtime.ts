// Automatic JSX runtime. `jsx(type, props)` just builds a vnode; the morda/jsx
// renderer flattens it to a WindowView. Components are never invoked by the
// runtime itself — they are resolved during flattening.

/** Brand so `isVNode` can't mistake a plain user object for an element. */
export const VNODE: unique symbol = Symbol.for("yaebal.morda.vnode");

export interface VNode {
	[VNODE]: true;
	type: unknown;
	props: { children?: unknown; [key: string]: unknown };
}

export function jsx(type: unknown, props: { children?: unknown; [key: string]: unknown }): VNode {
	return { [VNODE]: true, type, props };
}

export const jsxs = jsx;

export function Fragment(props: { children?: unknown }): VNode {
	return { [VNODE]: true, type: Fragment, props };
}

export namespace JSX {
	export type Element = VNode;
	export interface ElementChildrenAttribute {
		children: Record<never, never>;
	}
	export interface IntrinsicElements {
		[elem: string]: never;
	}
}
