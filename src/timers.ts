export interface TimerSnapshot {
	toolMs: number | null;
	turnMs: number | null;
}

interface RunningTool {
	startedAt: number;
	sequence: number;
}

/** Per-session tool and user-interaction timers. */
export class StatuslineTimers {
	#pendingInputAt: number | null = null;
	#turnStartedAt: number | null = null;
	#lastTurnDuration: number | null = null;
	#runningTools = new Map<string, RunningTool>();
	#lastToolDuration: number | null = null;
	#toolSequence = 0;

	noteInput(now: number = Date.now()): void {
		this.#pendingInputAt ??= now;
	}

	beginTurn(now: number = Date.now()): void {
		if (this.#turnStartedAt !== null) return;
		this.#turnStartedAt = this.#pendingInputAt ?? now;
		this.#pendingInputAt = null;
		this.#lastTurnDuration = null;
		this.#runningTools.clear();
		this.#lastToolDuration = null;
	}

	endTurn(now: number = Date.now(), willContinue: boolean = false): void {
		if (willContinue || this.#turnStartedAt === null) return;
		this.#lastTurnDuration = Math.max(0, now - this.#turnStartedAt);
		this.#turnStartedAt = null;
		this.#runningTools.clear();
	}

	startTool(toolCallId: string, now: number = Date.now()): void {
		this.#runningTools.set(toolCallId, {
			startedAt: now,
			sequence: ++this.#toolSequence,
		});
	}

	endTool(toolCallId: string, now: number = Date.now()): void {
		const running = this.#runningTools.get(toolCallId);
		if (!running) return;
		this.#runningTools.delete(toolCallId);
		this.#lastToolDuration = Math.max(0, now - running.startedAt);
	}

	snapshot(now: number = Date.now()): TimerSnapshot {
		let activeTool: RunningTool | null = null;
		for (const running of this.#runningTools.values()) {
			if (activeTool === null || running.sequence > activeTool.sequence) activeTool = running;
		}

		return {
			toolMs: activeTool === null ? this.#lastToolDuration : Math.max(0, now - activeTool.startedAt),
			turnMs:
				this.#turnStartedAt === null
					? this.#lastTurnDuration
					: Math.max(0, now - this.#turnStartedAt),
		};
	}

	reset(): void {
		this.#pendingInputAt = null;
		this.#turnStartedAt = null;
		this.#lastTurnDuration = null;
		this.#runningTools.clear();
		this.#lastToolDuration = null;
	}
}
