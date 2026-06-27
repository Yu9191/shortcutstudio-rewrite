import { $argument, Console } from "@nsnanocat/util";

const LIMITS_URL_RE = /^https:\/\/api\.shortcutstudio\.app\/users\/me\/limits(?:[/?#]|$)/i;
const CONTENT_LENGTH_HEADER = "Content-Length";

const DEFAULT_ARGUMENT = {
	limitsMock: "off",
	messagesLimit: 999,
	downloadsLimit: 999,
	searchesLimit: 999,
	uploadsLimit: 999,
	marketplaceDownloadsLimit: 999,
	chatInputCharsLimit: 20000,
};

export async function Response(request, response) {
	if (!request?.url || !LIMITS_URL_RE.test(String(request.url))) return response;

	const args = { ...DEFAULT_ARGUMENT, ...parseArgument(globalThis.$argument ?? $argument) };
	if (normalizeSwitch(args.limitsMock) !== "on") return response;
	if (typeof response?.body !== "string" || response.body.trim() === "") return response;

	let payload;
	try {
		payload = JSON.parse(response.body);
	} catch {
		return response;
	}

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response;
	payload.limits = payload.limits && typeof payload.limits === "object" ? payload.limits : {};

	applyQuota(payload.limits, "messages", args.messagesLimit);
	applyQuota(payload.limits, "downloads", args.downloadsLimit);
	applyQuota(payload.limits, "searches", args.searchesLimit);
	applyQuota(payload.limits, "uploads", args.uploadsLimit);
	applyQuota(payload.limits, "marketplace_downloads", args.marketplaceDownloadsLimit);
	applyQuota(payload.limits, "chat_input_chars", args.chatInputCharsLimit);

	response.body = JSON.stringify(payload);
	response.headers = normalizeHeaders(response.headers);
	removeHeader(response.headers, CONTENT_LENGTH_HEADER);
	Console.debug("ShortcutStudio limits response mocked");
	return response;
}

export function applyQuota(limits, key, value) {
	const limit = normalizeNonNegativeInteger(value, 0);
	const quota = limits[key] && typeof limits[key] === "object" && !Array.isArray(limits[key]) ? limits[key] : {};
	quota.allowed = limit > 0;
	quota.current = 0;
	quota.limit = limit;
	quota.remaining = limit;
	limits[key] = quota;
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

export function normalizeSwitch(value) {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (normalized === "on" || normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "enable" || normalized === "enabled") return "on";
	return "off";
}

function normalizeHeaders(headers) {
	if (!headers || typeof headers !== "object") return {};
	return { ...headers };
}

function removeHeader(headers, name) {
	const expected = String(name).toLowerCase();
	const key = Object.keys(headers).find(header => header.toLowerCase() === expected);
	if (key) delete headers[key];
}

function normalizeNonNegativeInteger(value, fallback) {
	const parsed = Number.parseInt(String(value ?? ""), 10);
	if (Number.isFinite(parsed) && parsed >= 0) return parsed;
	return fallback;
}

function decodeQueryPart(value) {
	try {
		return decodeURIComponent(String(value).replace(/\+/g, " "));
	} catch {
		return String(value);
	}
}
