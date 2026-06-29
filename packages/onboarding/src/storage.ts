import type { OnboardingRecord, OnboardingStorage } from "./types.js";

export class MemoryOnboardingStorage implements OnboardingStorage {
	#map = new Map<string, OnboardingRecord>();

	get(key: string): OnboardingRecord | undefined {
		return this.#map.get(key);
	}

	set(key: string, value: OnboardingRecord): void {
		this.#map.set(key, value);
	}

	delete(key: string): void {
		this.#map.delete(key);
	}
}

export function memoryStorage(): OnboardingStorage {
	return new MemoryOnboardingStorage();
}
