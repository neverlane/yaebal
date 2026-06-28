export interface Project {
	id: string;
	name: string;
	code: string;
}

export interface Token {
	id: string;
	label: string;
	token: string;
}

const PKEY = "yaebal.pg.projects";
const TKEY = "yaebal.pg.tokens";

const has = (): boolean => typeof localStorage !== "undefined";
const read = <T>(key: string): T[] => {
	if (!has()) return [];
	try {
		const v = JSON.parse(localStorage.getItem(key) ?? "[]");
		return Array.isArray(v) ? (v as T[]) : [];
	} catch {
		return [];
	}
};

const write = (key: string, v: unknown): void => {
	if (has()) localStorage.setItem(key, JSON.stringify(v));
};

let counter = 0;
const uid = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const loadProjects = (): Project[] => read<Project>(PKEY);
export const saveProjects = (p: Project[]): void => write(PKEY, p);
export const newProject = (name: string, code: string): Project => ({ id: uid(), name, code });

export const loadTokens = (): Token[] => read<Token>(TKEY);
export const saveTokens = (t: Token[]): void => write(TKEY, t);
export const newToken = (label: string, token: string): Token => ({ id: uid(), label, token });

const AKEY = "yaebal.pg.activeToken";
export const loadActiveToken = (): string => (has() ? (localStorage.getItem(AKEY) ?? "") : "");
export const saveActiveToken = (id: string): void => {
	if (has()) localStorage.setItem(AKEY, id);
};
