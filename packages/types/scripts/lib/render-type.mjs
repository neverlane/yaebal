// shared type-string rendering — used by generate.mjs (to emit src/telegram.ts) and by
// apps/docs' Bot API reference generator (to render the same types for display). side-effect
// free (unlike generate.mjs, which writes src/telegram.ts as soon as it's run), so it's safe
// to import from outside this package.

export const fieldType = (node) => {
	switch (node?.type) {
		case "integer":
		case "float":
			return "number";
		case "string":
			return Array.isArray(node.enum) ? node.enum.map((v) => JSON.stringify(v)).join(" | ") : "string";
		case "bool":
			return "boolean";
		case "reference":
			return node.reference;
		case "array": {
			const inner = fieldType(node.array);
			return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
		}
		case "any_of":
			return node.any_of.map(fieldType).join(" | ");
		default:
			return "unknown";
	}
};

export const pascal = (name) => name[0].toUpperCase() + name.slice(1);
