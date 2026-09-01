import type { ExtensionAPI, ExtensionContext, Theme } from "@oh-my-pi/pi-coding-agent";
import { installStatuslineManager, renderStatuslineRow, valuesFromExtensionContext } from "./statusline";
import { StatuslineTimers } from "./timers";

export default function statuslineExtension(pi: ExtensionAPI): void {
	const timers = new StatuslineTimers();
	const binding = installStatuslineManager();

	const registerUi = (ctx: ExtensionContext): void => {
		binding.bindSession(ctx.sessionManager as object, timers);

		if (!ctx.hasUI) return;

		if (ctx.ui?.setWidget) {
			ctx.ui.setWidget(
				"omp-statusline",
				(_tui: unknown, theme: Theme) => ({
					render(width: number): string[] {
						const values = valuesFromExtensionContext(ctx);
						const snapshot = timers.snapshot();
						return [renderStatuslineRow(values, snapshot, width, theme)];
					},
					invalidate(): void {},
					dispose(): void {},
				}),
				{ placement: "belowEditor" },
			);
		}

		if (typeof ctx.ui?.setFooter === "function") {
			try {
				ctx.ui.setFooter((_tui: unknown, theme: Theme) => ({
					render(width: number): string[] {
						const values = valuesFromExtensionContext(ctx);
						const snapshot = timers.snapshot();
						return [renderStatuslineRow(values, snapshot, width, theme)];
					},
					invalidate(): void {},
					dispose(): void {},
				}));
			} catch {
				// Safe fallback if not supported
			}
		}
	};

	const refresh = (ctx: ExtensionContext): void => {
		try {
			(ctx.ui as unknown as { requestRender?: () => void })?.requestRender?.();
		} catch {}
	};

	pi.on("session_start", async (_event, ctx) => {
		registerUi(ctx);
		refresh(ctx);
	});

	pi.on("input", async (_event, ctx) => {
		registerUi(ctx);
		timers.noteInput();
		refresh(ctx);
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		registerUi(ctx);
		timers.beginTurn();
		refresh(ctx);
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		registerUi(ctx);
		timers.startTool(event.toolCallId);
		refresh(ctx);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		registerUi(ctx);
		timers.endTool(event.toolCallId);
		refresh(ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		registerUi(ctx);
		timers.endTurn(Date.now(), event.willContinue === true);
		refresh(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("session_shutdown", async () => {
		timers.reset();
		binding.dispose();
	});
}

