import { formatRunStamp } from "../run-title.js";
function formatRunTrigger(trigger, t) {
  return t(`run.trigger.${trigger}`);
}
class AutomationFormError extends Error {
  constructor(key) {
    super(key);
    this.key = key;
  }
  key;
}
const SKILL_GESTURE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function skillGestureToken(skill) {
  const raw = SKILL_GESTURE_NAME.test(skill.name) ? skill.name : skill.id;
  return `/${raw}`;
}
function insertSkillGesture(prompt, token, caret) {
  const normalized = token.startsWith("/") ? token : `/${token}`;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`).test(prompt)) {
    return { text: prompt, caret: Math.min(Math.max(caret, 0), prompt.length) };
  }
  const at = Math.min(Math.max(caret, 0), prompt.length);
  const prefix = prompt.slice(0, at);
  const suffix = prompt.slice(at);
  const lead = prefix.length > 0 && !/\s$/.test(prefix) ? " " : "";
  const inserted = `${lead}${normalized} `;
  return { text: prefix + inserted + suffix, caret: prefix.length + inserted.length };
}
function localDateTimeValue(date = /* @__PURE__ */ new Date()) {
  const future = new Date(date.getTime() + 60 * 60 * 1e3);
  future.setMinutes(0, 0, 0);
  const offset = future.getTimezoneOffset() * 6e4;
  return new Date(future.getTime() - offset).toISOString().slice(0, 16);
}
function defaultFormState(now = /* @__PURE__ */ new Date(), workspaces = [], defaultModel, defaultPermission = "") {
  return {
    name: "",
    prompt: "",
    scheduleKind: "daily",
    onceAt: localDateTimeValue(now),
    everyMinutes: "60",
    maxConcurrentRuns: "1",
    intervalAnchor: "",
    time: "09:00",
    weekdays: [1, 2, 3, 4, 5],
    hourlyMinute: "00",
    monthDay: "1",
    customDays: "2",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    permission: defaultPermission,
    workspaceId: workspaces[0]?.id ?? "",
    modelKey: defaultModel === void 0 || defaultModel === null ? "default" : `${defaultModel.provider}::${defaultModel.model}`,
    reasoningEffort: defaultModel?.reasoning?.defaultEffort ?? "none",
    skills: []
  };
}
function buildCreateInput(form, workspaces, models, now = /* @__PURE__ */ new Date(), options = {}) {
  const maxConcurrentRuns = Number(form.maxConcurrentRuns);
  if (!Number.isSafeInteger(maxConcurrentRuns) || maxConcurrentRuns < 1) throw new AutomationFormError("form.error.maxConcurrentRuns");
  const name = form.name.trim();
  const prompt = form.prompt.trim();
  if (name === "") throw new AutomationFormError("form.error.name");
  if (prompt === "") throw new AutomationFormError("form.error.prompt");
  const workspace = workspaces.find((item) => item.id === form.workspaceId);
  if (workspace === void 0) throw new AutomationFormError("form.error.workspace");
  let schedule;
  switch (form.scheduleKind) {
    case "once": {
      const at = new Date(form.onceAt);
      if (!Number.isFinite(at.getTime()) || options.allowPastOnce !== true && at.getTime() <= now.getTime()) {
        throw new AutomationFormError("form.error.once");
      }
      schedule = { kind: "once", at: at.toISOString(), timeZone: form.timeZone };
      break;
    }
    case "interval": {
      const everyMinutes = Number(form.everyMinutes);
      if (!Number.isInteger(everyMinutes) || everyMinutes < 1 || everyMinutes > 43200) {
        throw new AutomationFormError("form.error.interval");
      }
      schedule = {
        kind: "interval",
        everyMinutes,
        anchor: form.intervalAnchor.trim() || now.toISOString(),
        timeZone: form.timeZone
      };
      break;
    }
    case "daily":
      schedule = { kind: "daily", time: form.time, timeZone: form.timeZone };
      break;
    case "weekly":
      if (form.weekdays.length === 0) throw new AutomationFormError("form.error.weekdays");
      schedule = { kind: "weekly", time: form.time, weekdays: [...form.weekdays].sort((a, b) => a - b), timeZone: form.timeZone };
      break;
    case "hourly": {
      const minute = Number(form.hourlyMinute);
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new AutomationFormError("form.error.interval");
      schedule = { kind: "hourly", minute, timeZone: form.timeZone };
      break;
    }
    case "monthly": {
      const day = Number(form.monthDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) throw new AutomationFormError("form.error.interval");
      schedule = { kind: "monthly", day, time: form.time, timeZone: form.timeZone };
      break;
    }
    case "custom": {
      const everyDays = Number(form.customDays);
      if (!Number.isInteger(everyDays) || everyDays < 1) throw new AutomationFormError("form.error.interval");
      schedule = { kind: "custom", everyDays, time: form.time, timeZone: form.timeZone };
      break;
    }
  }
  const selected = models.find((item) => `${item.provider}::${item.model}` === form.modelKey);
  return {
    name,
    prompt,
    schedule,
    timeZone: form.timeZone,
    permission: form.permission,
    maxConcurrentRuns,
    workspaceId: workspace.id,
    cwd: workspace.path,
    ...selected === void 0 ? { provider: null, model: null } : { provider: selected.provider, model: selected.model },
    reasoningEffort: form.reasoningEffort === "none" ? null : form.reasoningEffort
  };
}
function formatRelativeTime(iso, now, t) {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return iso;
  const deltaMinutes = Math.round((value - now.getTime()) / 6e4);
  const abs = Math.abs(deltaMinutes);
  if (abs < 1) return t("time.now");
  const future = deltaMinutes > 0;
  if (abs < 60) return t(future ? "time.inMinute" : "time.minuteAgo", { count: abs });
  const hours = Math.round(abs / 60);
  if (hours < 24) return t(future ? "time.inHour" : "time.hourAgo", { count: hours });
  const days = Math.round(hours / 24);
  return t(future ? "time.inDay" : "time.dayAgo", { count: days });
}
function shortSessionId(sessionId) {
  return sessionId.length <= 12 ? sessionId : `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}
