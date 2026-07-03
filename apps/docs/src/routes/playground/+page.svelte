<script lang="ts">
	import { onMount } from "svelte";

	import { type ChatMessage, renderChat } from "@yaebal/preview";

	import { base } from "$app/paths";
	import { page } from "$app/stores";

	import MonacoEditor from "$lib/MonacoEditor.svelte";
	import { EXAMPLES } from "$lib/examples";

	import type { Step } from "$lib/playground";
	import { type LiveSession, type LiveSettings, type LogLine, runUserCode, startLive } from "$lib/playground-run";
	import {
		type Project,
		type Token,
		clearTokens,
		loadActiveToken,
		loadProjects,
		loadTokens,
		newProject,
		newToken,
		saveActiveToken,
		saveProjects,
		saveTokens,
	} from "$lib/playground-store";

	let projects = $state<Project[]>([]);
	let activeId = $state("");
	let code = $state("");
	let editingProjectId = $state("");
	let editingProjectName = $state("");

	let tokens = $state<Token[]>([]);
	let activeTokenId = $state("");
	let showSettings = $state(false);
	let newLabel = $state("");
	let newTok = $state("");
	let apiRoot = $state("");
	let proxyUrl = $state("");
	let corsProxy = $state(false);
	let settingsReady = $state(false);

	let mode = $state<"mock" | "live">("mock");
	let steps = $state<Step[]>([]);
	let stepsText = $state("");
	let svg = $state("");
	let logs = $state<LogLine[]>([]);
	let error = $state("");
	let msg = $state("");
	let busy = $state(false);
	let copied = $state(false);

	let live = $state<LiveSession | null>(null);
	let liveMsgs = $state<ChatMessage[]>([]);

	const theme = "dark" as const;
	let chatBox = $state<HTMLDivElement>();

	let gridEl = $state<HTMLDivElement>();
	type WindowKey = "side" | "editor" | "result" | "state" | "console";
	type WindowBox = { x: number; y: number; w: number; h: number; z: number };
	type GhostBox = Omit<WindowBox, "z">;
	type ResizeDir = "n" | "e" | "s" | "w";
	type SplitDir = "row" | "col";
	type DropZone = "left" | "right" | "top" | "bottom" | "center";
	type LayoutNode =
		| { type: "leaf"; key: WindowKey }
		| { type: "split"; dir: SplitDir; ratio: number; first: LayoutNode; second: LayoutNode };
	const GAP = 10;
	let windows = $state<Record<WindowKey, WindowBox>>({
		side: { x: 0, y: 0, w: 260, h: 700, z: 1 },
		editor: { x: 272, y: 0, w: 640, h: 700, z: 2 },
		result: { x: 924, y: 0, w: 640, h: 390, z: 3 },
		state: { x: 924, y: 402, w: 308, h: 298, z: 4 },
		console: { x: 1244, y: 402, w: 320, h: 298, z: 5 },
	});
	let layoutTree = $state<LayoutNode>(initialLayoutTree());
	let nextZ = $state(6);
	let activeWindow = $state<WindowKey>("editor");
	let movingWindow = $state<WindowKey | null>(null);
	let resizingWindow = $state<WindowKey | null>(null);
	let lastGridSize = $state<{ w: number; h: number } | null>(null);
	let layoutGhost = $state<GhostBox | null>(null);
	let pendingTree = $state<LayoutNode | null>(null);
	let layoutReady = $state(false);
	let savedMaximizedTree = $state<LayoutNode | null>(null);
	let maximizedWindow = $state<WindowKey | null>(null);
	let windowMenu = $state<{ key: WindowKey; x: number; y: number } | null>(null);
	let layoutMenuOpen = $state(false);

	const chatW = () => Math.round(chatBox?.clientWidth || 360);
	const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
	const WINDOW_MIN = {
		side: { w: 200, h: 180 },
		editor: { w: 360, h: 260 },
		result: { w: 320, h: 240 },
		state: { w: 260, h: 220 },
		console: { w: 260, h: 130 },
	} satisfies Record<WindowKey, { w: number; h: number }>;

	function windowStyle(key: WindowKey): string {
		const w = windows[key];

		return `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;z-index:${w.z};`;
	}

	function focusWindow(key: WindowKey) {
		activeWindow = key;
		windows[key] = { ...windows[key], z: nextZ };
		nextZ += 1;
	}

	function resizeDirs(key: WindowKey): ResizeDir[] {
		return (["n", "e", "s", "w"] as ResizeDir[]).filter((dir) => Boolean(findResizeTarget(layoutTree, key, dir)));
	}

	function layoutWindows() {
		applyLayout(layoutTree);
	}

	function resetLayout() {
		layoutTree = initialLayoutTree();
		savedMaximizedTree = null;
		maximizedWindow = null;
		layoutMenuOpen = false;
		layoutWindows();
	}

	function applyPreset(kind: "default" | "editor" | "preview" | "debug") {
		if (kind === "default") layoutTree = initialLayoutTree();
		else if (kind === "editor") layoutTree = split("row", 0.13, leaf("side"), split("row", 0.72, leaf("editor"), split("col", 0.64, leaf("result"), split("row", 0.5, leaf("state"), leaf("console")))));
		else if (kind === "preview") layoutTree = split("row", 0.13, leaf("side"), split("row", 0.42, split("col", 0.68, leaf("result"), split("row", 0.5, leaf("state"), leaf("console"))), leaf("editor")));
		else layoutTree = split("row", 0.13, leaf("side"), split("col", 0.68, split("row", 0.5, leaf("editor"), leaf("result")), split("row", 0.5, leaf("state"), leaf("console"))));

		savedMaximizedTree = null;
		maximizedWindow = null;
		layoutMenuOpen = false;
		applyLayout(layoutTree);
	}

	function toggleMaximize(key: WindowKey) {
		if (maximizedWindow === key && savedMaximizedTree) {
			layoutTree = savedMaximizedTree;
			savedMaximizedTree = null;
			maximizedWindow = null;
			applyLayout(layoutTree);
			return;
		}

		if (!maximizedWindow) savedMaximizedTree = cloneLayout(layoutTree);
		layoutTree = leaf(key);
		maximizedWindow = key;
		applyLayout(layoutTree);
	}

	function initialLayoutTree(): LayoutNode {
		return split("row", 0.13,
			leaf("side"),
			split("row", 0.39,
				leaf("editor"),
				split("col", 0.68,
					leaf("result"),
					split("row", 0.5, leaf("state"), leaf("console")),
				),
			),
		);
	}

	function leaf(key: WindowKey): LayoutNode {
		return { type: "leaf", key };
	}

	function split(dir: SplitDir, ratio: number, first: LayoutNode, second: LayoutNode): LayoutNode {
		return { type: "split", dir, ratio, first, second };
	}

	function cloneLayout(node: LayoutNode): LayoutNode {
		return node.type === "leaf" ? leaf(node.key) : split(node.dir, node.ratio, cloneLayout(node.first), cloneLayout(node.second));
	}

	function isWindowKey(value: unknown): value is WindowKey {
		return value === "side" || value === "editor" || value === "result" || value === "state" || value === "console";
	}

	function isLayoutNode(value: unknown): value is LayoutNode {
		if (!value || typeof value !== "object") return false;
		const node = value as Record<string, unknown>;

		if (node.type === "leaf") return isWindowKey(node.key);
		return node.type === "split" &&
			(node.dir === "row" || node.dir === "col") &&
			typeof node.ratio === "number" &&
			isLayoutNode(node.first) &&
			isLayoutNode(node.second);
	}

	const LAYOUT_KEY = "yaebal.pg.layout";

	function loadLayoutTree(): LayoutNode {
		try {
			const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null");
			return isLayoutNode(stored) ? stored : initialLayoutTree();
		} catch {
			return initialLayoutTree();
		}
	}

	function saveLayoutTree() {
		if (!maximizedWindow) localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutTree));
	}

	function minSize(node: LayoutNode): { w: number; h: number } {
		if (node.type === "leaf") return WINDOW_MIN[node.key];

		const first = minSize(node.first);
		const second = minSize(node.second);
		return node.dir === "row"
			? { w: first.w + second.w + GAP, h: Math.max(first.h, second.h) }
			: { w: Math.max(first.w, second.w), h: first.h + second.h + GAP };
	}

	function layoutNode(node: LayoutNode, rect: GhostBox, out: Record<WindowKey, GhostBox>) {
		if (node.type === "leaf") {
			out[node.key] = rect;
			return;
		}

		const firstMin = minSize(node.first);
		const secondMin = minSize(node.second);

		if (node.dir === "row") {
			const available = rect.w - GAP;
			const firstW = clampNumber(available * node.ratio, firstMin.w, Math.max(firstMin.w, available - secondMin.w));
			const secondW = Math.max(secondMin.w, available - firstW);
			layoutNode(node.first, { x: rect.x, y: rect.y, w: firstW, h: rect.h }, out);
			layoutNode(node.second, { x: rect.x + firstW + GAP, y: rect.y, w: secondW, h: rect.h }, out);
			return;
		}

		const available = rect.h - GAP;
		const firstH = clampNumber(available * node.ratio, firstMin.h, Math.max(firstMin.h, available - secondMin.h));
		const secondH = Math.max(secondMin.h, available - firstH);
		layoutNode(node.first, { x: rect.x, y: rect.y, w: rect.w, h: firstH }, out);
		layoutNode(node.second, { x: rect.x, y: rect.y + firstH + GAP, w: rect.w, h: secondH }, out);
	}

	function layoutBoxes(node: LayoutNode, bounds: DOMRect): Record<WindowKey, GhostBox> {
		const out = {} as Record<WindowKey, GhostBox>;
		layoutNode(node, { x: 0, y: 0, w: bounds.width, h: bounds.height }, out);
		return out;
	}

	function applyLayout(node: LayoutNode) {
		const bounds = gridEl?.getBoundingClientRect();
		if (!bounds || bounds.width < 900 || bounds.height < 420) return;

		const boxes = layoutBoxes(node, bounds);
		windows = Object.fromEntries(
			(Object.keys(windows) as WindowKey[]).map((key) => [key, { ...windows[key], ...boxes[key] }]),
		) as Record<WindowKey, WindowBox>;
		lastGridSize = { w: bounds.width, h: bounds.height };
	}

	function onViewportResize() {
		requestAnimationFrame(() => {
			const bounds = gridEl?.getBoundingClientRect();
			if (!bounds) return;

			// Mobile has a separate stacked layout; don't mutate desktop window state there.
			if (bounds.width < 900 || bounds.height < 420) return;

			if (!lastGridSize) {
				layoutWindows();
				return;
			}

			applyLayout(layoutTree);
		});
	}

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
	type DragStart = { key: WindowKey; box: WindowBox; clientX: number; clientY: number };
	let dragStart: DragStart | null = null;

	function resetInteractionState(key: WindowKey) {
		if (movingWindow === key) movingWindow = null;
		if (resizingWindow === key) resizingWindow = null;
		dragStart = null;
		layoutGhost = null;
		pendingTree = null;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
	}

	function windowAtPoint(clientX: number, clientY: number, except: WindowKey): WindowKey | null {
		const bounds = gridEl?.getBoundingClientRect();
		if (!bounds) return null;

		const x = clientX - bounds.left;
		const y = clientY - bounds.top;
		let hit: WindowKey | null = null;
		let z = -1;

		for (const [key, box] of Object.entries(windows) as [WindowKey, WindowBox][]) {
			if (key === except) continue;
			if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) continue;
			if (box.z > z) {
				hit = key;
				z = box.z;
			}
		}

		return hit;
	}

	function dropZone(box: WindowBox, clientX: number, clientY: number): DropZone {
		const bounds = gridEl?.getBoundingClientRect();
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

	function zoneBox(box: GhostBox, zone: DropZone): GhostBox {
		if (zone === "left") return { ...box, w: box.w / 2 };
		if (zone === "right") return { ...box, x: box.x + box.w / 2, w: box.w / 2 };
		if (zone === "top") return { ...box, h: box.h / 2 };
		if (zone === "bottom") return { ...box, y: box.y + box.h / 2, h: box.h / 2 };
		return box;
	}

	function removeLeaf(node: LayoutNode, key: WindowKey): LayoutNode | null {
		if (node.type === "leaf") return node.key === key ? null : node;

		const first = removeLeaf(node.first, key);
		const second = removeLeaf(node.second, key);
		if (!first) return second;
		if (!second) return first;
		return split(node.dir, node.ratio, first, second);
	}

	function insertLeaf(node: LayoutNode, target: WindowKey, inserted: WindowKey, zone: Exclude<DropZone, "center">): LayoutNode {
		if (node.type === "leaf") {
			if (node.key !== target) return node;

			const dir: SplitDir = zone === "left" || zone === "right" ? "row" : "col";
			const first = zone === "left" || zone === "top" ? leaf(inserted) : node;
			const second = zone === "left" || zone === "top" ? node : leaf(inserted);
			return split(dir, 0.5, first, second);
		}

		return split(node.dir, node.ratio, insertLeaf(node.first, target, inserted, zone), insertLeaf(node.second, target, inserted, zone));
	}

	function swapLeafKeys(node: LayoutNode, a: WindowKey, b: WindowKey): LayoutNode {
		if (node.type === "leaf") {
			if (node.key === a) return leaf(b);
			if (node.key === b) return leaf(a);
			return node;
		}

		return split(node.dir, node.ratio, swapLeafKeys(node.first, a, b), swapLeafKeys(node.second, a, b));
	}

	function swapHorizontalGroup(node: LayoutNode, source: WindowKey, target: WindowKey): LayoutNode | null {
		if (node.type === "leaf") return null;

		const sourceInFirst = containsLeaf(node.first, source);
		const targetInFirst = containsLeaf(node.first, target);

		if (sourceInFirst === targetInFirst) {
			const swappedChild = swapHorizontalGroup(sourceInFirst ? node.first : node.second, source, target);
			if (!swappedChild) return null;

			return split(
				node.dir,
				node.ratio,
				sourceInFirst ? swappedChild : cloneLayout(node.first),
				sourceInFirst ? cloneLayout(node.second) : swappedChild,
			);
		}
		if (node.dir !== "row") return null;

		return split("row", 1 - node.ratio, cloneLayout(node.second), cloneLayout(node.first));
	}

	function canSwapHorizontalGroup(source: WindowKey, target: WindowKey, dx: number, dy: number): boolean {
		return source !== "side" &&
			target !== "side" &&
			(source === "editor" || target === "editor") &&
			Math.abs(dx) > Math.abs(dy) * 1.25;
	}

	function dockTreeAfterDrop(source: WindowKey, target: WindowKey, zone: DropZone, dx = 0, dy = 0): LayoutNode {
		if (zone === "center") {
			if (canSwapHorizontalGroup(source, target, dx, dy)) {
				const swappedGroup = swapHorizontalGroup(layoutTree, source, target);
				if (swappedGroup) return swappedGroup;
			}

			return swapLeafKeys(layoutTree, source, target);
		}

		const withoutSource = removeLeaf(layoutTree, source);
		return withoutSource ? insertLeaf(withoutSource, target, source, zone) : layoutTree;
	}

	function previewDrag(key: WindowKey, event: InteractDragEvent) {
		const bounds = gridEl?.getBoundingClientRect();
		if (!bounds || !dragStart) return;

		const hit = windowAtPoint(event.clientX, event.clientY, key);
		const dx = event.clientX - dragStart.clientX;
		const dy = event.clientY - dragStart.clientY;
		pendingTree = null;

		if (hit) {
			const zone = dropZone(windows[hit], event.clientX, event.clientY);
			pendingTree = dockTreeAfterDrop(key, hit, zone, dx, dy);
			const boxes = layoutBoxes(pendingTree, bounds);
			layoutGhost = zone === "center" ? boxes[key] : zoneBox(windows[hit], zone);
			return;
		}

		layoutGhost = {
			...dragStart.box,
			x: clampNumber(dragStart.box.x + dx, 0, Math.max(0, bounds.width - dragStart.box.w)),
			y: clampNumber(dragStart.box.y + dy, 0, Math.max(0, bounds.height - dragStart.box.h)),
		};
	}

	function finishWindowDrag(key: WindowKey, event: InteractDragEvent) {
		previewDrag(key, event);

		if (pendingTree) {
			layoutTree = pendingTree;
			applyLayout(layoutTree);
		} else applyLayout(layoutTree);

		resetInteractionState(key);
	}

	function containsLeaf(node: LayoutNode, key: WindowKey): boolean {
		return node.type === "leaf" ? node.key === key : containsLeaf(node.first, key) || containsLeaf(node.second, key);
	}

	type ResizeTarget = { node: LayoutNode & { type: "split" }; dir: ResizeDir };

	function findResizeTarget(node: LayoutNode, key: WindowKey, dir: ResizeDir): ResizeTarget | null {
		if (node.type === "leaf") return null;

		const inFirst = containsLeaf(node.first, key);
		const child = inFirst ? node.first : node.second;
		const inner = findResizeTarget(child, key, dir);
		if (inner) return inner;

		if (node.dir === "row" && ((dir === "e" && inFirst) || (dir === "w" && !inFirst))) return { node, dir };
		if (node.dir === "col" && ((dir === "s" && inFirst) || (dir === "n" && !inFirst))) return { node, dir };

		return null;
	}

	function resizeDelta(event: InteractResizeEvent, dir: ResizeDir): number {
		if (dir === "e") return event.deltaRect.right;
		if (dir === "w") return event.deltaRect.left;
		if (dir === "s") return event.deltaRect.bottom;
		return event.deltaRect.top;
	}

	function adjustResize(node: LayoutNode, key: WindowKey, dir: ResizeDir, delta: number): LayoutNode {
		if (node.type === "leaf") return node;

		const firstHas = containsLeaf(node.first, key);
		const secondHas = containsLeaf(node.second, key);
		let first = firstHas ? adjustResize(node.first, key, dir, delta) : node.first;
		let second = secondHas ? adjustResize(node.second, key, dir, delta) : node.second;
		let ratio = node.ratio;
		const target = findResizeTarget(node, key, dir);

		if (target?.node === node) {
			const box = windows[key];
			const span = node.dir === "row" ? Math.max(1, box.w + GAP) : Math.max(1, box.h + GAP);
			ratio = clampNumber(ratio + delta / span, 0.05, 0.95);
			first = node.first;
			second = node.second;
		}

		return split(node.dir, ratio, first, second);
	}

	function previewDockResize(key: WindowKey, event: InteractResizeEvent) {
		const bounds = gridEl?.getBoundingClientRect();
		if (!bounds) return;

		const dir = event.edges.right ? "e" : event.edges.left ? "w" : event.edges.bottom ? "s" : "n";
		const delta = resizeDelta(event, dir);
		pendingTree = adjustResize(pendingTree ?? layoutTree, key, dir, delta);
		layoutGhost = layoutBoxes(pendingTree, bounds)[key];
	}

	function finishDockResize(key: WindowKey) {
		if (pendingTree) {
			layoutTree = pendingTree;
			applyLayout(layoutTree);
		}
		resetInteractionState(key);
	}

	function nearestWindow(key: WindowKey, dir: ResizeDir): WindowKey | null {
		const box = windows[key];
		const cx = box.x + box.w / 2;
		const cy = box.y + box.h / 2;
		let best: WindowKey | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;

		for (const [otherKey, other] of Object.entries(windows) as [WindowKey, WindowBox][]) {
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

	function keyboardMove(dir: ResizeDir, splitMode: boolean) {
		const target = nearestWindow(activeWindow, dir);
		if (!target) return;

		const zone = dir === "w" ? "left" : dir === "e" ? "right" : dir === "n" ? "top" : "bottom";
		layoutTree = splitMode ? dockTreeAfterDrop(activeWindow, target, zone) : swapLeafKeys(layoutTree, activeWindow, target);
		applyLayout(layoutTree);
	}

	function openWindowMenu(key: WindowKey, e: MouseEvent) {
		e.preventDefault();
		focusWindow(key);
		windowMenu = { key, x: e.clientX, y: e.clientY };
	}

	function closeMenus() {
		windowMenu = null;
		layoutMenuOpen = false;
	}

	function windowInteract(node: HTMLElement, key: WindowKey) {
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
							focusWindow(currentKey);
							dragStart = { key: currentKey, box: { ...windows[currentKey] }, clientX: event.clientX, clientY: event.clientY };
							layoutGhost = { ...windows[currentKey] };
							movingWindow = currentKey;
							document.body.style.cursor = "grabbing";
							document.body.style.userSelect = "none";
						},
						move: (event: InteractDragEvent) => {
							previewDrag(currentKey, event);
						},
						end: (event: InteractDragEvent) => finishWindowDrag(currentKey, event),
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
							focusWindow(currentKey);
							resizingWindow = currentKey;
							document.body.style.userSelect = "none";
						},
						move: (event: InteractResizeEvent) => {
							previewDockResize(currentKey, event);
						},
						end: () => finishDockResize(currentKey),
					},
				});
		});

		return {
			update(nextKey: WindowKey) {
				currentKey = nextKey;
			},
			destroy() {
				destroyed = true;
				interactable?.unset();
				resetInteractionState(currentKey);
			},
		};
	}

	function formatStep(step: Step): string {
		if ("user" in step) return step.user;
		if ("system" in step) return `system:${step.system}`;

		return `click:${step.click}`;
	}

	function formatSteps(value: Step[]): string {
		return value.map(formatStep).join("\n");
	}

	function parseSteps(value: string): Step[] {
		return value
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				if (line.startsWith("system:")) return { system: line.slice("system:".length).trim() };
				if (!line.startsWith("click:")) return { user: line };

				const [click = ""] = line.slice("click:".length).split("|", 1);
				return { click: click.trim() };
			});
	}

	function setMockSteps(value: Step[]) {
		steps = value;
		stepsText = formatSteps(value);
	}

	async function encodeShare(text: string): Promise<string> {
		const bytes = new TextEncoder().encode(text);
		const compressed = "CompressionStream" in globalThis
			? new Uint8Array(
					await new Response(
						new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
					).arrayBuffer(),
				)
			: bytes;

		const binary = Array.from(compressed, (b) => String.fromCharCode(b)).join("");

		return `${compressed === bytes ? "p" : "g"}.${btoa(binary)}`;
	}

	async function decodeShare(value: string): Promise<string> {
		const [kind, payload] = value.includes(".") ? value.split(".", 2) : ["p", value];
		const bytes = Uint8Array.from(atob(decodeURIComponent(payload ?? "")), (c) => c.charCodeAt(0));

		if (kind === "g" && "DecompressionStream" in globalThis) {
			return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
		}

		return new TextDecoder().decode(bytes);
	}

	const EMPTY = `import { Bot } from "@yaebal/core";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", (ctx) => ctx.reply("hi"));

bot.start();`;

	onMount(() => {
		projects = loadProjects();
		tokens = loadTokens();
		activeTokenId = loadActiveToken();
		loadSettings();
		layoutTree = loadLayoutTree();
		layoutReady = true;

		const exId = $page.url.searchParams.get("ex");
		const ex = (exId && EXAMPLES[exId]) || EXAMPLES["getting-started"];

		if (!projects.length && ex) {
			projects = [newProject(ex.title, ex.code, ex.steps)];
			saveProjects(projects);
		}

		const first = projects[0];
		activeId = first?.id ?? "";
		code = first?.code ?? ex?.code ?? "";

		const shared = $page.url.searchParams.get("code");
		if (shared) {
			void decodeShare(shared)
				.then((decoded) => {
					code = decoded;
				})
				.catch(() => {
					/* malformed link — keep the example */
				});
		}

		setMockSteps(first?.steps ?? ex?.steps ?? []);
		requestAnimationFrame(() => {
			layoutWindows();
			runMock();
		});
		window.addEventListener("resize", onViewportResize);

		return () => window.removeEventListener("resize", onViewportResize);
	});

	$effect(() => {
		const p = projects.find((x) => x.id === activeId);

		if (p && (p.code !== code || JSON.stringify(p.steps ?? []) !== JSON.stringify(steps))) {
			p.code = code;
			p.steps = [...steps];
			saveProjects(projects);
		}
	});

	$effect(() => {
		if (settingsReady && typeof localStorage !== "undefined") saveSettings();
	});

	$effect(() => {
		if (layoutReady && typeof localStorage !== "undefined") saveLayoutTree();
	});

	async function runMock() {
		busy = true;

		const res = await runUserCode(code, steps, chatW(), theme);

		svg = res.svg;
		logs = res.logs;
		error = res.error ?? "";
		busy = false;
	}

	function renderLive() {
		svg = renderChat(liveMsgs, { theme, width: chatW() });
	}

	async function toggleLive() {
		if (live) {
			live.stop();
			live = null;
			logs = [...logs, { level: "log", text: "stopped." }];

			return;
		}

		const tok = tokens.find((t) => t.id === activeTokenId);
		if (!tok) {
			error = "select a bot token first";
			return;
		}

		error = "";
		liveMsgs = [];
		svg = "";
		logs = [];

		try {
			const liveSettings: LiveSettings = {
				apiRoot: apiRoot.trim() || undefined,
				proxyUrl: proxyUrl.trim() || undefined,
				corsProxy,
			};

			live = await startLive(
				code,
				tok.token,
				(m) => {
					liveMsgs = [...liveMsgs, m];
					renderLive();
				},
				(l) => {
					logs = [...logs, l];
				},
				liveSettings,
			);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function run() {
		if (mode === "mock") runMock();
		else toggleLive();
	}

	function send() {
		const t = msg.trim();
		if (!t || mode !== "mock") return;

		setMockSteps([...steps, { user: t }]);
		msg = "";

		runMock();
	}

	function applyMockState() {
		setMockSteps(parseSteps(stepsText));
		if (mode === "mock") runMock();
	}

	function clearMockState() {
		setMockSteps([]);
		if (mode === "mock") runMock();
	}

	function addProject() {
		const p = newProject("untitled", EMPTY, []);
		projects = [...projects, p];

		saveProjects(projects);
		switchProject(p.id);
	}

	function switchProject(id: string) {
		const p = projects.find((x) => x.id === id);
		if (!p) return;

		activeId = id;
		code = p.code;
		setMockSteps(p.steps ?? []);

		if (mode === "mock") runMock();
	}

	function startRenameProject(p: Project) {
		editingProjectId = p.id;
		editingProjectName = p.name;
	}

	function finishRenameProject() {
		const p = projects.find((x) => x.id === editingProjectId);
		const name = editingProjectName.trim();

		if (p && name) {
			p.name = name;
			projects = [...projects];
			saveProjects(projects);
		}

		editingProjectId = "";
		editingProjectName = "";
	}

	function cancelRenameProject() {
		editingProjectId = "";
		editingProjectName = "";
	}

	function renameKey(e: KeyboardEvent) {
		if (e.key === "Enter") finishRenameProject();
		else if (e.key === "Escape") cancelRenameProject();
	}

	function deleteProject(id: string) {
		projects = projects.filter((p) => p.id !== id);
		saveProjects(projects);

		if (activeId === id) switchProject(projects[0]?.id ?? "");
	}

	function addToken() {
		if (!newTok.trim()) return;

		const t = newToken(newLabel.trim() || "bot", newTok.trim());
		tokens = [...tokens, t];
		saveTokens(tokens);

		activeTokenId = t.id;
		saveActiveToken(t.id);

		newLabel = "";
		newTok = "";
	}

	function removeToken(id: string) {
		tokens = tokens.filter((t) => t.id !== id);
		saveTokens(tokens);

		if (activeTokenId === id) pickToken("");
	}

	function removeAllTokens() {
		tokens = [];
		activeTokenId = "";
		clearTokens();
	}

	function pickToken(id: string) {
		activeTokenId = id;
		saveActiveToken(id);
	}

	async function share() {
		const packed = await encodeShare(code);
		const url = `${location.origin}${base}/playground?code=${encodeURIComponent(packed)}`;

		if (url.length > 7000) {
			error = "share link is too large — copy the code instead";
			return;
		}

		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 1400);
		} catch {
			/* clipboard blocked */
		}
	}

	function isEditingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;

		return Boolean(target.closest("input,textarea,select,[contenteditable='true'],.monaco-editor,.editor"));
	}

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			run();
		}

		if (isEditingTarget(e.target)) return;

		if (e.altKey && e.key === "Enter") {
			e.preventDefault();
			toggleMaximize(activeWindow);
		}

		if (e.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
			e.preventDefault();
			const dir = e.key === "ArrowLeft" ? "w" : e.key === "ArrowRight" ? "e" : e.key === "ArrowUp" ? "n" : "s";
			keyboardMove(dir, e.shiftKey);
		}

		if (e.key === "Escape") closeMenus();
	}

	function goBack(e: MouseEvent) {
		if (typeof window !== "undefined" && window.history.length > 1) {
			e.preventDefault();
			window.history.back();
		}
	}

	const activeTokenLabel = $derived(tokens.find((t) => t.id === activeTokenId)?.label ?? "mock");

	const SETTINGS_KEY = "yaebal.pg.settings";

	function loadSettings() {
		try {
			const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
			apiRoot = typeof settings.apiRoot === "string" ? settings.apiRoot : "";
			proxyUrl = typeof settings.proxyUrl === "string" ? settings.proxyUrl : "";
			corsProxy = Boolean(settings.corsProxy);
		} catch {
			apiRoot = "";
			proxyUrl = "";
			corsProxy = false;
		}

		settingsReady = true;
	}

	function saveSettings() {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiRoot, proxyUrl, corsProxy }));
	}
