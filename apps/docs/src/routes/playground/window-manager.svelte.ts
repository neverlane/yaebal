/**
 * the playground's floating-window engine: a binary dock tree (row/col splits with
 * ratios) laid out over an absolutely-positioned grid, with interact.js drag/resize,
 * drop-zone docking previews, maximize, keyboard moves and localStorage persistence.
 * generic over the window key set so it stays reusable; anything
 * playground-specific (presets, which windows may group-swap) comes in via config.
 */

export type SplitDir = "row" | "col";
export type ResizeDir = "n" | "e" | "s" | "w";
export type DropZone = "left" | "right" | "top" | "bottom" | "center";

export type WindowBox = { x: number; y: number; w: number; h: number; z: number };
export type GhostBox = Omit<WindowBox, "z">;

export type LayoutNode<K extends string> =
	| { type: "leaf"; key: K }
	| { type: "split"; dir: SplitDir; ratio: number; first: LayoutNode<K>; second: LayoutNode<K> };

export function leaf<K extends string>(key: K): LayoutNode<K> {
	return { type: "leaf", key };
}

export function split<K extends string>(
	dir: SplitDir,
	ratio: number,
	first: LayoutNode<K>,
	second: LayoutNode<K>,
): LayoutNode<K> {
	return { type: "split", dir, ratio, first, second };
}

const GAP = 10;

const clampNumber = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

type Interactable = {
	draggable(options: unknown): Interactable;
	resizable(options: unknown): Interactable;
	unset(): void;
};
type InteractDragEvent = { dx: number; dy: number; clientX: number; clientY: number };
type InteractResizeEvent = {
	rect: { width: number; height: number };
	deltaRect: { left: number; right: number; top: number; bottom: number };
	edges: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };
};

export interface WindowManagerConfig<K extends string> {
	keys: readonly K[];
	min: Record<K, { w: number; h: number }>;
	initialTree: () => LayoutNode<K>;
	/** localStorage key the dock tree persists under. */
	storageKey: string;
	/** may a center-drop swap whole horizontal groups instead of just the two leaves? */
	canSwapGroups?: (source: K, target: K, dx: number, dy: number) => boolean;
}

export class WindowManager<K extends string> {
	windows = $state({}) as Record<K, WindowBox>;
	layoutTree = $state<LayoutNode<K>>();
	active = $state<K>();
	moving = $state<K | null>(null);
	resizing = $state<K | null>(null);
	ghost = $state<GhostBox | null>(null);
	maximized = $state<K | null>(null);
	menu = $state<{ key: K; x: number; y: number } | null>(null);
	ready = $state(false);

	gridEl: HTMLElement | undefined;

	private nextZ = 1;
	private lastGridSize: { w: number; h: number } | null = null;
	private pendingTree: LayoutNode<K> | null = null;
	private savedMaximizedTree: LayoutNode<K> | null = null;
	private dragStart: { key: K; box: WindowBox; clientX: number; clientY: number } | null = null;
	private readonly config: WindowManagerConfig<K>;

	constructor(config: WindowManagerConfig<K>) {
		this.config = config;
		this.layoutTree = config.initialTree();
		this.active = config.keys[0];

		for (const key of config.keys) {
			this.windows[key] = { x: 0, y: 0, w: config.min[key].w, h: config.min[key].h, z: this.nextZ++ };
		}
	}

	get tree(): LayoutNode<K> {
		return this.layoutTree ?? this.config.initialTree();
	}

	styleOf(key: K): string {
		const w = this.windows[key];

		return `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;z-index:${w.z};`;
	}

	focus = (key: K) => {
		this.active = key;
		this.windows[key] = { ...this.windows[key], z: this.nextZ };
		this.nextZ += 1;
	};

	resizeDirs(key: K): ResizeDir[] {
		return (["n", "e", "s", "w"] as ResizeDir[]).filter((dir) =>
			Boolean(this.findResizeTarget(this.tree, key, dir)),
		);
	}

	layoutWindows() {
		this.applyLayout(this.tree);
	}

	setTree(node: LayoutNode<K>) {
		this.layoutTree = node;
		this.savedMaximizedTree = null;
		this.maximized = null;
		this.applyLayout(node);
	}

	reset() {
		this.setTree(this.config.initialTree());
	}

