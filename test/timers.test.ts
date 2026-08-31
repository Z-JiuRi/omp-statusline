import { describe, expect, test } from "bun:test";
import { StatuslineTimers } from "../src/timers";

describe("StatuslineTimers", () => {
	test("includes input-to-agent delay and preserves automatic continuations", () => {
		const timers = new StatuslineTimers();
		timers.noteInput(100);
		timers.beginTurn(150);
		expect(timers.snapshot(200).turnMs).toBe(100);

		timers.endTurn(500, true);
		expect(timers.snapshot(600).turnMs).toBe(500);

		timers.endTurn(1_000, false);
		expect(timers.snapshot(1_500).turnMs).toBe(900);
	});

	test("tracks parallel tools by id without cross-talk", () => {
		const timers = new StatuslineTimers();
		timers.startTool("older", 100);
		timers.startTool("newer", 200);
		expect(timers.snapshot(250).toolMs).toBe(50);

		timers.endTool("newer", 300);
		expect(timers.snapshot(350).toolMs).toBe(250);

		timers.endTool("older", 400);
		expect(timers.snapshot(500).toolMs).toBe(300);
	});

	test("starts a queued turn from the earliest pending input", () => {
		const timers = new StatuslineTimers();
		timers.noteInput(100);
		timers.noteInput(120);
		timers.beginTurn(200);
		expect(timers.snapshot(250).turnMs).toBe(150);
	});
});
