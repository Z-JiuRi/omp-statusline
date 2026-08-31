import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { installStatuslineManager } from "./statusline";
import { StatuslineTimers } from "./timers";

export default function statuslineExtension(pi: ExtensionAPI): void {
	const timers = new StatuslineTimers();
	const binding = installStatuslineManager();

	const bind = (ctx: ExtensionContext): void => {
		binding.bindSession(ctx.sessionManager as object, timers);
	};

	pi.on("session_start", async (_event, ctx) => {
		bind(ctx);
	});

	pi.on("input", async (_event, ctx) => {
		bind(ctx);
		timers.noteInput();
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		bind(ctx);
		timers.beginTurn();
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		bind(ctx);
		timers.startTool(event.toolCallId);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		bind(ctx);
		timers.endTool(event.toolCallId);
	});

	pi.on("agent_end", async (event, ctx) => {
		bind(ctx);
		timers.endTurn(Date.now(), event.willContinue === true);
	});

	pi.on("session_shutdown", async () => {
		timers.reset();
		binding.dispose();
	});
}
