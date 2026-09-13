import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { setApprovalPolicy } from "@deepseek-ai/dsh-user-approval";
import { automationSessionTitle } from "./run-title.js";
const SessionId = (id) => String(id);
const WorkspaceId = (id) => String(id);
const CANCEL_CONVERGENCE_TIMEOUT_MS = 1e4;
async function settlesWithin(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => true, () => false),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
function applyUnattendedPermission(presets, session, permission) {
  presets.set(session, permission);
  setApprovalPolicy(session, "never");
}
function readSessionEvents(session) {
  if (typeof session.snapshotEvents === "function") return session.snapshotEvents();
  return session.events ?? [];
}
function summarizeRun(events, firstSeq) {
  let started = false;
  let text = "";
  let reason;
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === "turn/start") {
      started = true;
      continue;
    }
    if (!started) continue;
    if (event.type === "assistant/message") {
      const blocks = event.data.message?.content ?? [];
      const joined = blocks.filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
      if (joined !== "") text = joined;
    }
    if (event.type === "turn/end") reason = event.data.reason;
  }
  return { text, ...reason === void 0 ? {} : { reason } };
}
function boundSummary(value) {
  const normalized = value.trim();
  if (normalized === "") return void 0;
  return normalized.length <= 2e3 ? normalized : `${normalized.slice(0, 1999)}…`;
}
function reasonError(reason) {
  if (reason === void 0) return { code: "no_turn_result", message: "本次自动化没有产生完整 turn。" };
  if (reason.kind === "error") {
    return {
      code: typeof reason.error?.code === "string" ? reason.error.code : "agent_error",
      message: typeof reason.error?.message === "string" ? reason.error.message : "自动化 Agent 执行失败。"
    };
  }
  return { code: `turn_${String(reason.kind)}`, message: `自动化以 ${String(reason.kind)} 结束。` };
}
async function executeAutomationRun(ctx, definition, run, config) {
  if (config.signal?.aborted === true) {
    return { status: "cancelled", error: { code: "cancelled", message: "自动化在启动前已被取消。" } };
  }
  const target = run.targetSnapshot;
  const workspace = ctx.workspaceRegistry.get(WorkspaceId(target.workspaceId));
  if (workspace === void 0) {
    return { status: "failed", error: { code: "workspace_not_found", message: "目标工作区已不存在。" } };
  }
  if (await workspace.status() !== "ok" || workspace.path !== target.cwd) {
    return { status: "failed", error: { code: "workspace_unavailable", message: "目标工作区目录不可用或已变更。" } };
  }
  const fallbackSelection = ctx.agentDefaultModel.currentSelection();
  const selection = target.provider !== null && target.model !== null ? {
    provider: target.provider,
    model: target.model,
    ...target.reasoningEffort ? { reasoningEffort: target.reasoningEffort } : {}
  } : fallbackSelection;
  const sessionId = SessionId(config.sessionId);
  let handle;
  let timeout;
  let removeCancellationListener = () => {
  };
  try {
    handle = await ctx.agents.withoutInitiator(() => ctx.agents.create({
      sessionId,
      ...config.signal === void 0 ? {} : { signal: config.signal },
      meta: { cwd: target.cwd, agentPreset: target.agentPreset },
      agentOptions: { provider: selection.provider, model: selection.model },
      setup: async (agentCtx, createdAgent) => {
        await ctx.agentPresets.mount(agentCtx, target.agentPreset);
        installModelSelection(agentCtx, { current: selection, assembled: void 0 });
        const agent = createdAgent ?? agentCtx.agent;
        if (agent === void 0) throw new Error("automation setup has no scoped Agent");
        applyUnattendedPermission(ctx.permissionPresets, agent.session, target.permissionPreset);
      }
    }));
    await handle.agent.whenIdle();
    await workspace.attachSession(sessionId);
    pinAutomationSessionTitle(ctx, handle.agent.session, automationSessionTitle(
      definition.name,
      run.startedAt ?? run.scheduledFor,
      definition.timeZone
    ));
    const firstSeq = handle.agent.session.seq;
    handle.agent.followup(createUserMessage({
      content: [{ type: "text", text: run.promptSnapshot }],
      source: {
        kind: "automation",
        automationId: definition.id,
        runId: run.id,
        scheduledFor: run.scheduledFor
      }
    }));
    let timedOut = false;
    let aborted = false;
    const idle = handle.agent.whenIdle();
    const deadline = new Promise((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        handle?.agent.cancel({ kind: "hook", reason: "automation run timeout" });
        resolve();
      }, config.runTimeoutMs);
    });
    const cancellation = new Promise((resolve) => {
      if (config.signal === void 0) return;
      const cancel = () => {
        aborted = true;
        handle?.agent.cancel({ kind: "hook", reason: "automation service disposed" });
        resolve();
      };
      if (config.signal.aborted) cancel();
      else {
        config.signal.addEventListener("abort", cancel, { once: true });
        removeCancellationListener = () => {
          config.signal?.removeEventListener("abort", cancel);
        };
      }
    });
    await Promise.race([idle, deadline, cancellation]);
    removeCancellationListener();
    if ((timedOut || aborted) && !await settlesWithin(idle, CANCEL_CONVERGENCE_TIMEOUT_MS)) {
      return {
        sessionId: String(sessionId),
        status: aborted ? "cancelled" : "failed",
        error: {
          code: "cancel_convergence_timeout",
          message: "自动化取消后未能在安全时限内停止。"
        }
      };
    }
    if (timeout !== void 0) clearTimeout(timeout);
    await ctx.sessions.flush(handle.agent.session);
    const outcome = summarizeRun(readSessionEvents(handle.agent.session), firstSeq);
    const summary = boundSummary(outcome.text);
    if (aborted) {
      return {
        sessionId: String(sessionId),
        status: "cancelled",
        ...summary === void 0 ? {} : { summary },
        error: { code: "cancelled", message: "自动化因其所属服务停止而被取消。" }
      };
    }
    if (timedOut) {
      return {
        sessionId: String(sessionId),
        status: "failed",
        ...summary === void 0 ? {} : { summary },
        error: { code: "timeout", message: "自动化超过最大运行时限。" }
      };
    }
    if (outcome.reason?.kind === "completed") {
      return { sessionId: String(sessionId), status: "succeeded", ...summary === void 0 ? {} : { summary } };
    }
    return {
      sessionId: String(sessionId),
      status: "failed",
      ...summary === void 0 ? {} : { summary },
      error: reasonError(outcome.reason)
    };
  } catch (error) {
    return {
      ...handle === void 0 ? {} : { sessionId: String(sessionId) },
      status: "failed",
      error: {
        code: "executor_error",
        message: error instanceof Error ? error.message : "自动化执行器失败。"
      }
    };
  } finally {
    removeCancellationListener();
    if (timeout !== void 0) clearTimeout(timeout);
    if (handle !== void 0) {
      await settlesWithin(handle.dispose().catch(() => {
      }), CANCEL_CONVERGENCE_TIMEOUT_MS);
    }
  }
}
function pinAutomationSessionTitle(ctx, session, title) {
  const service = ctx.get("sessionTitle");
  if (service === void 0 || typeof service.rename !== "function") return;
  try {
    service.rename(session, title);
  } catch (error) {
    ctx.logger.warn(`omnimux-automation: failed to pin session title: ${error instanceof Error ? error.message : String(error)}`);
  }
}
export {
  applyUnattendedPermission,
  executeAutomationRun,
  pinAutomationSessionTitle,
  readSessionEvents,
  settlesWithin,
  summarizeRun
};
