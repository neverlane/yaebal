import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Api, Context } from "@yaebal/core";
import { Composer } from "@yaebal/core";
import { createTestEnv } from "@yaebal/test";
import {
	createFiles,
	type FilesControl,
	FilesError,
	type FilesOptions,
	files,
	resolveFileId,
	type TelegramFile,
} from "./index.js";

// ---- unit-level fakes -------------------------------------------------------------------

interface RecordedCall {
	method: string;
	params?: Record<string, unknown>;
	options?: { signal?: AbortSignal };
}

/** minimal structural Api: records calls, answers `getFile`, builds classic file URLs. */
function fakeApi(file: Partial<TelegramFile> = {}) {
	const calls: RecordedCall[] = [];
	const api = {
		call: async (
			method: string,
			params?: Record<string, unknown>,
			options?: { signal?: AbortSignal },
		) => {
			calls.push({ method, params, options });
			return { file_id: "FID", file_unique_id: "UID", ...file };
		},
		fileUrl: (p: string) => `https://api.telegram.org/file/botTOKEN/${p}`,
	} as unknown as Api;

	return { api, calls };
}

/** capturing fetch: records url + init, replies with the given body/status. */
function fakeFetch(reply: () => Response) {
	const seen: { url: string; signal?: AbortSignal | null }[] = [];
	const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
		seen.push({ url: String(input), signal: init?.signal });
		return reply();
	}) as typeof fetch;

	return { fetchImpl, seen };
}

const control = (file: Partial<TelegramFile>, options: FilesOptions = {}) => {
	const { api, calls } = fakeApi(file);
	return { files: createFiles(api, options), calls };
};

// ---- input resolution -------------------------------------------------------------------

test("resolveFileId accepts a string, an object, and a size array (largest wins)", () => {
	assert.equal(resolveFileId("ABC"), "ABC");
	assert.equal(resolveFileId({ file_id: "DOC" }), "DOC");
	assert.equal(resolveFileId([{ file_id: "small" }, { file_id: "big" }]), "big");
});

test("resolveFileId throws FilesError(bad-input) on junk", () => {
	for (const junk of ["", [], {} as never]) {
		assert.throws(
			() => resolveFileId(junk as never),
			(e: unknown) => e instanceof FilesError && e.reason === "bad-input",
		);
	}
});

// ---- info / url -------------------------------------------------------------------------

test("info returns full getFile metadata, even without a file_path", async () => {
	const { files, calls } = control({ file_size: 42 });

	const info = await files.info({ file_id: "DOC" });

	assert.deepEqual(calls, [
		{ method: "getFile", params: { file_id: "DOC" }, options: { signal: undefined } },
	]);
	assert.equal(info.file_size, 42);
	assert.equal(info.file_unique_id, "UID");
});

test("url resolves a file_id to the classic download URL", async () => {
	const { files } = control({ file_path: "photos/x.jpg" });

	assert.equal(await files.url("ABC"), "https://api.telegram.org/file/botTOKEN/photos/x.jpg");
});

test("url throws FilesError(no-file-path) when getFile has no file_path", async () => {
	const { files } = control({});

	await assert.rejects(
		files.url("ABC"),
		(e: unknown) => e instanceof FilesError && e.reason === "no-file-path",
	);
});

// ---- download: readers ------------------------------------------------------------------

test("download fetches the resolved URL and exposes every reader", async () => {
	const payload = () => new Response(new Uint8Array([104, 105])); // "hi"

	for (const read of [
		async (dl: ReturnType<FilesControl["download"]>) => [...(await dl.bytes())],
		async (dl: ReturnType<FilesControl["download"]>) => [...new Uint8Array(await dl.arrayBuffer())],
		async (dl: ReturnType<FilesControl["download"]>) => [
			...new Uint8Array(await (await dl.blob()).arrayBuffer()),
		],
		async (dl: ReturnType<FilesControl["download"]>) => [...(await dl)], // PromiseLike
	]) {
		const { fetchImpl, seen } = fakeFetch(payload);
		const { files } = control({ file_path: "a.bin" }, { fetch: fetchImpl });

		assert.deepEqual(await read(files.download("ABC")), [104, 105]);
		assert.deepEqual(
			seen.map((s) => s.url),
			["https://api.telegram.org/file/botTOKEN/a.bin"],
		);
	}
});