</script>

<svelte:head>
	<title>playground — yaebal</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

<div class="pg">
	<header class="top">
		<div class="brand">
			<a class="home" href="{base}/docs/getting-started" aria-label="back to docs" onclick={goBack}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m15 18-6-6 6-6" />
				</svg>
			</a>
			<span class="logo unbounded">yaebal</span>
			<span class="chip">playground</span>
		</div>
		<div class="top-r">
			<span class="bot-pill mono">bot: {activeTokenLabel}</span>
			<div class="layout-picker">
				<button class="share" onclick={() => (layoutMenuOpen = !layoutMenuOpen)} title="layout presets">
					<span>layout</span>
				</button>
				{#if layoutMenuOpen}
					<div class="menu layout-menu">
						<button onclick={() => applyPreset("default")}>default</button>
						<button onclick={() => applyPreset("editor")}>editor focus</button>
						<button onclick={() => applyPreset("preview")}>preview focus</button>
						<button onclick={() => applyPreset("debug")}>debug</button>
					</div>
				{/if}
			</div>
			<button class="share" onclick={() => (showSettings = true)} title="playground settings">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
				<span>settings</span>
			</button>
			<button class="share" onclick={share}>
				{#if copied}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
					<span>link copied</span>
				{:else}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" /></svg>
					<span>share</span>
				{/if}
			</button>
			<span class="hint mono">⌘↵ run</span>
		</div>
	</header>

	<div class="grid" bind:this={gridEl}>
		<aside class="side window" class:active-window={activeWindow === "side"} class:moving={movingWindow === "side"} class:resizing={resizingWindow === "side"} style={windowStyle("side")} use:windowInteract={"side"} role="group" aria-label="projects window" tabindex="-1" onpointerdown={() => focusWindow("side")}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="side-h drag-head" ondblclick={() => toggleMaximize("side")} oncontextmenu={(e) => openWindowMenu("side", e)}>
				<span>work tree</span>
				<button class="mini" onclick={addProject} aria-label="new project">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
				</button>
			</div>
			<ul class="projects">
				{#each projects as p (p.id)}
					<li class:active={p.id === activeId}>
						{#if editingProjectId === p.id}
							<!-- svelte-ignore a11y_autofocus -->
							<input
								class="pname-input mono"
								bind:value={editingProjectName}
								autofocus
								onblur={finishRenameProject}
								onkeydown={renameKey}
								aria-label="project name"
							/>
						{:else}
							<button class="pname" onclick={() => switchProject(p.id)} ondblclick={() => startRenameProject(p)} title="double-click to rename">{p.name}</button>
						{/if}
						<button class="mini ghost" onclick={() => deleteProject(p.id)} aria-label="delete project">
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
						</button>
					</li>
				{/each}
			</ul>
			<p class="note work-note">projects stay local in this browser</p>
			{#each resizeDirs("side") as dir}
				<div class="resize-handle resize-{dir}" role="separator" aria-label={`resize projects ${dir}`}></div>
			{/each}
		</aside>

		<section class="pane window" class:active-window={activeWindow === "editor"} class:moving={movingWindow === "editor"} class:resizing={resizingWindow === "editor"} style={windowStyle("editor")} use:windowInteract={"editor"} role="group" aria-label="editor window" tabindex="-1" onpointerdown={() => focusWindow("editor")}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="bar drag-head" ondblclick={() => toggleMaximize("editor")} oncontextmenu={(e) => openWindowMenu("editor", e)}>
				<div class="seg">
					<button class:on={mode === "mock"} onclick={() => (mode = "mock")}>mock</button>
					<button class:on={mode === "live"} onclick={() => (mode = "live")}>live</button>
				</div>
				<button class="run" class:danger={!!live} onclick={run} disabled={busy}>
					{#if mode === "live" && live}
						<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
						<span>Stop</span>
					{:else if busy}
						<span class="spin" aria-hidden="true"></span>
						<span>running…</span>
					{:else}
						<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4.5v15l13-7.5-13-7.5Z" /></svg>
						<span>{mode === "live" ? "Start" : "Run"}</span>
					{/if}
				</button>
			</div>
			<div class="editor"><MonacoEditor bind:value={code} {theme} /></div>
			{#each resizeDirs("editor") as dir}
				<div class="resize-handle resize-{dir}" role="separator" aria-label={`resize editor ${dir}`}></div>
			{/each}
		</section>

		<section class="pane window" class:active-window={activeWindow === "result"} class:moving={movingWindow === "result"} class:resizing={resizingWindow === "result"} style={windowStyle("result")} use:windowInteract={"result"} role="group" aria-label="result window" tabindex="-1" onpointerdown={() => focusWindow("result")}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="bar drag-head" ondblclick={() => toggleMaximize("result")} oncontextmenu={(e) => openWindowMenu("result", e)}>
				<span class="label">result</span>
				{#if mode === "live" && live}<span class="dot"><span class="pulse" aria-hidden="true"></span>live</span>{/if}
			</div>
			<div class="chat" bind:this={chatBox}>
				{#if error}
					<pre class="err mono">{error}</pre>
				{:else if mode === "mock" && !steps.length}
					<div class="empty state-empty">
						<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></svg>
						<span class="mono">state is empty</span>
					</div>
				{:else if svg}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="chat-svg">{@html svg}</div>
				{:else}
					<div class="empty">
						<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
						<span class="mono">{mode === "live" ? "press start, then message your bot" : "run to see the conversation"}</span>
					</div>
				{/if}
			</div>
			{#if mode === "mock"}
				<div class="composer">
					<input class="msg mono" placeholder="message the bot…" bind:value={msg} onkeydown={(e) => e.key === "Enter" && send()} />
					<button class="send" onclick={send} disabled={busy} aria-label="send message">
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg>
					</button>
				</div>
			{/if}
			{#each resizeDirs("result") as dir}
				<div class="resize-handle resize-{dir}" role="separator" aria-label={`resize result ${dir}`}></div>
			{/each}
		</section>

		<section class="state-pane window" class:active-window={activeWindow === "state"} class:moving={movingWindow === "state"} class:resizing={resizingWindow === "state"} style={windowStyle("state")} use:windowInteract={"state"} role="group" aria-label="mock state window" tabindex="-1" onpointerdown={() => focusWindow("state")}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="bar drag-head" ondblclick={() => toggleMaximize("state")} oncontextmenu={(e) => openWindowMenu("state", e)}>
				<span class="label">state</span>
				<div class="state-tools">
					<div class="help-wrap">
						<button class="help-btn mono" aria-label="state help">?</button>
						<div class="state-tooltip mono" role="tooltip">
							<div><b>mock state</b> is replayed top to bottom on every run.</div>
							<div><span>/start</span> sends a user message.</div>
							<div><span>click:buy</span> presses an inline button by callback data.</div>
							<div><span>system: note</span> adds a visual note only.</div>
						</div>
					</div>
					<button class="cclear mono" onclick={clearMockState} disabled={!steps.length} aria-label="clear mock state">clear</button>
				</div>
			</div>
			<div class="state-box state-window-body">
				<textarea
					class="state-input mono"
					bind:value={stepsText}
					rows="6"
					spellcheck="false"
					aria-label="mock messages already sent"
					placeholder={'/start\nsystem: user opened pricing\nclick:buy'}
				></textarea>
				<div class="state-actions">
					<button class="add" onclick={applyMockState}>apply state</button>
					<button class="add ghosty" onclick={() => setMockSteps([...steps, { system: "checkpoint" }])}>+ system</button>
				</div>
				<p class="note">message line = incoming update · <span class="mono">click:buy</span> presses callback button · <span class="mono">system:...</span> adds a note</p>
			</div>
			{#each resizeDirs("state") as dir}
				<div class="resize-handle resize-{dir}" role="separator" aria-label={`resize state ${dir}`}></div>
			{/each}
		</section>

		<section class="console window" class:active-window={activeWindow === "console"} class:moving={movingWindow === "console"} class:resizing={resizingWindow === "console"} style={windowStyle("console")} use:windowInteract={"console"} role="group" aria-label="console window" tabindex="-1" onpointerdown={() => focusWindow("console")}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="console-bar drag-head" ondblclick={() => toggleMaximize("console")} oncontextmenu={(e) => openWindowMenu("console", e)}>
				<div class="cbar-l">
					<span class="ctitle">console</span>
					{#if logs.length}<span class="count mono">{logs.length}</span>{/if}
				</div>
				<button class="cclear mono" onclick={() => (logs = [])} disabled={!logs.length} aria-label="clear console">clear</button>
			</div>
			<div class="clog">
				{#if logs.length}
					{#each logs as l}
						<div class="line {l.level}">
							<span class="lv lv-{l.level}" aria-hidden="true"></span>
							<span class="ltext mono">{l.text}</span>
						</div>
					{/each}
				{:else}
					<div class="cempty mono">› console output appears here</div>
				{/if}
			</div>
			{#each resizeDirs("console") as dir}
				<div class="resize-handle resize-{dir}" role="separator" aria-label={`resize console ${dir}`}></div>
			{/each}
		</section>

		{#if layoutGhost}
			<div class="layout-ghost" style={`left:${layoutGhost.x}px;top:${layoutGhost.y}px;width:${layoutGhost.w}px;height:${layoutGhost.h}px;`}></div>
		{/if}
	</div>

	{#if windowMenu}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="menu-backdrop" onclick={closeMenus} oncontextmenu={(e) => { e.preventDefault(); closeMenus(); }}></div>
		<div class="menu window-menu" style={`left:${windowMenu.x}px;top:${windowMenu.y}px;`}>
			<button onclick={() => { toggleMaximize(windowMenu!.key); closeMenus(); }}>{maximizedWindow === windowMenu.key ? "restore" : "maximize"}</button>
			<button onclick={() => { keyboardMove("w", true); closeMenus(); }}>dock left</button>
			<button onclick={() => { keyboardMove("e", true); closeMenus(); }}>dock right</button>
			<button onclick={() => { keyboardMove("n", true); closeMenus(); }}>dock up</button>
			<button onclick={() => { keyboardMove("s", true); closeMenus(); }}>dock down</button>
			<button onclick={() => { resetLayout(); closeMenus(); }}>reset layout</button>
		</div>
	{/if}

	{#if showSettings}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-backdrop" role="presentation" onclick={() => (showSettings = false)}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="settings-modal" role="dialog" aria-modal="true" aria-label="playground settings" tabindex="-1" onclick={(e) => e.stopPropagation()}>
				<div class="settings-head">
					<div>
						<div class="settings-title">settings</div>
						<div class="settings-sub mono">live bot, api root, proxy/cors</div>
					</div>
					<button class="mini ghost" onclick={() => (showSettings = false)} aria-label="close settings">
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
					</button>
				</div>

				<div class="settings-grid">
					<div class="setting-card">
						<div class="setting-row-head">
							<span>saved bots</span>
							<button class="cclear mono" onclick={removeAllTokens} disabled={!tokens.length}>clear all</button>
						</div>
						<div class="token-list">
							<button class="bot-option" class:selected={!activeTokenId} onclick={() => pickToken("")}>
								<span class="bot-option-main mono">mock mode</span>
								<span class="bot-option-state">{!activeTokenId ? "enabled" : "select"}</span>
							</button>
							{#each tokens as t (t.id)}
								<div class="bot-option-row">
									<button class="bot-option" class:selected={activeTokenId === t.id} onclick={() => pickToken(t.id)}>
										<span class="bot-option-main mono">{t.label}</span>
										<span class="bot-option-state">{activeTokenId === t.id ? "enabled" : "select"}</span>
									</button>
									<button class="mini ghost" onclick={() => removeToken(t.id)} aria-label="remove token">
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
									</button>
								</div>
							{/each}
						</div>
					</div>

					<label class="setting-field">
						<span>bot label</span>
						<input class="ti mono" placeholder="production bot" bind:value={newLabel} />
					</label>
					<label class="setting-field">
						<span>bot token</span>
						<input class="ti mono" type="password" placeholder="123456:ABC-token" bind:value={newTok} />
					</label>
					<button class="add setting-wide" onclick={addToken}>add bot token</button>

					<label class="setting-field setting-wide">
						<span>Telegram API root</span>
						<input class="ti mono" placeholder="https://api.telegram.org" bind:value={apiRoot} />
					</label>
					<label class="setting-field setting-wide">
						<span>proxy / cors bridge</span>
						<input class="ti mono" placeholder="https://your-proxy.example/bot-api" bind:value={proxyUrl} />
					</label>
					<label class="toggle-row setting-wide">
						<input class="check-input" type="checkbox" bind:checked={corsProxy} />
						<span class="check-box" aria-hidden="true">
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
						</span>
						<span>route live Bot API calls through proxy/cors bridge when possible</span>
					</label>
				</div>
				<p class="note settings-note">Tokens are stored in sessionStorage for this tab. API/proxy settings stay in localStorage. Live code still runs locally in the browser.</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.pg {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 14px;
		color: var(--secondary);
		background: var(--primary);
		/* the whole playground reads as a code tool — use the site mono font */
		font-family: "JetBrains Mono", ui-monospace, monospace;
	}

	.pg :global(input),
	.pg :global(select),
	.pg :global(button),
	.pg :global(textarea) {
		font-family: inherit;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px;
		flex: none;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 11px;
	}

	.home {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		color: var(--gray);
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		transition: background 0.16s ease, color 0.16s ease;
	}

	.home:hover {
		color: var(--secondary);
		background: var(--button-hover);
	}

	.logo {
		font-size: 16px;
		font-weight: 600;
		color: var(--secondary);
	}

	.chip {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		color: var(--gray);
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		padding: 4px 10px;
		border-radius: 999px;
	}

	.top-r {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.share {
		font-size: 12px;
		font-weight: 500;
		padding: 6px 13px;
		border-radius: var(--border-radius);
		color: var(--button-text);
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		transition: background 0.16s ease;
	}

	.share:hover {
		background: var(--button-hover);
	}

	.hint {
		font-size: 11px;
		color: var(--gray);
	}

	.bot-pill {
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 11px;
		color: var(--gray);
		padding: 5px 9px;
		border-radius: 999px;
		background: var(--button);
		box-shadow: var(--button-box-shadow);
	}

	.grid {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}

	.window {
		position: absolute;
		min-width: 160px;
		box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);
		transition:
			left 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			top 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			width 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			height 0.18s cubic-bezier(0.2, 0.8, 0.2, 1),
			box-shadow 0.18s ease,
			transform 0.18s ease;
	}

	.window.active-window {
		box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 122, 255, 0.42);
	}

	.window.moving,
	.window.resizing {
		transition: none;
		box-shadow: 0 24px 58px rgba(0, 0, 0, 0.32);
		transform: scale(1.002);
	}

	.window.moving {
		opacity: 0.72;
	}

	.layout-ghost {
		position: absolute;
		z-index: 9999;
		border: 2px dashed var(--blue);
		border-radius: 16px;
		background: rgba(0, 122, 255, 0.08);
		box-shadow: 0 0 0 1px rgba(0, 122, 255, 0.18), 0 18px 48px rgba(0, 122, 255, 0.16);
		pointer-events: none;
		transition:
			left 0.08s ease,
			top 0.08s ease,
			width 0.08s ease,
			height 0.08s ease;
	}

	.layout-picker {
		position: relative;
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9998;
		background: transparent;
	}

	.menu {
		z-index: 10001;
		min-width: 150px;
		padding: 6px;
		border: 1px solid var(--code-stroke);
		border-radius: 12px;
		background: var(--code-bg);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
	}

	.layout-menu {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
	}

	.window-menu {
		position: fixed;
	}

	.menu button {
		width: 100%;
		display: block;
		padding: 8px 10px;
		border-radius: 8px;
		background: transparent;
		box-shadow: none;
		color: var(--secondary);
		font-size: 12px;
		text-align: left;
	}

	.menu button:hover {
		background: var(--button-hover);
	}

	.drag-head {
		cursor: grab;
		user-select: none;
		touch-action: none;
	}

	.drag-head:active {
		cursor: grabbing;
	}

	@media (max-width: 900px) {
		.pg {
			height: auto;
			min-height: 100dvh;
		}

		.grid {
			display: flex;
			flex-direction: column;
			gap: 10px;
			overflow: visible;
		}

		.window {
			position: static;
			width: auto !important;
			height: auto !important;
			min-width: 0;
			box-shadow: none;
			transition: none;
		}

		.side,
		.pane,
		.state-pane,
		.console {
			height: auto;
		}

		.resize-handle {
			display: none;
		}

		.editor {
			min-height: 360px;
		}

		.chat {
			max-height: 62dvh;
		}

		.console {
			min-height: 180px;
		}
	}

	.side,
	.pane,
	.state-pane,
	.console {
		min-height: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--code-bg);
		border: 1px solid var(--code-stroke);
		border-radius: var(--border-radius);
		overflow: hidden;
	}

	.side {
		padding: 10px;
		gap: 1px;
		overflow-y: auto;
	}

	.work-note {
		margin: 10px 6px 0;
	}

	.side-h {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 10px;
		color: var(--gray);
		text-transform: uppercase;
		letter-spacing: 0.6px;
		margin: 12px 6px 6px;
	}

	.side-h:first-child {
		margin-top: 2px;
	}

	.projects {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.projects li {
		display: flex;
		align-items: center;
		gap: 4px;
		border-radius: 12px;
		padding: 4px;
		transition: background 0.12s;
	}

	.projects li:hover {
		background: var(--button);
	}

	.projects li.active {
		background: var(--secondary);
	}

	.pname {
		flex: 1;
		min-width: 0;
		text-align: left;
		background: transparent;
		box-shadow: none;
		padding: 9px 4px 9px 8px;
		font-size: 13.5px;
		font-weight: 500;
		color: var(--secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pname-input {
		flex: 1;
		min-width: 0;
		padding: 9px 8px;
		border: 1px solid var(--blue);
		border-radius: 10px;
		background: var(--button);
		color: var(--secondary);
		font-size: 13.5px;
		font-weight: 600;
		outline: none;
	}

	.projects li.active .pname {
		color: var(--primary);
	}

	.projects li.active .mini.ghost {
		color: var(--primary);
		opacity: 0.85;
		background: rgba(0, 0, 0, 0.1);
	}

	.projects li.active .mini.ghost:hover {
		opacity: 1;
		background: rgba(0, 0, 0, 0.16);
	}

	.mini {
		width: 24px;
		height: 24px;
		padding: 0;
		font-size: 12px;
		background: transparent;
		box-shadow: none;
		color: var(--gray);
		border-radius: 7px;
		flex: none;
		transition: background 0.14s ease, color 0.14s ease;
	}

	.mini:hover {
		color: var(--secondary);
		background: var(--button-hover);
	}

	.mini.ghost {
		width: 26px;
		height: 26px;
		border-radius: 8px;
		background: rgba(127, 127, 127, 0.16);
	}

	.mini.ghost:hover {
		background: rgba(127, 127, 127, 0.28);
	}

	.mini-on {
		color: var(--secondary);
		background: var(--button);
	}

	.ti {
		width: 100%;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid var(--input-border);
		background: var(--button);
		color: var(--secondary);
		font-size: 12px;
		outline: none;
		transition: box-shadow 0.16s ease;
	}

	.ti:focus {
		outline: var(--focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.add {
		font-size: 12px;
		padding: 7px;
		border-radius: 8px;
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		color: var(--button-text);
	}

	.add:hover:not(:disabled) {
		background: var(--button-hover);
	}

	.add.ghosty {
		background: transparent;
		color: var(--gray);
		box-shadow: none;
		border: 1px solid var(--input-border);
	}

	.add:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.note {
		font-size: 10px;
		color: var(--gray);
		margin: 3px 2px 0;
		line-height: 1.45;
	}

	.state-box {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 0 2px 4px;
	}

	.state-window-body {
		flex: 1;
		min-height: 0;
		padding: 10px;
	}

	.state-input {
		width: 100%;
		flex: 1;
		min-height: 104px;
		resize: vertical;
		padding: 9px 10px;
		border-radius: 10px;
		border: 1px solid var(--input-border);
		background: var(--button);
		color: var(--secondary);
		font-size: 12px;
		line-height: 1.55;
		outline: none;
	}

	.state-input:focus {
		outline: var(--focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.state-actions {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px;
	}

	.state-window-body .state-input {
		resize: none;
	}

	.state-tools {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.help-wrap {
		position: relative;
	}

	.help-btn {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		padding: 0;
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		color: var(--gray);
		font-size: 12px;
		font-weight: 700;
	}

	.help-btn:hover {
		color: var(--secondary);
		background: var(--button-hover);
	}

	.state-tooltip {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		z-index: 40;
		width: 280px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--code-stroke);
		background: var(--primary);
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
		color: var(--gray);
		font-size: 11px;
		line-height: 1.5;
		opacity: 0;
		pointer-events: none;
		transform: translateY(-4px);
		transition: opacity 0.14s ease, transform 0.14s ease;
	}

	.state-tooltip span,
	.state-tooltip b {
		color: var(--secondary);
	}

	.help-wrap:hover .state-tooltip,
	.help-wrap:focus-within .state-tooltip {
		opacity: 1;
		transform: translateY(0);
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 8px 8px 14px;
		border-bottom: 1px solid var(--code-stroke);
		flex: none;
	}

	.label {
		font-size: 11px;
		color: var(--gray);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.dot {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--green);
	}

	.pulse {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--green);
		box-shadow: 0 0 0 0 rgba(48, 189, 27, 0.5);
		animation: pulse 1.6s ease-out infinite;
	}

	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(48, 189, 27, 0.45);
		}
		70% {
			box-shadow: 0 0 0 6px rgba(48, 189, 27, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(48, 189, 27, 0);
		}
	}

	.seg {
		display: inline-flex;
		gap: 2px;
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		border-radius: var(--border-radius);
		padding: 3.5px;
	}

	.seg button {
		font-size: 12px;
		padding: 5px 15px;
		border-radius: calc(var(--border-radius) - 3.5px);
		background: transparent;
		box-shadow: none;
		color: var(--gray);
		transition: background 0.16s ease, color 0.16s ease;
	}

	.seg button.on {
		background: var(--secondary);
		color: var(--primary);
	}

	.run {
		padding: 6px 17px;
		font-size: 12.5px;
		font-weight: 500;
		border-radius: var(--border-radius);
		color: var(--primary);
		background: var(--secondary);
		box-shadow: none;
		transition: opacity 0.16s ease;
	}

	.run:hover {
		opacity: 0.86;
	}

	.run:disabled {
		opacity: 0.5;
	}

	.run.danger {
		color: var(--white);
		background: var(--red);
	}

	.run .spin {
		width: 11px;
		height: 11px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: currentColor;
		border-radius: 999px;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.editor {
		flex: 1;
		min-height: 0;
	}

	.chat {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 16px;
		display: flex;
		flex-direction: column;
	}

	.chat-svg {
		animation: fade 0.25s ease;
	}

	.chat :global(svg) {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 14px;
	}

	@keyframes fade {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	.empty {
		margin: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 11px;
		color: var(--gray);
		font-size: 12px;
	}

	.empty svg {
		opacity: 0.4;
	}

	.state-empty {
		text-transform: lowercase;
	}

	.err {
		margin: 0;
		padding: 12px 14px;
		color: var(--red);
		font-size: 12.5px;
		white-space: pre-wrap;
		background: var(--button);
		border-radius: 10px;
	}

	.composer {
		flex: none;
		display: flex;
		gap: 8px;
		padding: 10px 12px;
		border-top: 1px solid var(--code-stroke);
	}

	.msg {
		flex: 1;
		min-width: 0;
		padding: 9px 12px;
		border-radius: 10px;
		background: var(--button);
		border: 1px solid var(--input-border);
		color: var(--secondary);
		font-size: 13px;
		outline: none;
	}

	.msg:focus {
		outline: var(--focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.send {
		width: 42px;
		flex: none;
		border-radius: 10px;
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		color: var(--secondary);
		font-size: 15px;
	}

	.send:hover {
		background: var(--button-hover);
	}

	.console {
		background: var(--primary);
	}

	.console-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 10px 6px 12px;
		border-bottom: 1px solid var(--code-stroke);
		flex: none;
	}

	.cbar-l {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.ctitle {
		font-size: 11px;
		font-weight: 600;
		color: var(--secondary);
	}

	.count {
		font-size: 10px;
		min-width: 16px;
		text-align: center;
		padding: 1px 5px;
		border-radius: 7px;
		background: var(--button);
		color: var(--gray);
	}

	.cclear {
		font-size: 11px;
		padding: 3px 9px;
		border-radius: 7px;
		background: transparent;
		box-shadow: none;
		color: var(--gray);
	}

	.cclear:hover:not(:disabled) {
		background: var(--button);
		color: var(--secondary);
	}

	.cclear:disabled {
		opacity: 0.4;
	}

	.clog {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 0;
	}

	.resize-handle {
		position: absolute;
		z-index: 20;
		touch-action: none;
		user-select: none;
		transition: background 0.12s ease;
	}

	.resize-handle:hover {
		background: rgba(0, 122, 255, 0.3);
	}

	.resize-e,
	.resize-w {
		top: 10px;
		bottom: 10px;
		width: 8px;
		cursor: ew-resize;
	}

	.resize-e {
		right: -4px;
	}

	.resize-w {
		left: -4px;
	}

	.resize-n,
	.resize-s {
		left: 10px;
		right: 10px;
		height: 8px;
		cursor: ns-resize;
	}

	.resize-n {
		top: -4px;
	}

	.resize-s {
		bottom: -4px;
	}

	.cempty {
		padding: 10px 14px;
		font-size: 12px;
		color: var(--gray);
		opacity: 0.6;
	}

	.line {
		display: flex;
		gap: 9px;
		align-items: flex-start;
		padding: 3px 14px 3px 10px;
		font-size: 12px;
		line-height: 1.55;
		border-bottom: 1px solid var(--code-stroke);
	}

	.line.warn {
		background: rgba(241, 179, 56, 0.06);
	}

	.line.error {
		background: rgba(237, 34, 54, 0.06);
	}

	.lv {
		flex: none;
		width: 3px;
		align-self: stretch;
		border-radius: 2px;
		background: transparent;
	}

	.lv-warn {
		background: var(--gold);
	}

	.lv-error {
		background: var(--red);
	}

	.ltext {
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--secondary);
	}

	.line.warn .ltext {
		color: var(--gold);
	}
	
	.line.error .ltext {
		color: var(--red);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10000;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(0, 0, 0, 0.58);
		backdrop-filter: blur(8px);
	}

	.settings-modal {
		width: min(680px, 100%);
		max-height: min(760px, calc(100dvh - 40px));
		overflow: auto;
		background: var(--code-bg);
		border: 1px solid var(--code-stroke);
		border-radius: 18px;
		box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
		padding: 16px;
	}

	.settings-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--code-stroke);
	}

	.settings-title {
		font-size: 15px;
		font-weight: 700;
		color: var(--secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.settings-sub {
		margin-top: 4px;
		font-size: 11px;
		color: var(--gray);
	}

	.settings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		padding-top: 14px;
	}

	.setting-field,
	.setting-card,
	.toggle-row {
		display: flex;
		flex-direction: column;
		gap: 7px;
		font-size: 11px;
		color: var(--gray);
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	.setting-card {
		grid-row: span 3;
		padding: 10px;
		border-radius: 12px;
		border: 1px solid var(--input-border);
		background: var(--button);
	}

	.setting-row-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
	}

	.setting-wide {
		grid-column: 1 / -1;
	}

	.token-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-transform: none;
		letter-spacing: 0;
	}

	.bot-option-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px;
		align-items: center;
	}

	.bot-option {
		min-width: 0;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 10px;
		border-radius: 10px;
		background: rgba(127, 127, 127, 0.12);
		box-shadow: none;
		color: var(--secondary);
		text-align: left;
	}

	.bot-option:hover {
		background: rgba(127, 127, 127, 0.2);
	}

	.bot-option.selected {
		background: var(--secondary);
		color: var(--primary);
	}

	.bot-option-main {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		font-weight: 600;
	}

	.bot-option-state {
		flex: none;
		font-size: 10px;
		color: currentColor;
		opacity: 0.65;
	}

	.settings-empty {
		padding: 10px 0;
		font-size: 11px;
		text-transform: none;
		letter-spacing: 0;
		color: var(--gray);
	}

	.toggle-row {
		position: relative;
		flex-direction: row;
		align-items: center;
		gap: 10px;
		text-transform: none;
		letter-spacing: 0;
		line-height: 1.35;
		padding: 10px;
		border-radius: 12px;
		border: 1px solid var(--input-border);
		background: var(--button);
		cursor: pointer;
	}

	.check-input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.check-box {
		flex: none;
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		border: 1px solid var(--input-border);
		background: var(--primary);
		color: var(--primary);
	}

	.check-box svg {
		opacity: 0;
		transform: scale(0.8);
		transition: opacity 0.12s ease, transform 0.12s ease;
	}

	.check-input:checked + .check-box {
		border-color: var(--secondary);
		background: var(--secondary);
	}

	.check-input:checked + .check-box svg {
		opacity: 1;
		transform: scale(1);
	}

	.check-input:focus-visible + .check-box {
		outline: var(--focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.settings-note {
		margin-top: 12px;
	}

	@media (max-width: 900px) {
		.pg {
			height: auto;
			min-height: 100dvh;
		}

		.grid {
			display: flex;
			flex-direction: column;
			gap: 10px;
			overflow: visible;
		}

		.window {
			position: static;
			width: auto !important;
			height: auto !important;
			min-width: 0;
			box-shadow: none;
			transition: none;
		}

		.side,
		.pane,
		.state-pane,
		.console {
			height: auto;
		}

		.resize-handle {
			display: none;
		}

		.editor {
			min-height: 360px;
		}

		.chat {
			max-height: 62dvh;
		}

		.console {
			min-height: 180px;
		}

		.settings-grid {
			grid-template-columns: 1fr;
		}

		.setting-card,
		.setting-wide {
			grid-column: auto;
			grid-row: auto;
		}
	}
</style>