	toggleMaximize = (key: K) => {
		if (this.maximized === key && this.savedMaximizedTree) {
			this.layoutTree = this.savedMaximizedTree;
			this.savedMaximizedTree = null;
			this.maximized = null;
			this.applyLayout(this.tree);
			return;
		}

		if (!this.maximized) this.savedMaximizedTree = this.cloneLayout(this.tree);
		this.layoutTree = leaf(key);
		this.maximized = key;
		this.applyLayout(this.tree);
	};

	openMenu = (key: K, e: MouseEvent) => {
		e.preventDefault();
		this.focus(key);
		this.menu = { key, x: e.clientX, y: e.clientY };
	};

	closeMenu = () => {
		this.menu = null;
	};

	// --- persistence ---

	load() {
		try {
			const stored = JSON.parse(localStorage.getItem(this.config.storageKey) ?? "null");
			this.layoutTree = this.isLayoutNode(stored) ? stored : this.config.initialTree();
		} catch {
			this.layoutTree = this.config.initialTree();
		}

		this.ready = true;
	}

	save() {
		if (!this.maximized) localStorage.setItem(this.config.storageKey, JSON.stringify(this.tree));
	}

	private isWindowKey(value: unknown): value is K {
		return (this.config.keys as readonly unknown[]).includes(value);
	}

	private isLayoutNode(value: unknown): value is LayoutNode<K> {
		if (!value || typeof value !== "object") return false;
		const node = value as Record<string, unknown>;

		if (node.type === "leaf") return this.isWindowKey(node.key);
		return (
			node.type === "split" &&
			(node.dir === "row" || node.dir === "col") &&
			typeof node.ratio === "number" &&
			this.isLayoutNode(node.first) &&
			this.isLayoutNode(node.second)
		);
	}

	// --- tree geometry ---

	private cloneLayout(node: LayoutNode<K>): LayoutNode<K> {
		return node.type === "leaf"
			? leaf(node.key)
			: split(node.dir, node.ratio, this.cloneLayout(node.first), this.cloneLayout(node.second));
	}

	private minSize(node: LayoutNode<K>): { w: number; h: number } {
		if (node.type === "leaf") return this.config.min[node.key];

		const first = this.minSize(node.first);
		const second = this.minSize(node.second);
		return node.dir === "row"
			? { w: first.w + second.w + GAP, h: Math.max(first.h, second.h) }
			: { w: Math.max(first.w, second.w), h: first.h + second.h + GAP };
	}

	private layoutNode(node: LayoutNode<K>, rect: GhostBox, out: Record<K, GhostBox>) {
		if (node.type === "leaf") {
			out[node.key] = rect;
			return;
		}

		const firstMin = this.minSize(node.first);
		const secondMin = this.minSize(node.second);

		if (node.dir === "row") {
			const available = rect.w - GAP;
			const firstW = clampNumber(
				available * node.ratio,
				firstMin.w,
				Math.max(firstMin.w, available - secondMin.w),
			);
			const secondW = Math.max(secondMin.w, available - firstW);
			this.layoutNode(node.first, { x: rect.x, y: rect.y, w: firstW, h: rect.h }, out);
			this.layoutNode(
				node.second,
				{ x: rect.x + firstW + GAP, y: rect.y, w: secondW, h: rect.h },
				out,
			);
			return;
		}

		const available = rect.h - GAP;
		const firstH = clampNumber(
			available * node.ratio,
			firstMin.h,
			Math.max(firstMin.h, available - secondMin.h),
		);
		const secondH = Math.max(secondMin.h, available - firstH);
		this.layoutNode(node.first, { x: rect.x, y: rect.y, w: rect.w, h: firstH }, out);
		this.layoutNode(
			node.second,
			{ x: rect.x, y: rect.y + firstH + GAP, w: rect.w, h: secondH },
			out,
		);
	}

	private layoutBoxes(node: LayoutNode<K>, bounds: DOMRect): Record<K, GhostBox> {
		const out = {} as Record<K, GhostBox>;
		this.layoutNode(node, { x: 0, y: 0, w: bounds.width, h: bounds.height }, out);
		return out;
	}