test("download.text() and .json() decode the body", async () => {
	const make = (body: string) => {
		const { fetchImpl } = fakeFetch(() => new Response(body));
		return control({ file_path: "a.txt" }, { fetch: fetchImpl }).files;
	};

	assert.equal(await make("привет").download("A").text(), "привет");
	assert.deepEqual(await make('{"ok":true}').download("A").json<{ ok: boolean }>(), { ok: true });
});

test("download.stream() yields the raw body stream", async () => {
	const { fetchImpl } = fakeFetch(() => new Response(new Uint8Array([1, 2, 3])));
	const { files } = control({ file_path: "a.bin" }, { fetch: fetchImpl });

	const stream = await files.download("A").stream();
	const collected: number[] = [];
	for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>)
		collected.push(...chunk);

	assert.deepEqual(collected, [1, 2, 3]);
});

test("the handle is lazy and memoizes getFile: one api call for info + url + bytes", async () => {
	const { fetchImpl } = fakeFetch(() => new Response(new Uint8Array([7])));
	const { api, calls } = fakeApi({ file_path: "a.bin", file_size: 1 });
	const dl = createFiles(api, { fetch: fetchImpl }).download("ABC");

	assert.equal(calls.length, 0); // nothing fetched yet

	assert.equal((await dl.info()).file_size, 1);
	assert.ok((await dl.url()).endsWith("/a.bin"));
	assert.deepEqual([...(await dl.bytes())], [7]);

	assert.equal(calls.length, 1); // getFile exactly once
});

test("the body is single-use, like a Response", async () => {
	const { fetchImpl } = fakeFetch(() => new Response("x"));
	const { files } = control({ file_path: "a.txt" }, { fetch: fetchImpl });

	const dl = files.download("A");
	await dl.text();
	await assert.rejects(dl.bytes());
});

// ---- download: failures -----------------------------------------------------------------

test("a non-ok response throws FilesError(download-failed) and cancels the body", async () => {
	let cancelled = false;
	const body = new ReadableStream<Uint8Array>({
		cancel() {
			cancelled = true;
		},
	});
	const { fetchImpl } = fakeFetch(() => new Response(body, { status: 404 }));
	const { files } = control({ file_path: "gone.bin" }, { fetch: fetchImpl });

	await assert.rejects(
		files.download("ABC").bytes(),
		(e: unknown) =>
			e instanceof FilesError &&
			e.reason === "download-failed" &&
			e.status === 404 &&
			/"FID"/.test(e.message),
	);
	assert.equal(cancelled, true);
});

test("an AbortSignal reaches both getFile and the byte fetch", async () => {
	const controller = new AbortController();
	const { fetchImpl, seen } = fakeFetch(() => new Response("x"));
	const { api, calls } = fakeApi({ file_path: "a.bin" });

	await createFiles(api, { fetch: fetchImpl })
		.download("ABC", { signal: controller.signal })
		.bytes();

	assert.equal(calls[0]?.options?.signal, controller.signal);
	assert.equal(seen[0]?.signal, controller.signal);
});

// ---- local Bot API server strategies ----------------------------------------------------

test("auto + absolute file_path + local.baseUrl → token-less rewrite URL", async () => {
	const { files } = control(
		{ file_path: "/var/lib/telegram-bot-api/documents/report.pdf" },
		{ local: { baseUrl: "https://files.example.com/" } },
	);

	assert.equal(await files.url("ABC"), "https://files.example.com/documents/report.pdf");
});

test("auto + absolute file_path without baseUrl → disk (url() explains itself)", async () => {
	const { files } = control({ file_path: "/var/lib/telegram-bot-api/documents/a.bin" });

	await assert.rejects(
		files.url("ABC"),
		(e: unknown) =>
			e instanceof FilesError && e.reason === "no-url" && /local\.baseUrl/.test(e.message),
	);
});

test("disk strategy reads through the dir → mount remap", async () => {
	const mount = await mkdtemp(join(tmpdir(), "yaebal-files-"));
	await writeFile(join(mount, "a.bin"), new Uint8Array([5, 6]));

	const { files } = control({ file_path: "/var/lib/telegram-bot-api/a.bin" }, { local: { mount } });

	assert.deepEqual([...(await files.download("ABC").bytes())], [5, 6]);
});

