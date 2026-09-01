import { homedir } from "node:os";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { SEGMENTS, type SegmentContext } from "@oh-my-pi/pi-coding-agent/modes/components/status-line/segments";
import { theme, type ThemeColor } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import { visibleWidth } from "@oh-my-pi/pi-tui";
import { getProjectDir } from "@oh-my-pi/pi-utils";
import type { StatuslineTimers, TimerSnapshot } from "./timers";

const DOT = " · ";
const RAINBOW_FOREGROUNDS = [
	"\x1b[38;2;178;129;214m",
	"\x1b[38;2;215;135;175m",
	"\x1b[38;2;254;188;56m",
	"\x1b[38;2;228;192;15m",
	"\x1b[38;2;137;210;129m",
	"\x1b[38;2;0;175;175m",
	"\x1b[38;2;23;143;185m",
	"\x1b[38;2;178;129;214m",
] as const;
const MIN_PATH_WIDTH = 4;
const LAYOUT_OVERHEAD = 7;
const PATCH_KEY = Symbol.for("omp-statusline.patch.v1");
const MANAGED_IDS = ["model", "path", "context_pct", "token_in", "cache_hit", "token_out", "time"] as const;

type ManagedSegmentId = (typeof MANAGED_IDS)[number];
type Renderer = (ctx: SegmentContext) => { content: string; visible: boolean };
type SessionKey = object;

interface PatchRegistry {
	originals: Record<ManagedSegmentId, Renderer>;
	installed: Record<ManagedSegmentId, Renderer>;
	owners: Set<symbol>;
	timers: WeakMap<SessionKey, StatuslineTimers>;
}