	private applyLayout(node: LayoutNode<K>) {
		const bounds = this.gridEl?.getBoundingClientRect();
		if (!bounds || bounds.width < 900 || bounds.height < 420) return;

		const boxes = this.layoutBoxes(node, bounds);
		this.windows = Object.fromEntries(
			(Object.keys(this.windows) as K[]).map((key) => [
				key,
				{ ...this.windows[key], ...boxes[key] },
			]),
		) as Record<K, WindowBox>;
		this.lastGridSize = { w: bounds.width, h: bounds.height };
	}

	onViewportResize = () => {
		requestAnimationFrame(() => {
			const bounds = this.gridEl?.getBoundingClientRect();
			if (!bounds) return;

			// Mobile has a separate stacked layout; don't mutate desktop window state there.
			if (bounds.width < 900 || bounds.height < 420) return;

			if (!this.lastGridSize) {
				this.layoutWindows();
				return;
			}

			this.applyLayout(this.tree);
		});
	};

	// --- drag / dock ---

	private resetInteractionState(key: K) {
		if (this.moving === key) this.moving = null;
		if (this.resizing === key) this.resizing = null;
		this.dragStart = null;
		this.ghost = null;
		this.pendingTree = null;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
	}

	private windowAtPoint(clientX: number, clientY: number, except: K): K | null {
		const bounds = this.gridEl?.getBoundingClientRect();
		if (!bounds) return null;

		const x = clientX - bounds.left;
		const y = clientY - bounds.top;
		let hit: K | null = null;
		let z = -1;

		for (const [key, box] of Object.entries(this.windows) as [K, WindowBox][]) {
			if (key === except) continue;
			if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) continue;
			if (box.z > z) {
				hit = key;
				z = box.z;
			}
		}