function formatSchedule(schedule, t) {
  switch (schedule.kind) {
    case "once":
      return t("schedule.onceAt", { time: formatRunStamp(schedule.at, schedule.timeZone) });
    case "interval":
      return t("schedule.everyMinutes", { count: schedule.everyMinutes });
    case "daily":
      return t("schedule.dailyAt", { time: schedule.time });
    case "weekly": {
      const days = schedule.weekdays.map((day) => t(`day.${day}`)).join("、");
      return t("schedule.weeklyAt", { days, time: schedule.time });
    }
    case "hourly":
      return t("schedule.hourlyAt", { minute: String(schedule.minute).padStart(2, "0") });
    case "monthly":
      return t("schedule.monthlyAt", { day: schedule.day, time: schedule.time });
    case "custom":
      return t("schedule.customAt", { count: schedule.everyDays, time: schedule.time });
  }
}
function workspaceLabel(item, workspaces) {
  const found = workspaces.find((workspace) => workspace.id === item.workspaceId);
  return found?.title || item.cwd || item.workspaceId || "-";
}
function formatWithin(iso, now, t) {
  const delta = Date.parse(iso) - now.getTime();
  if (!Number.isFinite(delta) || delta <= 0) return t("time.now");
  const minutes = Math.max(1, Math.ceil(delta / 6e4));
  if (minutes < 60) return t("time.withinMinute", { count: minutes });
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return t("time.withinHour", { count: hours });
  return t("time.withinDay", { count: Math.ceil(hours / 24) });
}
function formatDuration(startedAt, finishedAt) {
  if (startedAt === void 0 || finishedAt === void 0) return void 0;
  const seconds = (Date.parse(finishedAt) - Date.parse(startedAt)) / 1e3;
  if (!Number.isFinite(seconds) || seconds < 0) return void 0;
  return `${seconds.toFixed(1)}s`;
}
function formFromAutomation(item, workspaces = [], defaultModel, defaultPermission = item.permission) {
  const base = defaultFormState(/* @__PURE__ */ new Date(), workspaces, defaultModel, defaultPermission);
  const schedule = item.schedule;
  const modelKey = item.provider && item.model ? `${item.provider}::${item.model}` : "default";
  const common = {
    ...base,
    name: item.name,
    prompt: item.prompt,
    permission: item.permission,
    maxConcurrentRuns: String(item.maxConcurrentRuns ?? 1),
    workspaceId: item.workspaceId ?? base.workspaceId,
    modelKey,
    reasoningEffort: item.reasoningEffort ?? "none",
    timeZone: item.timeZone || schedule.timeZone || base.timeZone
  };
  switch (schedule.kind) {
    case "once":
      return { ...common, scheduleKind: "once", onceAt: toLocalInput(schedule.at) };
    case "interval":
      return {
        ...common,
        scheduleKind: "interval",
        everyMinutes: String(schedule.everyMinutes),
        intervalAnchor: schedule.anchor ?? ""
      };
    case "hourly":
      return { ...common, scheduleKind: "hourly", hourlyMinute: String(schedule.minute).padStart(2, "0") };
    case "daily":
      return { ...common, scheduleKind: "daily", time: schedule.time };
    case "weekly":
      return { ...common, scheduleKind: "weekly", time: schedule.time, weekdays: [...schedule.weekdays] };
    case "monthly":
      return { ...common, scheduleKind: "monthly", time: schedule.time, monthDay: String(schedule.day) };
    case "custom":
      return { ...common, scheduleKind: "custom", time: schedule.time, customDays: String(schedule.everyDays) };
  }
}
function toLocalInput(iso) {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return localDateTimeValue();
  const offset = value.getTimezoneOffset() * 6e4;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
function prettyModelName(model) {
  return model.split(/[-_]/g).map((part) => {
    if (part.toLowerCase() === "deepseek") return "DeepSeek";
    if (/^v\d/i.test(part)) return part.slice(0, 1).toUpperCase() + part.slice(1);
    if (part === "") return part;
    return part.slice(0, 1).toUpperCase() + part.slice(1);
  }).join("-");
}
export {
  AutomationFormError,
  buildCreateInput,
  defaultFormState,
  formFromAutomation,
  formatDuration,
  formatRelativeTime,
  formatRunTrigger,
  formatSchedule,
  formatWithin,
  insertSkillGesture,
  localDateTimeValue,
  prettyModelName,
  shortSessionId,
  skillGestureToken,
  workspaceLabel,
};