test("disk strategy streams from the filesystem", async () => {
	const mount = await mkdtemp(join(tmpdir(), "yaebal-files-"));
	await writeFile(join(mount, "s.bin"), new Uint8Array([9, 9, 9]));

	const { files } = control({ file_path: "/var/lib/telegram-bot-api/s.bin" }, { local: { mount } });

	const collected: number[] = [];
	for await (const chunk of (await files
		.download("A")
		.stream()) as unknown as AsyncIterable<Uint8Array>)
		collected.push(...chunk);

	assert.deepEqual(collected, [9, 9, 9]);
});

test('source: "rewrite" without local.baseUrl throws FilesError(config)', async () => {
	const { files } = control({ file_path: "x.bin" }, { source: "rewrite" });

	await assert.rejects(
		files.download("A").url(),
		(e: unknown) => e instanceof FilesError && e.reason === "config",
	);
});

test('source: "url" forces the classic URL even for absolute paths', async () => {
	const { files } = control({ file_path: "/srv/a.bin" }, { source: "url" });

	assert.equal(await files.url("A"), "https://api.telegram.org/file/botTOKEN//srv/a.bin");
});

test("a custom source function supplies the bytes (and has no URL)", async () => {
	const { files } = control(
		{ file_path: "whatever.bin" },
		{ source: async (file) => new TextEncoder().encode(file.file_id) },
	);

	const dl = files.download("A");
	assert.equal(new TextDecoder().decode(await dl.bytes()), "FID");
	await assert.rejects(
		files.download("A").url(),
		(e: unknown) => e instanceof FilesError && e.reason === "no-url",
	);
});

// ---- toFile ------------------------------------------------------------------------------

test("toFile streams a url download to disk and returns the path", async () => {
	const dir = await mkdtemp(join(tmpdir(), "yaebal-files-"));
	const target = join(dir, "out.bin");
	const { fetchImpl } = fakeFetch(() => new Response(new Uint8Array([1, 2, 3, 4])));
	const { files } = control({ file_path: "a.bin" }, { fetch: fetchImpl });

	assert.equal(await files.download("A").toFile(target), target);
	assert.deepEqual([...new Uint8Array(await readFile(target))], [1, 2, 3, 4]);
});

test("toFile copies a disk-sourced file without any transfer", async () => {
	const mount = await mkdtemp(join(tmpdir(), "yaebal-files-"));
	await writeFile(join(mount, "src.bin"), new Uint8Array([8]));
	const target = join(mount, "copy.bin");

	const { files } = control(
		{ file_path: "/var/lib/telegram-bot-api/src.bin" },
		{ local: { mount } },
	);

	assert.equal(await files.download("A").toFile(target), target);
	assert.deepEqual([...new Uint8Array(await readFile(target))], [8]);
});

// ---- plugin wiring -----------------------------------------------------------------------

test("plugin adds ctx.files and reuses one control per api client", async () => {
	const controls: FilesControl[] = [];

	const bot = new Composer<Context>().install(files()).use(async (ctx, next) => {
		controls.push((ctx as Context & { files: FilesControl }).files);
		return next();
	});

	const env = createTestEnv(bot);
	const user = env.createUser();

	await user.sendMessage("one");
	await user.sendMessage("two");

	assert.equal(controls.length, 2);
	assert.equal(controls[0], controls[1]); // same api → same cached control
});

test("plugin end-to-end: ctx.files.url goes through the env's getFile stub", async () => {
	let url = "";

	const bot = new Composer<Context>().install(files()).use(async (ctx, next) => {
		url = await (ctx as Context & { files: FilesControl }).files.url("DOC");
		return next();
	});

	const env = createTestEnv(bot);
	env.onApi("getFile", { file_id: "DOC", file_unique_id: "U", file_path: "documents/d.pdf" });

	await env.createUser().sendMessage("go");

	assert.equal(url, "https://example.invalid/file/documents/d.pdf");
	assert.equal(env.lastApiCall("getFile")?.params?.file_id, "DOC");
});