		return hit;
	}

	private dropZone(box: WindowBox, clientX: number, clientY: number): DropZone {
		const bounds = this.gridEl?.getBoundingClientRect();
		if (!bounds) return "center";

		const x = (clientX - bounds.left - box.x) / box.w;
		const y = (clientY - bounds.top - box.y) / box.h;
		const edge = 0.28;

		if (x < edge) return "left";
		if (x > 1 - edge) return "right";
		if (y < edge) return "top";
		if (y > 1 - edge) return "bottom";
		return "center";
	}

	private zoneBox(box: GhostBox, zone: DropZone): GhostBox {
		if (zone === "left") return { ...box, w: box.w / 2 };
		if (zone === "right") return { ...box, x: box.x + box.w / 2, w: box.w / 2 };
		if (zone === "top") return { ...box, h: box.h / 2 };
		if (zone === "bottom") return { ...box, y: box.y + box.h / 2, h: box.h / 2 };
		return box;
	}

	private removeLeaf(node: LayoutNode<K>, key: K): LayoutNode<K> | null {
		if (node.type === "leaf") return node.key === key ? null : node;

		const first = this.removeLeaf(node.first, key);
		const second = this.removeLeaf(node.second, key);
		if (!first) return second;
		if (!second) return first;
		return split(node.dir, node.ratio, first, second);
	}

	private insertLeaf(
		node: LayoutNode<K>,
		target: K,
		inserted: K,
		zone: Exclude<DropZone, "center">,
	): LayoutNode<K> {
		if (node.type === "leaf") {
			if (node.key !== target) return node;

			const dir: SplitDir = zone === "left" || zone === "right" ? "row" : "col";
			const first = zone === "left" || zone === "top" ? leaf(inserted) : node;
			const second = zone === "left" || zone === "top" ? node : leaf(inserted);
			return split(dir, 0.5, first, second);
		}

		return split(
			node.dir,
			node.ratio,
			this.insertLeaf(node.first, target, inserted, zone),
			this.insertLeaf(node.second, target, inserted, zone),
		);
	}

	private swapLeafKeys(node: LayoutNode<K>, a: K, b: K): LayoutNode<K> {
		if (node.type === "leaf") {
			if (node.key === a) return leaf(b);
			if (node.key === b) return leaf(a);
			return node;
		}

		return split(node.dir, node.ratio, this.swapLeafKeys(node.first, a, b), this.swapLeafKeys(node.second, a, b));
	}

	private containsLeaf(node: LayoutNode<K>, key: K): boolean {
		return node.type === "leaf"
			? node.key === key
			: this.containsLeaf(node.first, key) || this.containsLeaf(node.second, key);
	}

	private swapHorizontalGroup(node: LayoutNode<K>, source: K, target: K): LayoutNode<K> | null {
		if (node.type === "leaf") return null;

		const sourceInFirst = this.containsLeaf(node.first, source);
		const targetInFirst = this.containsLeaf(node.first, target);

		if (sourceInFirst === targetInFirst) {
			const swappedChild = this.swapHorizontalGroup(
				sourceInFirst ? node.first : node.second,
				source,
				target,
			);
			if (!swappedChild) return null;

			return split(
				node.dir,
				node.ratio,
				sourceInFirst ? swappedChild : this.cloneLayout(node.first),
				sourceInFirst ? this.cloneLayout(node.second) : swappedChild,
			);
		}
		if (node.dir !== "row") return null;

		return split("row", 1 - node.ratio, this.cloneLayout(node.second), this.cloneLayout(node.first));
	}

	private dockTreeAfterDrop(source: K, target: K, zone: DropZone, dx = 0, dy = 0): LayoutNode<K> {
		if (zone === "center") {
			if (this.config.canSwapGroups?.(source, target, dx, dy)) {
				const swappedGroup = this.swapHorizontalGroup(this.tree, source, target);
				if (swappedGroup) return swappedGroup;
			}

			return this.swapLeafKeys(this.tree, source, target);
		}

		const withoutSource = this.removeLeaf(this.tree, source);
		return withoutSource ? this.insertLeaf(withoutSource, target, source, zone) : this.tree;
	}

	private previewDrag(key: K, event: InteractDragEvent) {
		const bounds = this.gridEl?.getBoundingClientRect();
		if (!bounds || !this.dragStart) return;

		const hit = this.windowAtPoint(event.clientX, event.clientY, key);
		const dx = event.clientX - this.dragStart.clientX;
		const dy = event.clientY - this.dragStart.clientY;
		this.pendingTree = null;

		if (hit) {
			const zone = this.dropZone(this.windows[hit], event.clientX, event.clientY);
			this.pendingTree = this.dockTreeAfterDrop(key, hit, zone, dx, dy);
			const boxes = this.layoutBoxes(this.pendingTree, bounds);
			this.ghost = zone === "center" ? boxes[key] : this.zoneBox(this.windows[hit], zone);
			return;
		}

		this.ghost = {
			...this.dragStart.box,
			x: clampNumber(this.dragStart.box.x + dx, 0, Math.max(0, bounds.width - this.dragStart.box.w)),
			y: clampNumber(this.dragStart.box.y + dy, 0, Math.max(0, bounds.height - this.dragStart.box.h)),
		};
	}

	private finishWindowDrag(key: K, event: InteractDragEvent) {
		this.previewDrag(key, event);

		if (this.pendingTree) this.layoutTree = this.pendingTree;
		this.applyLayout(this.tree);
		this.resetInteractionState(key);
	}

	// --- dock-aware edge resizing ---

	private findResizeTarget(
		node: LayoutNode<K>,
		key: K,
		dir: ResizeDir,
	): { node: LayoutNode<K> & { type: "split" }; dir: ResizeDir } | null {
		if (node.type === "leaf") return null;

		const inFirst = this.containsLeaf(node.first, key);
		const child = inFirst ? node.first : node.second;
		const inner = this.findResizeTarget(child, key, dir);
		if (inner) return inner;

		if (node.dir === "row" && ((dir === "e" && inFirst) || (dir === "w" && !inFirst)))
			return { node, dir };
		if (node.dir === "col" && ((dir === "s" && inFirst) || (dir === "n" && !inFirst)))
			return { node, dir };

		return null;
	}

	private resizeDelta(event: InteractResizeEvent, dir: ResizeDir): number {
		if (dir === "e") return event.deltaRect.right;
		if (dir === "w") return event.deltaRect.left;
		if (dir === "s") return event.deltaRect.bottom;
		return event.deltaRect.top;
	}

	private adjustResize(node: LayoutNode<K>, key: K, dir: ResizeDir, delta: number): LayoutNode<K> {
		if (node.type === "leaf") return node;

		const firstHas = this.containsLeaf(node.first, key);
		const secondHas = this.containsLeaf(node.second, key);
		let first = firstHas ? this.adjustResize(node.first, key, dir, delta) : node.first;
		let second = secondHas ? this.adjustResize(node.second, key, dir, delta) : node.second;
		let ratio = node.ratio;
		const target = this.findResizeTarget(node, key, dir);

		if (target?.node === node) {
			const box = this.windows[key];
			const span = node.dir === "row" ? Math.max(1, box.w + GAP) : Math.max(1, box.h + GAP);
			ratio = clampNumber(ratio + delta / span, 0.05, 0.95);
			first = node.first;
			second = node.second;
		}

		return split(node.dir, ratio, first, second);
	}

	private previewDockResize(key: K, event: InteractResizeEvent) {
		const bounds = this.gridEl?.getBoundingClientRect();
		if (!bounds) return;

		const dir = event.edges.right ? "e" : event.edges.left ? "w" : event.edges.bottom ? "s" : "n";
		const delta = this.resizeDelta(event, dir);
		this.pendingTree = this.adjustResize(this.pendingTree ?? this.tree, key, dir, delta);
		this.ghost = this.layoutBoxes(this.pendingTree, bounds)[key];
	}

	private finishDockResize(key: K) {
		if (this.pendingTree) {
			this.layoutTree = this.pendingTree;
			this.applyLayout(this.tree);
		}
		this.resetInteractionState(key);
	}

	// --- keyboard docking ---

	private nearestWindow(key: K, dir: ResizeDir): K | null {
		const box = this.windows[key];
		const cx = box.x + box.w / 2;
		const cy = box.y + box.h / 2;
		let best: K | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;

		for (const [otherKey, other] of Object.entries(this.windows) as [K, WindowBox][]) {
			if (otherKey === key) continue;
			const ox = other.x + other.w / 2;
			const oy = other.y + other.h / 2;
			const inDirection =
				(dir === "w" && ox < cx) ||
				(dir === "e" && ox > cx) ||
				(dir === "n" && oy < cy) ||
				(dir === "s" && oy > cy);
			if (!inDirection) continue;

			const distance = Math.hypot(ox - cx, oy - cy);
			if (distance < bestDistance) {
				best = otherKey;
				bestDistance = distance;
			}
		}

		return best;
	}

	keyboardMove = (dir: ResizeDir, splitMode: boolean) => {
		const activeKey = this.active;
		if (!activeKey) return;

		const target = this.nearestWindow(activeKey, dir);
		if (!target) return;

		const zone = dir === "w" ? "left" : dir === "e" ? "right" : dir === "n" ? "top" : "bottom";
		this.layoutTree = splitMode
			? this.dockTreeAfterDrop(activeKey, target, zone)
			: this.swapLeafKeys(this.tree, activeKey, target);
		this.applyLayout(this.tree);
	};

	// --- the svelte action wiring interact.js onto a window element ---

	interact = (node: HTMLElement, key: K) => {
		let currentKey = key;
		let interactable: Interactable | null = null;
		let destroyed = false;

		void import("interactjs").then(({ default: interact }) => {
			if (destroyed) return;

			interactable = (interact(node) as Interactable)
				.draggable({
					allowFrom: ".drag-head",
					ignoreFrom: "button,a,input,textarea,select,.resize-handle",
					listeners: {
						start: (event: InteractDragEvent) => {
							this.focus(currentKey);
							this.dragStart = {
								key: currentKey,
								box: { ...this.windows[currentKey] },
								clientX: event.clientX,
								clientY: event.clientY,
							};
							this.ghost = { ...this.windows[currentKey] };
							this.moving = currentKey;
							document.body.style.cursor = "grabbing";
							document.body.style.userSelect = "none";
						},
						move: (event: InteractDragEvent) => {
							this.previewDrag(currentKey, event);
						},
						end: (event: InteractDragEvent) => this.finishWindowDrag(currentKey, event),
					},
				})
				.resizable({
					edges: {
						left: ".resize-w",
						right: ".resize-e",
						top: ".resize-n",
						bottom: ".resize-s",
					},
					listeners: {
						start: () => {
							this.focus(currentKey);
							this.resizing = currentKey;
							document.body.style.userSelect = "none";
						},
						move: (event: InteractResizeEvent) => {
							this.previewDockResize(currentKey, event);
						},
						end: () => this.finishDockResize(currentKey),
					},
				});
		});

		return {
			update: (nextKey: K) => {
				currentKey = nextKey;
			},
			destroy: () => {
				destroyed = true;
				interactable?.unset();
				this.resetInteractionState(currentKey);
			},
		};
	};
}
