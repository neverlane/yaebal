<script lang="ts">
	import { theme } from "./theme.svelte";
</script>

<button class="toggle" onclick={() => theme.toggle()} aria-label="toggle theme">
	{#if theme.value === "dark"}
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
		</svg>
	{:else}
		<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	{/if}
</button>

<style>
	.toggle {
		width: 38px;
		height: 38px;
		padding: 0;
		border-radius: 12px;
		background: transparent;
		box-shadow: none;
		color: var(--secondary);
	}

	@media (hover: hover) {
		.toggle:hover {
			background: var(--button-hover);
		}
	}
</style>
