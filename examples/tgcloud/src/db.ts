import { db } from "sdk";
import { sql } from "sdk/db";
import { counters } from "./schema.js";

export interface Counter {
	chatId: number;
	seen: number;
	pings: number;
}

function isCounter(row: Partial<Counter>): row is Counter {
	return (
		typeof row.chatId === "number" && typeof row.seen === "number" && typeof row.pings === "number"
	);
}

/** insert the chat's row, or add to the columns named in `bump`, and return it. */
export async function bump(chatId: number, column: "seen" | "pings"): Promise<Counter> {
	const [row] = await db
		.insert(counters)
		.values({ chatId, seen: column === "seen" ? 1 : 0, pings: column === "pings" ? 1 : 0 })
		.onConflictDoUpdate({
			target: counters.chatId,
			set: { [column]: sql`${counters[column]} + 1` },
		})
		.returning()
		.run();
	if (!row || !isCounter(row)) throw new Error(`counter for chat ${chatId} was not written`);
	return row;
}
