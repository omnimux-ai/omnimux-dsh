import { defineTool } from "@deepseek-ai/dsh-tools";
import { AUTOMATION_CREATE_DESCRIPTION } from "./prompt.js";
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const SCHEDULE_FIELDS = [
  "time_zone",
  "at",
  "every_minutes",
  "minute",
  "time",
  "weekdays",
  "month_day",
  "every_days"
];
function render(_args, value) {
  return [{ type: "text", text: JSON.stringify(value) }];
}
const JSON_OUTPUT = {
  schema: { type: "json" },
  render
};
function json(value) {
  return JSON.parse(JSON.stringify(value));
}
function present(title, kind, rawInput) {
  return { card: "generic", title, kind, ...rawInput === void 0 ? {} : { rawInput } };
}
function validateScheduleSelector(args) {
  const presentFields = SCHEDULE_FIELDS.filter((field) => args[field] !== void 0);
  if (args.kind === void 0) {
    if (presentFields.length > 0) throw new Error("修改计划字段时必须提供 kind");
    return;
  }
  const required = args.kind === "once" ? ["time_zone", "at"] : args.kind === "interval" ? ["time_zone", "every_minutes"] : args.kind === "hourly" ? ["time_zone", "minute"] : args.kind === "weekly" ? ["time_zone", "time", "weekdays"] : args.kind === "monthly" ? ["time_zone", "time", "month_day"] : args.kind === "custom" ? ["time_zone", "time", "every_days"] : ["time_zone", "time"];
  const allowed = new Set(required);
  const missing = required.filter((field) => args[field] === void 0);
  if (missing.length > 0) throw new Error(`${args.kind} 计划需要 ${missing.join(", ")}`);
  const unrelated = presentFields.filter((field) => !allowed.has(field));
  if (unrelated.length > 0) throw new Error(`${args.kind} 计划不接受 ${unrelated.join(", ")}`);
}
function scheduleFromArgs(args, now) {
  validateScheduleSelector(args);
  const timeZone = String(args.time_zone ?? "");
  switch (args.kind) {
    case "once":
      return { kind: "once", at: String(args.at ?? ""), timeZone };
    case "interval":
      return { kind: "interval", everyMinutes: Number(args.every_minutes), anchor: now, timeZone };
    case "hourly":
      return { kind: "hourly", minute: Number(args.minute), timeZone };
    case "daily":
      return { kind: "daily", time: String(args.time ?? ""), timeZone };
    case "weekly": {
      const weekdays = Array.isArray(args.weekdays) ? args.weekdays.map(String) : [];
      if (weekdays.some((day) => !WEEKDAYS.includes(day))) throw new Error("weekdays 包含无效值");
      return { kind: "weekly", weekdays, time: String(args.time ?? ""), timeZone };
    }
    case "monthly":
      return { kind: "monthly", day: Number(args.month_day), time: String(args.time ?? ""), timeZone };
    case "custom":
      return { kind: "custom", everyDays: Number(args.every_days), time: String(args.time ?? ""), timeZone };
    default:
      throw new Error("kind 必须是 once、interval、hourly、daily、weekly、monthly 或 custom");
  }
}
function registerAutomationTools(service, agent) {
  const scope = { sessionId: agent.id, creatorKind: "agent" };
  const permissionNames = [...service.permissionNames()];
  const disposers = [];
  const register = (definition) => {
    disposers.push(agent.ctx.tools.register(definition));
  };
  try {
    register(defineTool({
      name: "automation_create",
      description: AUTOMATION_CREATE_DESCRIPTION,
      parameters: {
        name: { type: "string", required: true },
        prompt: { type: "string", required: true, description: "每次独立运行都使用的自包含任务说明。" },
        kind: { type: "string", required: true, enum: ["once", "interval", "hourly", "daily", "weekly", "monthly", "custom"] },
        time_zone: { type: "string", required: true, description: "IANA 时区，例如 Asia/Shanghai。" },
        at: { type: "string", description: "一次性计划的带偏移 ISO 时间。" },
        every_minutes: { type: "integer", description: "间隔计划的分钟数，最小 1。" },
        minute: { type: "integer", description: "每小时计划在第几分钟运行，范围 0-59。" },
        time: { type: "string", description: "每天、每周、每月或自定义计划的本地 HH:mm。" },
        weekdays: { type: "array", items: { type: "string", enum: WEEKDAYS } },
        month_day: { type: "integer", description: "每月计划在第几日运行，范围 1-31。" },
        every_days: { type: "integer", description: "自定义计划每隔几天运行，范围 1-365。" },
        max_concurrent_runs: { type: "integer", description: "同一自动化的并发运行上限，必须为正整数，默认 1" },
        permission: { type: "string", enum: permissionNames }
      },
      output: JSON_OUTPUT,
      async execute(args, exec) {
        if (exec.agent !== agent || exec.signal.aborted) return json({ ok: false, code: "cancelled" });
        try {
          const value = await service.create(scope, {
            name: args.name,
            prompt: args.prompt,
            schedule: scheduleFromArgs(args, (/* @__PURE__ */ new Date()).toISOString()),
            ...args.max_concurrent_runs === void 0 ? {} : { maxConcurrentRuns: args.max_concurrent_runs },
            ...args.permission === void 0 ? {} : { permissionPreset: args.permission }
          }, exec.signal);
          return json({ ok: true, automation: value });
        } catch (error) {
          if (exec.signal.aborted) return json({ ok: false, code: "cancelled" });
          return json({ ok: false, code: "automation_error", message: error instanceof Error ? error.message : String(error) });
        }
      },
      presentCall: (args) => present("创建自动化", "other", args.name)
    }));
    register(defineTool({
      name: "automation_list",
      description: "列出当前工作区的自动化规则、下次运行时间和最近一次结果。",
      parameters: {},
      output: JSON_OUTPUT,
      async execute(_args, exec) {
        if (exec.agent !== agent || exec.signal.aborted) return json({ ok: false, code: "cancelled" });
        try {
          const snapshot = await service.snapshot(scope, exec.signal);
          return json({
            ok: true,
            generatedAt: snapshot.generatedAt,
            workspace: snapshot.workspace,
            automations: snapshot.definitions
          });
        } catch (error) {
          if (exec.signal.aborted) return json({ ok: false, code: "cancelled" });
          return json({ ok: false, code: "automation_error", message: error instanceof Error ? error.message : String(error) });
        }
      },
      presentCall: () => present("列出自动化", "read")
    }));
    register(defineTool({
      name: "automation_update",
      description: "更新当前工作区中一条自动化的名称、任务说明、计划、权限或暂停/恢复状态。仅暂停不需要其他字段。",
      parameters: {
        id: { type: "string", required: true },
        name: { type: "string" },
        prompt: { type: "string" },
        status: { type: "string", enum: ["active", "paused"] },
        kind: { type: "string", enum: ["once", "interval", "hourly", "daily", "weekly", "monthly", "custom"] },
        time_zone: { type: "string" },
        at: { type: "string" },
        every_minutes: { type: "integer" },
        minute: { type: "integer" },
        time: { type: "string" },
        weekdays: { type: "array", items: { type: "string", enum: WEEKDAYS } },
        month_day: { type: "integer" },
        every_days: { type: "integer" },
        max_concurrent_runs: { type: "integer", description: "同一自动化的并发运行上限，必须为正整数，默认 1" },
        permission: { type: "string", enum: permissionNames }
      },
      output: JSON_OUTPUT,
      async execute(args, exec) {
        if (exec.agent !== agent || exec.signal.aborted) return json({ ok: false, code: "cancelled" });
        try {
          validateScheduleSelector(args);
          const input = {};
          if (args.name !== void 0) input.name = String(args.name);
          if (args.prompt !== void 0) input.prompt = String(args.prompt);
          if (args.status !== void 0) input.status = args.status;
          if (args.max_concurrent_runs !== void 0) input.maxConcurrentRuns = args.max_concurrent_runs;
          if (args.permission !== void 0) input.permissionPreset = args.permission;
          if (args.kind !== void 0) input.schedule = scheduleFromArgs(args, (/* @__PURE__ */ new Date()).toISOString());
          if (Object.keys(input).length === 0) throw new Error("automation_update 至少需要一个变更字段");
          const value = await service.update(scope, args.id, input, exec.signal);
          return json({ ok: true, automation: value });
        } catch (error) {
          if (exec.signal.aborted) return json({ ok: false, code: "cancelled" });
          return json({ ok: false, code: "automation_error", message: error instanceof Error ? error.message : String(error) });
        }
      },
      presentCall: (args) => present("更新自动化", "other", args.id)
    }));
    register(defineTool({
      name: "automation_runs",
      description: "读取当前工作区有界的自动化运行历史，包括失败、跳过、摘要和结果 Session。",
      parameters: {},
      output: JSON_OUTPUT,
      async execute(_args, exec) {
        if (exec.agent !== agent || exec.signal.aborted) return json({ ok: false, code: "cancelled" });
        try {
          const snapshot = await service.snapshot(scope, exec.signal);
          return json({ ok: true, generatedAt: snapshot.generatedAt, runs: snapshot.runs });
        } catch (error) {
          if (exec.signal.aborted) return json({ ok: false, code: "cancelled" });
          return json({ ok: false, code: "automation_error", message: error instanceof Error ? error.message : String(error) });
        }
      },
      presentCall: () => present("读取运行历史", "read")
    }));
    register(defineTool({
      name: "automation_run_now",
      description: "立即排队执行一次已有自动化。仍会使用全新 Session 和该规则保存的权限边界。",
      parameters: { id: { type: "string", required: true } },
      output: JSON_OUTPUT,
      async execute(args, exec) {
        if (exec.agent !== agent || exec.signal.aborted) return json({ ok: false, code: "cancelled" });
        try {
          return json({ ok: true, run: await service.runNow(scope, args.id, exec.signal) });
        } catch (error) {
          if (exec.signal.aborted) return json({ ok: false, code: "cancelled" });
          return json({ ok: false, code: "automation_error", message: error instanceof Error ? error.message : String(error) });
        }
      },
      presentCall: (args) => present("立即运行自动化", "other", args.id)
    }));
    register(defineTool({
      name: "automation_delete",
      description: "删除当前工作区的自动化定义，但保留运行历史用于审计。",
      parameters: { id: { type: "string", required: true } },
      output: JSON_OUTPUT,
      async execute(args, exec) {
        if (exec.agent !== agent || exec.signal.aborted) return json({ ok: false, code: "cancelled" });
        try {
          return json({ ok: true, value: await service.delete(scope, args.id, exec.signal) });
        } catch (error) {
          if (exec.signal.aborted) return json({ ok: false, code: "cancelled" });
          return json({ ok: false, code: "automation_error", message: error instanceof Error ? error.message : String(error) });
        }
      },
      presentCall: (args) => present("删除自动化", "other", args.id)
    }));
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    throw error;
  }
  return () => {
    for (const dispose of disposers.reverse()) dispose();
  };
}
export {
  registerAutomationTools
};
