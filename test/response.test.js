import assert from "node:assert";
import { describe, it } from "node:test";
import { Response } from "../src/process/Response.mjs";

const limitsPayload = {
	ok: true,
	limits: {
		messages: { allowed: false, current: 3, limit: 3, remaining: 0 },
		downloads: { allowed: true, current: 0, limit: 3, remaining: 3 },
		searches: { allowed: false, current: 0, limit: 0, remaining: 0 },
		uploads: { allowed: false, current: 0, limit: 0, remaining: 0 },
		marketplace_downloads: { allowed: true, current: 0, limit: 3, remaining: 3 },
		chat_input_chars: { current: 0, limit: 350, remaining: 350 },
	},
};

describe("ShortcutStudio response module", () => {
	it("leaves /users/me/limits response unchanged by default", async () => {
		globalThis.$argument = "";
		const response = {
			headers: { "Content-Length": "10" },
			body: JSON.stringify(limitsPayload),
		};

		const result = await Response({ url: "https://api.shortcutstudio.app/users/me/limits" }, response);

		assert.strictEqual(result, response);
		assert.strictEqual(JSON.parse(result.body).limits.messages.remaining, 0);
		assert.strictEqual(result.headers["Content-Length"], "10");
	});

	it("mocks visible limits when enabled", async () => {
		globalThis.$argument = "limitsMock=on&messagesLimit=88&downloadsLimit=77&searchesLimit=66&uploadsLimit=55&marketplaceDownloadsLimit=44&chatInputCharsLimit=3333";
		const response = {
			headers: { "content-length": "10" },
			body: JSON.stringify(limitsPayload),
		};

		const result = await Response({ url: "https://api.shortcutstudio.app/users/me/limits" }, response);
		const body = JSON.parse(result.body);

		assert.deepStrictEqual(body.limits.messages, { allowed: true, current: 0, limit: 88, remaining: 88 });
		assert.deepStrictEqual(body.limits.downloads, { allowed: true, current: 0, limit: 77, remaining: 77 });
		assert.deepStrictEqual(body.limits.searches, { allowed: true, current: 0, limit: 66, remaining: 66 });
		assert.deepStrictEqual(body.limits.uploads, { allowed: true, current: 0, limit: 55, remaining: 55 });
		assert.deepStrictEqual(body.limits.marketplace_downloads, { allowed: true, current: 0, limit: 44, remaining: 44 });
		assert.deepStrictEqual(body.limits.chat_input_chars, { allowed: true, current: 0, limit: 3333, remaining: 3333 });
		assert.strictEqual(result.headers["content-length"], undefined);
	});
});
