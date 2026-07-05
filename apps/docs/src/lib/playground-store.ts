import type { Step } from "./playground";

export interface Project {
	id: string;
	name: string;
	code: string;
	steps?: Step[];
}

export interface Token {
	id: string;
	label: string;
	token: string;
}

const PKEY = "yaebal.pg.projects";
const TKEY = "yaebal.pg.tokens.session";
const AKEY = "yaebal.pg.activeToken.session";

const local = (): Storage | undefined => (typeof localStorage !== "undefined" ? localStorage : undefined);
const session = (): Storage | undefined =>
	typeof sessionStorage !== "undefined" ? sessionStorage : undefined;

const read = <T>(storage: Storage | undefined, key: string): T[] => {
	if (!storage) return [];
	
	try {
		const v = JSON.parse(storage.getItem(key) ?? "[]");
		return Array.isArray(v) ? (v as T[]) : [];
	} catch {
		return [];
	}
};

const write = (storage: Storage | undefined, key: string, v: unknown): void => {
	storage?.setItem(key, JSON.stringify(v));
};

let counter = 0;
const uid = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const loadProjects = (): Project[] => read<Project>(local(), PKEY);
export const saveProjects = (p: Project[]): void => write(local(), PKEY, p);
export const newProject = (name: string, code: string, steps: Project["steps"] = []): Project => ({
	id: uid(),
	name,
	code,
	steps,
});

export const loadTokens = (): Token[] => read<Token>(session(), TKEY);
export const saveTokens = (t: Token[]): void => write(session(), TKEY, t);
export const newToken = (label: string, token: string): Token => ({ id: uid(), label, token });
export const clearTokens = (): void => {
	session()?.removeItem(TKEY);
	session()?.removeItem(AKEY);
};

export const loadActiveToken = (): string => session()?.getItem(AKEY) ?? "";
export const saveActiveToken = (id: string): void => {
	session()?.setItem(AKEY, id);
};
