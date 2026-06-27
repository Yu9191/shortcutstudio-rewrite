import assert from "node:assert";
import { describe, it } from "node:test";
import { Request, normalizeHeaders, normalizeMode, parseArgument, removeHeader, rewriteBody, setHeader } from "../src/process/Request.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("ShortcutStudio request module", () => {
	it("parses script arguments", () => {
		assert.deepStrictEqual(parseArgument("thinkingMode=on&searchWebMode=off"), {
			thinkingMode: "on",
			searchWebMode: "off",
		});
		assert.deepStrictEqual(parseArgument({ model: "GPTOSS120B" }), { model: "GPTOSS120B" });
	});

	it("normalizes on/off/auto values", () => {
		assert.strictEqual(normalizeMode("ON"), "on");
		assert.strictEqual(normalizeMode("false"), "off");
		assert.strictEqual(normalizeMode("auto"), "auto");
		assert.strictEqual(normalizeMode("unknown"), "");
	});

	it("rewrites model settings in JSON body", () => {
		const result = rewriteBody(
			JSON.stringify({
				thinkingMode: "auto",
				thinkingModeSelection: "auto",
				searchWebMode: "off",
				enableReasoning: true,
				reasoningEffort: "high",
				model: "old-model",
			}),
			{ thinkingMode: "off", searchWebMode: "ON", model: "GPTOSS120B" },
		);

		assert.strictEqual(result.changed, true);
		const body = JSON.parse(result.body);
		assert.strictEqual(body.thinkingModeSelection, "off");
		assert.strictEqual(body.thinkingMode, false);
		assert.strictEqual(body.enableReasoning, false);
		assert.strictEqual(body.reasoningEffort, "minimal");
		assert.strictEqual(body.searchWebMode, "on");
		assert.strictEqual(body.model, "GPTOSS120B");
	});

	it("handles header names case-insensitively", () => {
		const lowerHeaders = normalizeHeaders({ "x-device-installation-id": "old", "Content-Length": "1" });
		setHeader(lowerHeaders, "X-Device-Installation-ID", "new");
		removeHeader(lowerHeaders, "content-length");

		assert.strictEqual(lowerHeaders["x-device-installation-id"], "new");
		assert.strictEqual(lowerHeaders["X-Device-Installation-ID"], undefined);
		assert.strictEqual(lowerHeaders["Content-Length"], undefined);

		const standardHeaders = normalizeHeaders({ "X-Device-Installation-ID": "old" });
		setHeader(standardHeaders, "X-Device-Installation-ID", "new");
		assert.strictEqual(standardHeaders["X-Device-Installation-ID"], "new");
	});

	it("rewrites /generate request with a generated device id", async () => {
		globalThis.$argument = `thinkingMode=on&searchWebMode=off&deviceIdStorageKey=test.${Date.now()}`;
		const request = {
			url: "https://api.shortcutstudio.app/generate",
			headers: { "Content-Type": "application/json", "Content-Length": "10" },
			body: JSON.stringify({ prompt: "hi" }),
		};

		const result = await Request(request);
		const id = result.$request.headers["X-Device-Installation-ID"];

		assert.match(id, uuidPattern);
		assert.strictEqual(result.$request.headers["Content-Length"], undefined);
		assert.strictEqual(JSON.parse(result.$request.body).thinkingMode, true);
	});
	it("rewrites /users/me/limits request header without body", async () => {
		globalThis.$argument = `deviceIdStorageKey=limits.${Date.now()}`;
		const request = {
			url: "https://api.shortcutstudio.app/users/me/limits",
			headers: { "x-device-installation-id": "old" },
		};

		const result = await Request(request);

		assert.match(result.$request.headers["x-device-installation-id"], uuidPattern);
		assert.strictEqual(result.$request.headers["X-Device-Installation-ID"], undefined);
		assert.strictEqual(result.$request.body, undefined);
	});

	it("leaves /sign unchanged by default", async () => {
		globalThis.$argument = `deviceIdStorageKey=sign.off.${Date.now()}`;
		const request = {
			url: "https://api.shortcutstudio.app/sign",
			headers: { "X-Device-Installation-ID": "old" },
			body: "binary-body",
		};

		const result = await Request(request);

		assert.strictEqual(result.$request.headers["X-Device-Installation-ID"], "old");
		assert.strictEqual(result.$request.body, "binary-body");
	});

	it("rewrites /sign device header when enabled", async () => {
		globalThis.$argument = `signRewrite=on&deviceIdStorageKey=sign.on.${Date.now()}`;
		const request = {
			url: "https://api.shortcutstudio.app/sign",
			headers: { "x-device-installation-id": "old", "Content-Length": "10" },
			body: "binary-body",
		};

		const result = await Request(request);

		assert.match(result.$request.headers["x-device-installation-id"], uuidPattern);
		assert.strictEqual(result.$request.headers["Content-Length"], "10");
		assert.strictEqual(result.$request.body, "binary-body");
	});

});