export interface StatuslineValues {
	model: string;
	thinking: string | null;
	cwd: string;
	contextPercent: number | null;
	contextTokens: number;
	contextWindow: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export function formatCompactNumber(value: number): string {
	const n = Math.max(0, Number.isFinite(value) ? value : 0);
	if (n < 1_000) return Math.round(n).toString();
	if (n < 10_000) return `${trimFixed(n / 1_000, 1)}K`;
	if (n < 1_000_000) return `${Math.round(n / 1_000)}K`;
	if (n < 10_000_000) return `${trimFixed(n / 1_000_000, 2)}M`;
	if (n < 100_000_000) return `${trimFixed(n / 1_000_000, 1)}M`;
	if (n < 1_000_000_000) return `${Math.round(n / 1_000_000)}M`;
	if (n < 10_000_000_000) return `${trimFixed(n / 1_000_000_000, 2)}B`;
	return `${Math.round(n / 1_000_000_000)}B`;
}

function trimFixed(value: number, digits: number): string {
	return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function formatDuration(ms: number | null): string {
	if (ms === null) return "-";
	if (ms < 1_000) return `${Math.max(0, Math.round(ms))}ms`;
	if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.floor((ms % 60_000) / 1_000);
	if (minutes < 60) return `${minutes}m${seconds}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h${minutes % 60}m`;
}

export function formatClock(now: Date): string {
	return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}

export function contextColor(percent: number | null): ThemeColor {
	if (percent === null || !Number.isFinite(percent)) return "muted";
	if (percent >= 80) return "error";
	if (percent >= 50) return "warning";
	return "success";
}

export function cacheColor(rate: number | null): ThemeColor {
	if (rate === null || !Number.isFinite(rate)) return "muted";
	if (rate >= 90) return "success";
	if (rate >= 80) return "warning";
	return "error";
}

export function cacheHitRate(values: Pick<StatuslineValues, "cacheRead" | "cacheWrite" | "input">): number | null {
	const total = values.cacheRead + values.cacheWrite + values.input;
	return total > 0 ? (values.cacheRead / total) * 100 : null;
}

export function normalizeStatusPath(cwd: string): string {
	const normalized = cwd.replaceAll("\\", "/");
	const home = homedir().replaceAll("\\", "/");
	if (normalized === home) return "~";
	if (normalized.startsWith(`${home}/`)) return `~${normalized.slice(home.length)}`;
	return normalized;
}

export function truncatePathMiddle(path: string, maxWidth: number): string {
	if (visibleWidth(path) <= maxWidth) return path;
	if (maxWidth <= 1) return "…";

	const parts = path.split("/");
	if (parts.length >= 3) {
		let leftCount = parts[0] === "~" || parts[0] === "" ? Math.min(2, parts.length - 1) : 1;
		let rightCount = 1;
		const candidate = (): string => [...parts.slice(0, leftCount), "…", ...parts.slice(parts.length - rightCount)].join("/");

		while (leftCount > 1 && visibleWidth(candidate()) > maxWidth) leftCount--;
		if (visibleWidth(candidate()) <= maxWidth) {
			for (;;) {
				const addLeft = leftCount + rightCount + 1 < parts.length;
				if (addLeft) {
					leftCount++;
					if (visibleWidth(candidate()) <= maxWidth) continue;
					leftCount--;
				}
				const addRight = leftCount + rightCount + 1 < parts.length;
				if (addRight) {
					rightCount++;
					if (visibleWidth(candidate()) <= maxWidth) continue;
					rightCount--;
				}
				break;
			}
			return candidate();
		}
	}

	return `…${takeRightByWidth(path, maxWidth - 1)}`;
}

function takeRightByWidth(text: string, maxWidth: number): string {
	const chars = Array.from(text);
	let width = 0;
	let start = chars.length;
	while (start > 0) {
		const nextWidth = visibleWidth(chars[start - 1] ?? "");
		if (width + nextWidth > maxWidth) break;
		width += nextWidth;
		start--;
	}
	return chars.slice(start).join("");
}

export function formatContext(values: Pick<StatuslineValues, "contextPercent" | "contextTokens" | "contextWindow">): string {
	if (values.contextWindow <= 0) return `${formatCompactNumber(values.contextTokens)}/?`;
	const percent = values.contextPercent === null ? "?" : `${values.contextPercent.toFixed(1)}%`;
	return `${percent}/${formatCompactNumber(values.contextWindow)}`;
}

export function formatCache(values: Pick<StatuslineValues, "cacheRead" | "cacheWrite" | "input">): string {
	const rate = cacheHitRate(values);
	return `CH ${formatCompactNumber(values.cacheRead)}/${rate === null ? "—" : `${rate.toFixed(2)}%`}`;
}

export function formatLeftPlain(values: StatuslineValues, pathWidth: number): string {
	const parts = [values.model];
	if (values.thinking) parts.push(values.thinking);
	parts.push(
		truncatePathMiddle(normalizeStatusPath(values.cwd), pathWidth),
		formatContext(values),
		`In ${formatCompactNumber(values.input)}`,
		formatCache(values),
		`Out ${formatCompactNumber(values.output)}`,
	);
	return parts.join(DOT);
}

export function formatRightPlain(snapshot: TimerSnapshot, now: Date): string {
	return `${formatDuration(snapshot.toolMs)}/${formatDuration(snapshot.turnMs)}${DOT}${formatClock(now)}`;
}

export function rainbowThinking(level: "xhigh" | "max"): string {
	let gradient = "";
	let colorIndex = 0;
	for (const character of level) {
		if (character === " " || character === ":") {
			gradient += character;
			continue;
		}
		gradient += `${RAINBOW_FOREGROUNDS[colorIndex % RAINBOW_FOREGROUNDS.length]}${character}`;
		colorIndex++;
	}
	gradient += "\x1b[39m";
	return level === "max" ? `\x1b[1m${gradient}\x1b[22m` : gradient;
}

function resolveThinking(ctx: SegmentContext): string | null {
	const sessionManager = ctx.session.sessionManager as unknown as Record<string, unknown> | undefined;
	const thinkingGetter = sessionManager?.getThinkingLevel as (() => string | undefined) | undefined;
	if (typeof thinkingGetter === "function") {
		const level = thinkingGetter.call(sessionManager);
		if (level && level !== "off") return level;
	}
	const state = ctx.session.state;
	if (ctx.session.isAutoThinking) return ctx.session.autoResolvedThinkingLevel() ?? "auto";
	if (state.thinkingLevel && (state.thinkingLevel as string) !== "off") return state.thinkingLevel;
	if (state.model?.thinking) return state.thinkingLevel ?? "off";
	return null;
}

function thinkingColor(level: string): ThemeColor {
	switch (level) {
		case "off":
		case "auto":
			return "thinkingOff";
		case "minimal":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
			return "thinkingMedium";
		case "high":
			return "thinkingHigh";
		case "xhigh":
		case "max":
			return "thinkingXhigh";
		default:
			return "accent";
	}
}

function valuesFromContext(ctx: SegmentContext): StatuslineValues {
	const state = ctx.session.state;
	return {
		model: state.model?.name || state.model?.id || "no-model",
		thinking: resolveThinking(ctx),
		cwd: ctx.activeRepo?.cwd ?? getProjectDir(),
		contextPercent: ctx.contextPercent,
		contextTokens: ctx.contextTokens,
		contextWindow: ctx.contextWindow,
		input: ctx.usageStats.input,
		output: ctx.usageStats.output,
		cacheRead: ctx.usageStats.cacheRead,
		cacheWrite: ctx.usageStats.cacheWrite,
	};
}

function internalSeparator(): string {
	return theme.fg("statusLineSep", DOT);
}

function renderLeft(ctx: SegmentContext, registry: PatchRegistry): { content: string; visible: boolean } {
	const values = valuesFromContext(ctx);
	const sessionKey = (ctx.session.sessionManager ?? ctx.session) as SessionKey;
	const snapshot = registry.timers.get(sessionKey)?.snapshot() ?? { toolMs: null, turnMs: null };
	const rightWidth = visibleWidth(formatRightPlain(snapshot, new Date()));

	const fixedValues = { ...values, cwd: "" };
	const fixedWidth = visibleWidth(formatLeftPlain(fixedValues, 0));
	const configuredMax = ctx.options.path?.maxLength ?? 40;
	const responsiveMax = Math.max(MIN_PATH_WIDTH, ctx.width - fixedWidth - rightWidth - LAYOUT_OVERHEAD);
	const pathWidth = Math.max(MIN_PATH_WIDTH, Math.min(configuredMax, responsiveMax));

	const rate = cacheHitRate(values);
	const parts: string[] = [theme.fg("statusLineModel", values.model)];
	if (values.thinking) {
		let thinking: string;
		if (values.thinking === "xhigh" || values.thinking === "max") {
			thinking = rainbowThinking(values.thinking);
		} else {
			thinking = theme.fg(thinkingColor(values.thinking), values.thinking);
		}
		parts.push(thinking);
	}
	parts.push(
		theme.fg("statusLinePath", truncatePathMiddle(normalizeStatusPath(values.cwd), pathWidth)),
		theme.fg(contextColor(values.contextPercent), formatContext(values)),
		theme.fg("statusLineSpend", `In ${formatCompactNumber(values.input)}`),
		theme.fg(cacheColor(rate), formatCache(values)),
		theme.fg("statusLineOutput", `Out ${formatCompactNumber(values.output)}`),
	);
	return { content: parts.join(internalSeparator()), visible: true };
}

function renderRight(ctx: SegmentContext, registry: PatchRegistry): { content: string; visible: boolean } {
	const sessionKey = (ctx.session.sessionManager ?? ctx.session) as SessionKey;
	const snapshot = registry.timers.get(sessionKey)?.snapshot() ?? { toolMs: null, turnMs: null };
	const now = new Date();
	const timers = `${formatDuration(snapshot.toolMs)}/${formatDuration(snapshot.turnMs)}`;
	return {
		content: `${theme.fg("statusLineOutput", timers)}${internalSeparator()}${theme.fg("muted", formatClock(now))}`,
		visible: true,
	};
}

function createRegistry(): PatchRegistry {
	const originals = Object.fromEntries(MANAGED_IDS.map(id => [id, SEGMENTS[id].render])) as Record<ManagedSegmentId, Renderer>;
	const registry = {
		originals,
		installed: {} as Record<ManagedSegmentId, Renderer>,
		owners: new Set<symbol>(),
		timers: new WeakMap<SessionKey, StatuslineTimers>(),
	};
	const hidden: Renderer = () => ({ content: "", visible: false });
	registry.installed = {
		model: hidden,
		path: hidden,
		context_pct: hidden,
		token_in: hidden,
		cache_hit: hidden,
		token_out: hidden,
		time: hidden,
	};
	for (const id of MANAGED_IDS) SEGMENTS[id].render = registry.installed[id];
	return registry;
}

function getRegistry(): PatchRegistry {
	const host = SEGMENTS as typeof SEGMENTS & Record<PropertyKey, unknown>;
	const existing = host[PATCH_KEY] as PatchRegistry | undefined;
	if (existing) return existing;
	const registry = createRegistry();
	host[PATCH_KEY] = registry;
	return registry;
}

export interface StatuslineBinding {
	bindSession(session: SessionKey, timers: StatuslineTimers): void;
	dispose(): void;
}

export function installStatuslineManager(): StatuslineBinding {
	const registry = getRegistry();
	const owner = Symbol("omp-statusline-owner");
	const sessions = new Set<SessionKey>();
	registry.owners.add(owner);

	return {
		bindSession(session, timers) {
			sessions.add(session);
			registry.timers.set(session, timers);
		},
		dispose() {
			for (const session of sessions) registry.timers.delete(session);
			sessions.clear();
			registry.owners.delete(owner);
			if (registry.owners.size > 0) return;
			for (const id of MANAGED_IDS) {
				if (SEGMENTS[id].render === registry.installed[id]) SEGMENTS[id].render = registry.originals[id];
			}
			const host = SEGMENTS as typeof SEGMENTS & Record<PropertyKey, unknown>;
			if (host[PATCH_KEY] === registry) delete host[PATCH_KEY];
		},
	};
}

export function renderStatuslineRow(
	values: StatuslineValues,
	snapshot: TimerSnapshot,
	width: number,
	customTheme?: { fg(color: ThemeColor, text: string): string },
): string {
	const activeTheme = customTheme ?? theme;
	const fg = (color: ThemeColor, text: string): string => {
		try {
			return activeTheme?.fg?.(color, text) ?? text;
		} catch {
			return text;
		}
	};
	const separator = fg("statusLineSep", DOT);

	const now = new Date();
	const timersText = `${formatDuration(snapshot.toolMs)}/${formatDuration(snapshot.turnMs)}`;
	const clockText = formatClock(now);
	const rightPlain = `${timersText}${DOT}${clockText}`;
	const rightColored = `${fg("statusLineOutput", timersText)}${separator}${fg("muted", clockText)}`;
	const rightWidth = visibleWidth(rightPlain);

	const fixedValues = { ...values, cwd: "" };
	const fixedWidth = visibleWidth(formatLeftPlain(fixedValues, 0));
	const responsiveMax = Math.max(MIN_PATH_WIDTH, width - fixedWidth - rightWidth - LAYOUT_OVERHEAD);
	const pathWidth = Math.max(MIN_PATH_WIDTH, Math.min(40, responsiveMax));

	const rate = cacheHitRate(values);
	const leftPartsColored: string[] = [fg("statusLineModel", values.model)];
	if (values.thinking) {
		if (values.thinking === "xhigh" || values.thinking === "max") {
			leftPartsColored.push(rainbowThinking(values.thinking));
		} else {
			leftPartsColored.push(fg(thinkingColor(values.thinking), values.thinking));
		}
	}
	leftPartsColored.push(
		fg("statusLinePath", truncatePathMiddle(normalizeStatusPath(values.cwd), pathWidth)),
		fg(contextColor(values.contextPercent), formatContext(values)),
		fg("statusLineSpend", `In ${formatCompactNumber(values.input)}`),
		fg(cacheColor(rate), formatCache(values)),
		fg("statusLineOutput", `Out ${formatCompactNumber(values.output)}`),
	);

	const leftColored = leftPartsColored.join(separator);
	const leftPlain = formatLeftPlain(values, pathWidth);
	const leftWidth = visibleWidth(leftPlain);

	const pad = Math.max(1, width - leftWidth - rightWidth);
	return `${leftColored}${" ".repeat(pad)}${rightColored}`;
}

export function valuesFromExtensionContext(ctx: ExtensionContext): StatuslineValues {
	const usage = typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : undefined;
	const sessionManager = ctx.sessionManager as Record<string, unknown> | undefined;
	const statsGetter = sessionManager?.getUsageStatistics as (() => Record<string, number>) | undefined;
	const stats = typeof statsGetter === "function" ? statsGetter.call(sessionManager) : {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
	};

	let thinking: string | null = null;
	const thinkingGetter = sessionManager?.getThinkingLevel as (() => string | undefined) | undefined;
	if (typeof thinkingGetter === "function") {
		const level = thinkingGetter.call(sessionManager);
		if (level && level !== "off") thinking = level;
	}
	if (!thinking) {
		const session = (ctx as unknown as { session?: { state?: { thinkingLevel?: string; model?: { thinking?: boolean } }; isAutoThinking?: boolean; autoResolvedThinkingLevel?: () => string } }).session;
		const sessionState = session?.state;
		if (sessionState?.model?.thinking) {
			if (session?.isAutoThinking && typeof session?.autoResolvedThinkingLevel === "function") {
				thinking = session.autoResolvedThinkingLevel() ?? "auto";
			} else {
				thinking = sessionState.thinkingLevel ?? "off";
			}
		}
	}

	return {
		model: ctx.model?.name || ctx.model?.id || "no-model",
		thinking,
		cwd: ctx.cwd || process.cwd(),
		contextPercent: usage?.percent ?? null,
		contextTokens: usage?.tokens ?? 0,
		contextWindow: usage?.contextWindow ?? ctx.model?.contextWindow ?? 0,
		input: stats.input ?? 0,
		output: stats.output ?? 0,
		cacheRead: stats.cacheRead ?? 0,
		cacheWrite: stats.cacheWrite ?? 0,
	};
}
