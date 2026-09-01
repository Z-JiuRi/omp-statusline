import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { installStatuslineManager } from "./statusline";
import { StatuslineTimers } from "./timers";

export default function statuslineExtension(pi: ExtensionAPI): void {
	const timers = new StatuslineTimers();
	const binding = installStatuslineManager();

	const bind = (ctx: ExtensionContext): void => {
		binding.bindSession(ctx.sessionManager as object, timers);
	};

	const refresh = (ctx: ExtensionContext): void => {
		try {
			(ctx.ui as unknown as { requestRender?: () => void })?.requestRender?.();
		} catch {}
	};

	pi.on("session_start", async (_event, ctx) => {
		bind(ctx);
		refresh(ctx);
	});

	pi.on("input", async (_event, ctx) => {
		bind(ctx);
		timers.noteInput();
		refresh(ctx);
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		bind(ctx);
		timers.beginTurn();
		refresh(ctx);
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		bind(ctx);
		timers.startTool(event.toolCallId);
		refresh(ctx);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		bind(ctx);
		timers.endTool(event.toolCallId);
		refresh(ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		bind(ctx);
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

