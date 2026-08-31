import { describe, expect, test } from "bun:test";
import { SEGMENTS } from "@oh-my-pi/pi-coding-agent/modes/components/status-line/segments";
import {
	cacheColor,
	cacheHitRate,
	contextColor,
	formatCache,
	formatCompactNumber,
	formatLeftPlain,
	formatRightPlain,
	installStatuslineManager,
	rainbowThinking,
	truncatePathMiddle,
	type StatuslineValues,
} from "../src/statusline";

const SAMPLE_VALUES: StatuslineValues = {
	model: "Antigravity Gemini 3.7 Flash",
	thinking: "high",
	cwd: "/path/to/dir",
	contextPercent: 2.5,
	contextTokens: 25_000,
	contextWindow: 1_000_000,
	input: 33_000,
	output: 942,
	cacheRead: 1_020_000,
	cacheWrite: 874_072,
};

describe("compact formatting", () => {
	test("uses readable token precision", () => {
		expect(formatCompactNumber(942)).toBe("942");
		expect(formatCompactNumber(2_500)).toBe("2.5K");
		expect(formatCompactNumber(33_000)).toBe("33K");
		expect(formatCompactNumber(1_020_000)).toBe("1.02M");
		expect(formatCompactNumber(52_000_000)).toBe("52M");
	});

	test("formats the requested complete statusline text", () => {
		expect(formatLeftPlain(SAMPLE_VALUES, 40)).toBe(
			"Antigravity Gemini 3.7 Flash · high · /path/to/dir · 2.5%/1M · In 33K · CH 1.02M/52.93% · Out 942",
		);
		expect(formatRightPlain({ toolMs: 5_500, turnMs: 29_600 }, new Date(2026, 7, 30, 21, 54))).toBe(
			"5.5s/29.6s · 21:54",
		);
	});
});

describe("thinking emphasis", () => {
	test("renders xhigh with the Pi rainbow palette", () => {
		const rendered = rainbowThinking("xhigh");
		expect(rendered.replace(/\x1b\[[0-9;]*m/g, "")).toBe("xhigh");
		expect(rendered.match(/\x1b\[38;2;/g)).toHaveLength(5);
		expect(rendered.startsWith("\x1b[1m")).toBe(false);
	});

	test("renders max with the same rainbow plus bold emphasis", () => {
		const rendered = rainbowThinking("max");
		expect(rendered.replace(/\x1b\[[0-9;]*m/g, "")).toBe("max");
		expect(rendered.match(/\x1b\[38;2;/g)).toHaveLength(3);
		expect(rendered.startsWith("\x1b[1m")).toBe(true);
		expect(rendered.endsWith("\x1b[22m")).toBe(true);
	});
});

describe("threshold colors", () => {
	test("uses green, yellow, and red context bands", () => {
		expect(contextColor(49.99)).toBe("success");
		expect(contextColor(50)).toBe("warning");
		expect(contextColor(79.99)).toBe("warning");
		expect(contextColor(80)).toBe("error");
	});

	test("uses green, yellow, and red cache bands", () => {
		expect(cacheColor(79.99)).toBe("error");
		expect(cacheColor(80)).toBe("warning");
		expect(cacheColor(89.99)).toBe("warning");
		expect(cacheColor(90)).toBe("success");
	});

	test("includes cache writes and uncached input in the hit-rate denominator", () => {
		expect(cacheHitRate(SAMPLE_VALUES)?.toFixed(2)).toBe("52.93");
		expect(formatCache({ cacheRead: 0, cacheWrite: 0, input: 0 })).toBe("CH 0/—");
	});
});

describe("path truncation", () => {
	test("preserves the root and leaf when shortening", () => {
		const shortened = truncatePathMiddle("~/workspace/extensions/omp/omp-statusline", 28);
		expect(shortened).toBe("~/workspace/…/omp-statusline");
	});

	test("never exceeds the requested visible width", () => {
		expect(truncatePathMiddle("/very/long/path/to/a/project", 12)).toBe("/…/a/project");
	});
});

describe("segment patch lifecycle", () => {
	test("does not stack patches and restores originals after the last owner", () => {
		const originalPath = SEGMENTS.path.render;
		const first = installStatuslineManager();
		const installedPath = SEGMENTS.path.render;
		const second = installStatuslineManager();

		expect(installedPath).not.toBe(originalPath);
		expect(SEGMENTS.path.render).toBe(installedPath);
		first.dispose();
		expect(SEGMENTS.path.render).toBe(installedPath);
		second.dispose();
		expect(SEGMENTS.path.render).toBe(originalPath);
	});
});
