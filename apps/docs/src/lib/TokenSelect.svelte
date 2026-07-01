<script lang="ts">
	import { cubicOut } from "svelte/easing";

	export interface SelectOption {
		id: string;
		label: string;
	}

	let {
		options,
		value = $bindable(""),
		onchange,
	}: {
		options: SelectOption[];
		value?: string;
		onchange?: (id: string) => void;
	} = $props();

	let open = $state(false);
	let active = $state(0);
	let root = $state<HTMLDivElement>();
	let trigger = $state<HTMLButtonElement>();

	const current = $derived(options.find((o) => o.id === value) ?? options[0]);

	function popIn(_node: Element, { duration = 150 }: { duration?: number } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number) =>
				`opacity: ${t}; transform: scale(${0.95 + 0.05 * t}) translateY(${(1 - t) * -4}px);`,
		};
	}

	function toggle() {
		open = !open;
		if (open) active = Math.max(0, options.findIndex((o) => o.id === value));
	}

	function close() {
		open = false;
		trigger?.focus();
	}

	function pick(id: string) {
		value = id;
		onchange?.(id);
		close();
	}

	function onTriggerKeydown(e: KeyboardEvent) {
		if (open) return;
		if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			toggle();
		}
	}

	function onPanelKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			close();
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			active = Math.min(options.length - 1, active + 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			active = Math.max(0, active - 1);
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			const o = options[active];
			if (o) pick(o.id);
		} else if (e.key === "Tab") {
			close();
		}
	}

	function onDocClick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onclick={onDocClick} />

<div class="tsel" bind:this={root}>
	<button
		type="button"
		bind:this={trigger}
		class="trigger mono"
		onclick={toggle}
		onkeydown={onTriggerKeydown}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<span class="tlabel">{current?.label}</span>
		<svg
			class="chev"
			class:open
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.4"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</button>

	{#if open}
		<ul
			class="panel mono"
			role="listbox"
			tabindex="-1"
			transition:popIn
			onkeydown={onPanelKeydown}
		>
			{#each options as o, i (o.id)}
				<li role="presentation">
					<button
						type="button"
						class="opt"
						class:sel={o.id === value}
						class:hl={i === active}
						role="option"
						aria-selected={o.id === value}
						onclick={() => pick(o.id)}
						onmouseenter={() => (active = i)}
					>
						<span class="check" aria-hidden="true">
							{#if o.id === value}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M20 6 9 17l-5-5" />
								</svg>
							{/if}
						</span>
						<span class="olabel">{o.label}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tsel {
		position: relative;
	}

	.trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 9px 8px 10px;
		border-radius: 9px;
		background: var(--button);
		box-shadow: var(--button-box-shadow);
		border: 1px solid var(--input-border);
		color: var(--secondary);
		font-size: 12px;
		text-align: left;
		transition: background 0.14s ease, border-color 0.14s ease;
	}

	.trigger:hover {
		background: var(--button-hover);
	}

	.trigger[aria-expanded="true"] {
		border-color: var(--blue);
	}

	.tlabel {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chev {
		flex: none;
		color: var(--gray);
		transition: transform 0.18s ease;
	}

	.chev.open {
		transform: rotate(180deg);
	}

	.panel {
		position: absolute;
		z-index: 30;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		list-style: none;
		margin: 0;
		padding: 5px;
		max-height: 240px;
		overflow-y: auto;
		border-radius: 12px;
		background: var(--popup-bg);
		border: 1px solid var(--popup-stroke);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28), 0 0 0 1px var(--popover-glow);
		transform-origin: top;
		outline: none;
	}

	.opt {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 9px;
		border-radius: 8px;
		background: transparent;
		box-shadow: none;
		color: var(--secondary);
		font-size: 12px;
		text-align: left;
		transition: background 0.1s ease, color 0.1s ease;
	}

	.opt.hl {
		background: var(--button-hover);
	}

	.opt.sel {
		background: var(--blue);
		color: var(--white);
	}

	.opt.sel.hl {
		background: var(--blue);
		filter: brightness(1.08);
	}

	.check {
		flex: none;
		width: 12px;
		display: flex;
	}

	.olabel {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
