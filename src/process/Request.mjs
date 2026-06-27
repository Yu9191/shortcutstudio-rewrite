import { $argument, Console, Storage } from "@nsnanocat/util";

const MATCH_URL_RE = /^https:\/\/api\.shortcutstudio\.app\/(?:generate|users\/me\/limits|sign)(?:[/?#]|$)/i;
const GENERATE_URL_RE = /^https:\/\/api\.shortcutstudio\.app\/generate(?:[/?#]|$)/i;
const SIGN_URL_RE = /^https:\/\/api\.shortcutstudio\.app\/sign(?:[/?#]|$)/i;
const DEVICE_ID_HEADER = "X-Device-Installation-ID";
const CONTENT_LENGTH_HEADER = "Content-Length";
const STORAGE_KEY = "Yu9191.ShortcutStudio.Generate.DeviceInstallationID";
const DEFAULT_DEVICE_ID_REUSE_LIMIT = 2;
const DEFAULT_ARGUMENT = {
	thinkingMode: "auto",
	searchWebMode: "off",
	deviceIdReuseLimit: DEFAULT_DEVICE_ID_REUSE_LIMIT,
	signRewrite: "off",
};
const memoryStorage = {};

export async function Request(request) {
	if (!request?.url || !MATCH_URL_RE.test(String(request.url))) {
		return { $request: request };
	}

	const args = { ...DEFAULT_ARGUMENT, ...parseArgument(globalThis.$argument ?? $argument) };
	const url = String(request.url);
	if (SIGN_URL_RE.test(url) && normalizeMode(args.signRewrite) !== "on") {
		return { $request: request };
	}

	request.headers = normalizeHeaders(request.headers);

	const bodyResult = GENERATE_URL_RE.test(url) ? rewriteBody(request.body, args) : { body: request.body, changed: false };
	request.body = bodyResult.body;

	const deviceInstallationId = pickArgument(args, ["deviceId", "deviceInstallationId", "installationId"]) || nextDeviceInstallationId(args);
	if (deviceInstallationId) setHeader(request.headers, DEVICE_ID_HEADER, deviceInstallationId);
	if (bodyResult.changed) removeHeader(request.headers, CONTENT_LENGTH_HEADER);

	Console.debug("ShortcutStudio request rewritten");
	return { $request: request };
}

export function rewriteBody(body, argument = {}) {
	if (typeof body !== "string" || body.trim() === "") {
		return { body, changed: false };
	}

	let payload;
	try {
		payload = JSON.parse(body);
	} catch {
		return { body, changed: false };
	}

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return { body, changed: false };
	}

	let changed = false;
	const thinkingMode = normalizeMode(pickArgument(argument, ["thinkingMode", "thinkingModeSelection", "thinking", "reasoning", "enableReasoning"]));
	if (thinkingMode) {
		payload.thinkingModeSelection = thinkingMode;
		if (thinkingMode === "auto") {
			payload.thinkingMode = "auto";
			payload.enableReasoning = true;
			payload.reasoningEffort = "high";
		} else {
			payload.thinkingMode = thinkingMode === "on";
			payload.enableReasoning = thinkingMode === "on";
			payload.reasoningEffort = thinkingMode === "on" ? "high" : "minimal";
		}
		changed = true;
	}

	const searchWebMode = normalizeMode(pickArgument(argument, ["searchWebMode", "searchWebModeSelection", "searchWeb", "web"]));
	if (searchWebMode) {
		payload.searchWebMode = searchWebMode;
		changed = true;
	}

	const model = pickArgument(argument, ["model", "modelId"]);
	if (model) {
		payload.model = String(model);
		changed = true;
	}

	return {
		body: changed ? JSON.stringify(payload) : body,
		changed,
	};
}

export function nextDeviceInstallationId(argument = {}) {
	const reuseLimit = normalizePositiveInteger(pickArgument(argument, ["deviceIdReuseLimit", "idReuseLimit", "reuseLimit", "reuse"]), DEFAULT_DEVICE_ID_REUSE_LIMIT);
	const storageKey = String(pickArgument(argument, ["deviceIdStorageKey", "storageKey"]) || STORAGE_KEY);
	const state = readState(storageKey);
	if (!state.id || !Number.isFinite(state.uses) || state.uses >= reuseLimit) {
		state.id = createDeviceInstallationId();
		state.uses = 0;
	}
	state.uses += 1;
	if (!writeState(storageKey, state)) {
		return createDeviceInstallationId();
	}
	return state.id;
}

export function createDeviceInstallationId() {
	const bytes = randomBytes(16);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
	const id = `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
	return id;
}

export function normalizeHeaders(headers) {
	if (!headers || typeof headers !== "object") return {};
	return { ...headers };
}

export function setHeader(headers, name, value) {
	const existingKey = findHeaderKey(headers, name);
	headers[existingKey || name] = String(value);
}

export function removeHeader(headers, name) {
	const key = findHeaderKey(headers, name);
	if (key) delete headers[key];
}

export function normalizeMode(value) {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "auto") return "auto";
	if (normalized === "on" || normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "enable" || normalized === "enabled") return "on";
	if (normalized === "off" || normalized === "0" || normalized === "false" || normalized === "no" || normalized === "disable" || normalized === "disabled") return "off";
	return "";
}

export function parseArgument(argument) {
	if (!argument) return {};
	if (typeof argument === "object") return { ...argument };
	const result = {};
	String(argument)
		.replace(/^\?/, "")
		.split("&")
		.filter(Boolean)
		.forEach(pair => {
			const [rawKey = "", rawValue = ""] = pair.split("=", 2);
			const key = decodeQueryPart(rawKey);
			if (key) result[key] = decodeQueryPart(rawValue);
		});
	return result;
}

function randomBytes(size) {
	const bytes = new Uint8Array(size);
	const cryptoObject = globalThis.crypto || globalThis.msCrypto;
	if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
		cryptoObject.getRandomValues(bytes);
		return bytes;
	}
	for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
	return bytes;
}

function readState(key) {
	const raw = readStorage(key);
	if (!raw) return { id: "", uses: 0 };
	try {
		const state = typeof raw === "string" ? JSON.parse(raw) : raw;
		return {
			id: typeof state.id === "string" ? state.id : "",
			uses: Number(state.uses) || 0,
		};
	} catch {
		return { id: "", uses: 0 };
	}
}

function writeState(key, state) {
	return writeStorage(key, state);
}

function readStorage(key) {
	try {
		return Storage.getItem(key, "");
	} catch {}
	try {
		if (globalThis.localStorage && typeof globalThis.localStorage.getItem === "function") return globalThis.localStorage.getItem(key) || "";
	} catch {}
	return memoryStorage[key] || "";
}

function writeStorage(key, value) {
	try {
		if (Storage.setItem(key, value) !== false) return true;
	} catch {}
	try {
		if (globalThis.localStorage && typeof globalThis.localStorage.setItem === "function") {
			globalThis.localStorage.setItem(key, JSON.stringify(value));
			return true;
		}
	} catch {}
	memoryStorage[key] = JSON.stringify(value);
	return true;
}

function findHeaderKey(headers, name) {
	const expected = String(name).toLowerCase();
	return Object.keys(headers).find(key => key.toLowerCase() === expected) || "";
}

function normalizePositiveInteger(value, fallback) {
	const parsed = Number.parseInt(String(value ?? ""), 10);
	if (Number.isFinite(parsed) && parsed > 0) return parsed;
	return fallback;
}

function pickArgument(argument, names) {
	for (const name of names) {
		if (argument[name] !== undefined && argument[name] !== null && String(argument[name]).trim() !== "") return argument[name];
	}
	return "";
}

function decodeQueryPart(value) {
	try {
		return decodeURIComponent(String(value).replace(/\+/g, " "));
	} catch {
		return String(value);
	}
}
