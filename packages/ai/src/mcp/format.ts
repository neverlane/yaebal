import type { ApiMethod, ApiObject } from "./data.js";

interface TypeNode {
	type?: string;
	reference?: string;
	array?: TypeNode;
	any_of?: TypeNode[];
	default?: unknown;
	enumeration?: unknown[];
}

/** render a schema type node the way the bot api docs would say it. */
export function typeName(node: unknown): string {
	const t = node as TypeNode | undefined;
	if (t === undefined || t.type === undefined) return "unknown";
	switch (t.type) {
		case "reference":
			return t.reference ?? "unknown";
		case "array":
			return `Array of ${typeName(t.array)}`;
		case "any_of":
			return (t.any_of ?? []).map(typeName).join(" | ");
		case "bool":
			return "Boolean";
		case "integer":
			return "Integer";
		case "float":
			return "Float";
		case "string":
			return t.enumeration !== undefined
				? t.enumeration.map((v) => `"${v}"`).join(" | ")
				: "String";
		default:
			return t.type;
	}
}

export function formatMethod(method: ApiMethod): string {
	const lines: string[] = [
		`# ${method.name}`,
		"",
		method.description,
		"",
		`returns: ${typeName(method.return_type)}`,
	];

	const args = method.arguments ?? [];
	if (args.length > 0) {
		lines.push("", "| parameter | type | required | description |", "| --- | --- | --- | --- |");
		for (const arg of args) {
			const description = arg.description.replaceAll("\n", " ");
			lines.push(
				`| ${arg.name} | ${typeName(arg)} | ${arg.required ? "yes" : "no"} | ${description} |`,
			);
		}
	} else {
		lines.push("", "no parameters.");
	}

	if (method.documentation_link !== undefined) lines.push("", `docs: ${method.documentation_link}`);
	return lines.join("\n");
}

export function formatObject(object: ApiObject): string {
	const lines: string[] = [`# ${object.name}`, "", object.description];

	const properties = object.properties ?? [];
	if (properties.length > 0) {
		lines.push("", "| field | type | required | description |", "| --- | --- | --- | --- |");
		for (const property of properties) {
			const description = property.description.replaceAll("\n", " ");
			lines.push(
				`| ${property.name} | ${typeName(property)} | ${property.required === true ? "yes" : "no"} | ${description} |`,
			);
		}
	}
	if (object.any_of !== undefined && object.any_of.length > 0) {
		lines.push("", `one of: ${object.any_of.map(typeName).join(" | ")}`);
	}

	if (object.documentation_link !== undefined) lines.push("", `docs: ${object.documentation_link}`);
	return lines.join("\n");
}
