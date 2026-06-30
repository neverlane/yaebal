import assert from "node:assert/strict";
import test from "node:test";
import { Composer, Context, type Middleware } from "@yaebal/core";
import { type FilesControl, files } from "./index.js";

const noop = async () => {};
const entry = <C extends Context>(c: Composer<C>) =>
	c.toMiddleware() as unknown as Middleware<Context>;

function fakeApi(filePath?: string) {
	const api = {
		call: (_method: string, _params: unknown) => Promise.resolve({ file_path: filePath }),
		fileUrl: (p: string) => `https://api.telegram.org/file/botTOKEN/${p}`,
	} as never;

	return api;
}

const ctxWith = (api: never) =>
	new Context({
		api,
		update: {
			update_id: 1,
			message: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
		} as never,
		updateType: "message",
	});

type Ctx = Context & { files: FilesControl };

test("fileLink resolves a file_id to its download url", async () => {
	let link = "";

	const c = new Composer<Context>().install(files()).use(async (ctx, next) => {
		link = await (ctx as Ctx).files.fileLink("ABC");
		return next();
	});

	await entry(c)(ctxWith(fakeApi("photos/x.jpg")), noop);
	assert.equal(link, "https://api.telegram.org/file/botTOKEN/photos/x.jpg");
});

test("fileLink throws when getFile has no file_path", async () => {
	const c = new Composer<Context>().install(files()).use(async (ctx) => {
		await assert.rejects((ctx as Ctx).files.fileLink("ABC"), /no file_path/);
	});

	await entry(c)(ctxWith(fakeApi(undefined)), noop);
});

test("download fetches the resolved url into bytes", async () => {
	const realFetch = globalThis.fetch;

	globalThis.fetch = (async () => ({
		ok: true,
		arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
	})) as never;

	try {
		let bytes: number[] = [];

		const c = new Composer<Context>().install(files()).use(async (ctx, next) => {
			bytes = [...(await (ctx as Ctx).files.download("ABC"))];
			return next();
		});

		await entry(c)(ctxWith(fakeApi("a.bin")), noop);
		assert.deepEqual(bytes, [1, 2, 3]);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test("download throws on a non-ok response (no silent error bytes)", async () => {
	const realFetch = globalThis.fetch;

	globalThis.fetch = (async () => ({
		ok: false,
		status: 404,
		arrayBuffer: async () => new ArrayBuffer(0),
	})) as never;

	try {
		const c = new Composer<Context>().install(files()).use(async (ctx) => {
			await assert.rejects((ctx as Ctx).files.download("ABC"), /download failed \(404\)/);
		});

		await entry(c)(ctxWith(fakeApi("a.bin")), noop);
	} finally {
		globalThis.fetch = realFetch;
	}
});
