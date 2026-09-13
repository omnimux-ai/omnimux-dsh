import { AutomationRequestError } from "./service.js";
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
class RpcRequestError extends Error {
  name = "RpcRequestError";
}
function isBadRequest(error) {
  return error instanceof RpcRequestError || error instanceof AutomationRequestError;
}
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RpcRequestError(`${label} must be an object`);
  }
  return value;
}
function string(value, label, maxLength) {
  if (typeof value !== "string" || value.trim() === "") throw new RpcRequestError(`${label} must be a non-empty string`);
  if (maxLength !== void 0 && value.length > maxLength) throw new RpcRequestError(`${label} must be at most ${maxLength} characters`);
  return value;
}
function optionalString(value, label) {
  return value === void 0 ? void 0 : string(value, label);
}
function integer(value, label) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new RpcRequestError(`${label} must be an integer`);
  return value;
}
function positiveInteger(value, label) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new RpcRequestError(`${label} must be a positive integer`);
  }
  return value;
}
function toDomainSchedule(raw, timeZone) {
  const schedule = record(raw, "schedule");
  const kind = string(schedule.kind, "schedule.kind");
  switch (kind) {
    case "once":
      return { kind, at: string(schedule.at, "schedule.at"), timeZone };
    case "interval": {
      const everyMinutes = integer(schedule.everyMinutes, "schedule.everyMinutes");
      return {
        kind,
        everyMinutes,
        anchor: optionalString(schedule.anchor, "schedule.anchor") ?? (/* @__PURE__ */ new Date()).toISOString(),
        timeZone
      };
    }
    case "daily":
      return { kind, time: string(schedule.time, "schedule.time"), timeZone };
    case "weekly": {
      if (!Array.isArray(schedule.weekdays)) throw new RpcRequestError("schedule.weekdays must be an array");
      const weekdays = schedule.weekdays.map((value) => {
        const number = integer(value, "schedule.weekdays[]");
        const weekday = WEEKDAYS[number - 1];
        if (weekday === void 0) throw new RpcRequestError("schedule.weekdays must contain numbers from 1 to 7");
        return weekday;
      });
      return { kind, time: string(schedule.time, "schedule.time"), weekdays, timeZone };
    }
    case "hourly":
      return { kind, minute: integer(schedule.minute, "schedule.minute"), timeZone };
    case "monthly":
      return { kind, day: integer(schedule.day, "schedule.day"), time: string(schedule.time, "schedule.time"), timeZone };
    case "custom":
      return { kind, everyDays: integer(schedule.everyDays, "schedule.everyDays"), time: string(schedule.time, "schedule.time"), timeZone };
    default:
      throw new RpcRequestError("schedule.kind must be once, interval, daily, weekly, hourly, monthly, or custom");
  }
}
function toClientSchedule(schedule) {
  if (schedule.kind !== "weekly") return { ...schedule };
  return {
    ...schedule,
    weekdays: schedule.weekdays.map((day) => WEEKDAYS.indexOf(day) + 1)
  };
}
function errorResult(error, aborted = false) {
  if (aborted) {
    return {
      ok: false,
      error: { code: "cancelled", message: "自动化请求已取消。", details: {} }
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  const badRequest = isBadRequest(error);
  return {
    ok: false,
    error: {
      code: badRequest ? "bad-request" : "internal",
      message: badRequest ? message : "自动化服务暂时无法完成请求。",
      details: badRequest ? { issues: [] } : {}
    }
  };
}
function scopeOf(payload) {
  const sessionId = typeof payload.sessionId === "string" && payload.sessionId.trim() !== "" ? payload.sessionId.trim() : "settings";
  return { sessionId, creatorKind: "web", hostWide: true };
}
async function snapshotValue(service, payload, signal) {
  const snapshot = await service.snapshot(scopeOf(payload), signal);
  const names = new Map(snapshot.definitions.map((definition) => [definition.id, definition.name]));
  return {
    scope: {
      workspaceId: snapshot.workspace?.id,
      workspaceName: snapshot.workspace?.title,
      cwd: snapshot.workspace?.path ?? ""
    },
    workspaces: snapshot.workspaces,
    models: snapshot.models,
    modelFailures: snapshot.modelFailures,
    defaultModel: snapshot.defaultModel,
    skills: snapshot.skills,
    permissions: snapshot.permissions,
    defaultPermission: snapshot.defaultPermission,
    automations: snapshot.definitions.map((definition) => ({
      id: definition.id,
      revision: definition.revision,
      name: definition.name,
      prompt: definition.prompt,
      status: definition.status,
      schedule: toClientSchedule(definition.schedule),
      scheduleSummary: definition.rrule,
      timeZone: definition.timeZone,
      permission: definition.permissionPreset,
      maxConcurrentRuns: definition.maxConcurrentRuns ?? 1,
      ...definition.nextRunAt === null ? {} : { nextRunAt: definition.nextRunAt },
      ...definition.lastRun === null ? {} : {
        lastRunAt: definition.lastRun.finishedAt ?? definition.lastRun.startedAt ?? definition.lastRun.scheduledFor,
        lastRunStatus: definition.lastRun.error?.code === "host_interrupted" ? "interrupted" : definition.lastRun.status
      },
      workspaceId: definition.workspaceId,
      cwd: definition.cwd,
      provider: definition.provider,
      model: definition.model,
      reasoningEffort: definition.reasoningEffort,
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt
    })),
    runs: snapshot.runs.map((run) => ({
      id: run.id,
      automationId: run.automationId,
      automationName: names.get(run.automationId) ?? run.automationName ?? run.automationId,
      status: run.error?.code === "host_interrupted" ? "interrupted" : run.status,
      trigger: run.trigger,
      scheduledFor: run.scheduledFor,
      ...run.startedAt === null ? {} : { startedAt: run.startedAt },
      ...run.finishedAt === null ? {} : { finishedAt: run.finishedAt },
      ...run.sessionId === null ? {} : { sessionId: run.sessionId },
      ...run.summary === null ? {} : { summary: run.summary },
      ...run.error === null ? {} : { error: run.error.message },
      unread: run.unread
    })),
    serverNow: snapshot.generatedAt
  };
}
function registerAutomationRpc(ctx, service) {
  return ctx.connection.rpc.handle("/dsh-automation", async (endpoint, rawPayload, signal) => {
    try {
      const payload = record(rawPayload, "payload");
      switch (endpoint) {
        case "snapshot":
          return { ok: true, value: await snapshotValue(service, payload, signal) };
        case "create": {
          const input = record(payload.input, "input");
          const timeZone = string(input.timeZone, "input.timeZone");
          const created = await service.create(scopeOf(payload), {
            name: string(input.name, "input.name", 200),
            prompt: string(input.prompt, "input.prompt", 1e5),
            schedule: toDomainSchedule(input.schedule, timeZone),
            permissionPreset: string(input.permission, "input.permission"),
            ...input.maxConcurrentRuns === void 0 ? {} : { maxConcurrentRuns: positiveInteger(input.maxConcurrentRuns, "input.maxConcurrentRuns") },
            ...input.workspaceId === void 0 ? {} : { workspaceId: string(input.workspaceId, "input.workspaceId") },
            ...input.cwd === void 0 ? {} : { cwd: string(input.cwd, "input.cwd") },
            ...input.provider === void 0 ? {} : { provider: input.provider === null ? null : string(input.provider, "input.provider") },
            ...input.model === void 0 ? {} : { model: input.model === null ? null : string(input.model, "input.model") },
            ...input.reasoningEffort === void 0 ? {} : { reasoningEffort: input.reasoningEffort === null ? null : string(input.reasoningEffort, "input.reasoningEffort") }
          }, signal);
          return { ok: true, value: { id: created.id } };
        }
        case "mutate": {
          const id = string(payload.automationId, "automationId");
          const mutation = string(payload.mutation, "mutation");
          if (mutation === "delete") {
            return { ok: true, value: await service.delete(scopeOf(payload), id, signal) };
          }
          if (mutation !== "pause" && mutation !== "resume") {
            throw new RpcRequestError("mutation must be pause, resume, or delete");
          }
          const value = await service.update(scopeOf(payload), id, {
            status: mutation === "pause" ? "paused" : "active"
          }, signal);
          return { ok: true, value: { id: value.id, revision: value.revision } };
        }
        case "update": {
          const id = string(payload.automationId, "automationId");
          const input = record(payload.input, "input");
          const timeZone = string(input.timeZone, "input.timeZone");
          const value = await service.update(scopeOf(payload), id, {
            name: string(input.name, "input.name", 200),
            prompt: string(input.prompt, "input.prompt", 1e5),
            schedule: toDomainSchedule(input.schedule, timeZone),
            permissionPreset: string(input.permission, "input.permission"),
            ...input.maxConcurrentRuns === void 0 ? {} : { maxConcurrentRuns: positiveInteger(input.maxConcurrentRuns, "input.maxConcurrentRuns") },
            ...input.workspaceId === void 0 ? {} : { workspaceId: string(input.workspaceId, "input.workspaceId") },
            ...input.cwd === void 0 ? {} : { cwd: string(input.cwd, "input.cwd") },
            ...input.provider === void 0 ? {} : { provider: input.provider === null ? null : string(input.provider, "input.provider") },
            ...input.model === void 0 ? {} : { model: input.model === null ? null : string(input.model, "input.model") },
            ...input.reasoningEffort === void 0 ? {} : { reasoningEffort: input.reasoningEffort === null ? null : string(input.reasoningEffort, "input.reasoningEffort") }
          }, signal);
          return { ok: true, value: { id: value.id, revision: value.revision } };
        }
        case "run-now": {
          const run = await service.runNow(scopeOf(payload), string(payload.automationId, "automationId"), signal);
          return { ok: true, value: { runId: run.id } };
        }
        case "mark-read": {
          const run = await service.markRead(scopeOf(payload), string(payload.runId, "runId"), signal);
          return { ok: true, value: { runId: run.id, unread: run.unread } };
        }
        case "adopt-session": {
          await service.adoptSession(string(payload.sessionId, "sessionId"));
          return { ok: true, value: { sessionId: string(payload.sessionId, "sessionId") } };
        }
        case "forget-session": {
          await service.forgetSession(string(payload.sessionId, "sessionId"));
          return { ok: true, value: { sessionId: string(payload.sessionId, "sessionId") } };
        }
        case "forget-automation-sessions": {
          await service.forgetAutomationSessions(string(payload.automationId, "automationId"));
          return { ok: true, value: { automationId: string(payload.automationId, "automationId") } };
        }
        default:
          throw new RpcRequestError(`unknown automation endpoint '${endpoint}'`);
      }
    } catch (error) {
      if (!signal.aborted && !isBadRequest(error)) {
        const detail = error instanceof Error ? error.stack ?? error.message : String(error);
        ctx.logger.warn(`omnimux-automation: RPC '${endpoint}' failed: ${detail}`);
      }
      return errorResult(error, signal.aborted);
    }
  }, { authority: "loopback" });
}
export {
  registerAutomationRpc
};
