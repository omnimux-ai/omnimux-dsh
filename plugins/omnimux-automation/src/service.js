import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SessionId } from "@deepseek-ai/dsh-session";
import { WorkspaceId } from "@deepseek-ai/dsh-workspace";
import {
  automationDomainSpec,
  createDefinition,
  createManualRun,
  createScheduledRun,
  deleteDefinition,
  updateDefinition
} from "./domain.js";
import { executeAutomationRun } from "./executor.js";
import {
  isEqualSchedule,
  latestDueOccurrence,
  nextOccurrence
} from "./recurrence.js";
import {
  normalizePermissionPreset
} from "./permission-presets.js";
const MAX_TIMER_DELAY_MS = 2147483647;
const OPTION_CACHE_TTL_MS = 3e4;
const AUTOMATION_SESSION_PREFIX = "dsh-automation-session-";
class AutomationRequestError extends Error {
  name = "AutomationRequestError";
}
function asMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function toIso(ms = Date.now()) {
  return new Date(ms).toISOString();
}
function throwIfCancelled(signal) {
  if (signal?.aborted === true)
    throw new AutomationRequestError("自动化请求已取消。");
}
function compareRuns(left, right) {
  return Date.parse(right.scheduledFor) - Date.parse(left.scheduledFor) || right.id.localeCompare(left.id);
}
class AutomationService {
  constructor(ctx, domain, config) {
    this.ctx = ctx;
    this.domain = domain;
    this.config = config;
  }
  ctx;
  domain;
  config;
  definitions;
  runs;
  timer;
  operationTail = Promise.resolve();
  pumpScheduled = false;
  requested = false;
  started = false;
  stopping = false;
  optionCatalogCache;
  active = /* @__PURE__ */ new Map();
  static async open(ctx, config) {
    const domain = await ctx.storageDomain.open(automationDomainSpec);
    try {
      const service = new AutomationService(ctx, domain, config);
      service.definitions = domain.table("definitions");
      service.runs = domain.table("runs");
      await service.migratePermissionPresets();
      await service.recoverInterruptedRuns();
      await service.reconcileMissingSessions();
      await service.pruneAllHistory();
      return service;
    } catch (error) {
      await domain.close().catch(() => {
      });
      throw error;
    }
  }
  start() {
    if (this.started || this.stopping) return;
    this.started = true;
    this.requestPump();
  }
  ownsSession(sessionId, events = []) {
    if (sessionId.startsWith(AUTOMATION_SESSION_PREFIX)) return true;
    if ([...this.runs.entries()].some(([, run]) => run.sessionId === sessionId))
      return true;
    return events.some((event) => {
      if (event.type !== "user/message" || typeof event.data !== "object" || event.data === null)
        return false;
      const source = event.data.source;
      return typeof source === "object" && source !== null && source.kind === "automation";
    });
  }
  permissionNames() {
    return this.permissionPresets().names;
  }
  permissionOptions() {
    const presets = this.permissionPresets();
    return presets.names.map((name) => presets.optionOf(name));
  }
  defaultPermission() {
    const presets = this.permissionPresets();
    const value = normalizePermissionPreset(
      presets.defaultPreset,
      presets.names
    );
    if (value === void 0)
      throw new Error("Host 的默认权限预设不在官方权限列表中。");
    return value;
  }
  async dispose() {
    this.stopping = true;
    this.clearTimer();
    const pendingOperations = this.operationTail;
    const handles = [...this.active.values()];
    for (const handle of handles) handle.abort.abort();
    await Promise.allSettled([
      pendingOperations,
      ...handles.map((handle) => handle.promise)
    ]);
    this.active.clear();
    await this.domain.close();
  }
  async snapshot(scope, signal) {
    return this.serialize(async () => {
      throwIfCancelled(signal);
      const now = toIso();
      const options = await this.collectOptions();
      const scoped = scope.hostWide === true ? void 0 : await this.resolveScope(scope);
      const workspaceId = scoped?.workspace.id;
      const definitions = [...this.definitions.entries()].map(([, definition]) => definition).filter(
        (definition) => workspaceId === void 0 || definition.workspaceId === workspaceId
      ).sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      );
      const runs = [...this.runs.entries()].map(([, run]) => run).filter(
        (run) => workspaceId === void 0 || run.targetSnapshot.workspaceId === workspaceId
      ).sort(compareRuns);
      const lastByAutomation = /* @__PURE__ */ new Map();
      for (const run of [...runs].reverse())
        lastByAutomation.set(run.automationId, run);
      return {
        generatedAt: now,
        workspace: scoped === void 0 ? null : {
          id: scoped.workspace.id,
          title: scoped.workspace.title ?? scoped.workspace.id,
          path: scoped.workspace.path
        },
        workspaces: options.workspaces,
        models: options.models,
        modelFailures: options.modelFailures,
        defaultModel: options.defaultModel,
        skills: options.skills,
        permissions: this.permissionOptions(),
        defaultPermission: this.defaultPermission(),
        definitions: definitions.map((definition) => ({
          ...definition,
          nextRunAt: definition.status === "active" ? nextOccurrence(definition.schedule, now) : null,
          lastRun: lastByAutomation.get(definition.id) ?? null
        })),
        runs
      };
    }, signal);
  }
  async create(scope, request, signal) {
    const definition = await this.serialize(async () => {
      throwIfCancelled(signal);
      const now = toIso();
      try {
        if (request.schedule.kind === "once" && nextOccurrence(request.schedule, now) === null) {
          throw new AutomationRequestError("一次性自动化必须安排在未来时间。");
        }
      } catch (error) {
        if (error instanceof AutomationRequestError) throw error;
        throw new AutomationRequestError(asMessage(error));
      }
      const target = await this.resolveCreateTarget(scope, request);
      let value;
      try {
        value = createDefinition({
          id: `automation_${randomUUID()}`,
          maxConcurrentRuns: request.maxConcurrentRuns ?? 1,
          name: request.name,
          prompt: request.prompt,
          schedule: request.schedule,
          workspaceId: target.workspaceId,
          cwd: target.cwd,
          agentPreset: target.agentPreset,
          provider: target.provider,
          model: target.model,
          ...request.reasoningEffort === void 0 ? {} : { reasoningEffort: request.reasoningEffort },
          permissionPreset: this.requirePermission(request.permissionPreset),
          createdBy: { kind: scope.creatorKind, sessionId: scope.sessionId },
          now
        });
      } catch (error) {
        throw new AutomationRequestError(asMessage(error));
      }
      await this.definitions.put(value.id, value);
      return value;
    }, signal);
    this.requestPump();
    return definition;
  }
  async update(scope, id, input, signal) {
    const next = await this.serialize(async () => {
      const current = await this.ownedDefinition(scope, id);
      throwIfCancelled(signal);
      const now = toIso();
      const { status, ...fields } = input;
      let normalizedFields = fields.permissionPreset === void 0 ? fields : {
        ...fields,
        permissionPreset: this.requirePermission(fields.permissionPreset)
      };
      if (fields.workspaceId !== void 0 || fields.cwd !== void 0) {
        const target = await this.resolveUpdateWorkspace(
          current,
          fields.workspaceId,
          fields.cwd
        );
        normalizedFields = {
          ...normalizedFields,
          workspaceId: target.id,
          cwd: target.path
        };
      }
      try {
        const scheduleChanged = fields.schedule !== void 0 && !isEqualSchedule(fields.schedule, current.schedule);
        if (scheduleChanged && fields.schedule?.kind === "once" && nextOccurrence(fields.schedule, now) === null) {
          throw new AutomationRequestError("一次性自动化必须安排在未来时间。");
        }
      } catch (error) {
        if (error instanceof AutomationRequestError) throw error;
        throw new AutomationRequestError(asMessage(error));
      }
      const statusChanged = status !== void 0 && status !== current.status;
      let value;
      try {
        value = Object.keys(normalizedFields).length === 0 && !statusChanged ? current : updateDefinition(current, {
          ...normalizedFields,
          ...status === void 0 ? {} : { status },
          now
        });
      } catch (error) {
        throw new AutomationRequestError(asMessage(error));
      }
      if (value !== current) await this.definitions.put(id, value);
      return value;
    }, signal);
    this.requestPump();
    return next;
  }
  async delete(scope, id, signal) {
    const deleted = await this.serialize(async () => {
      const current = await this.ownedDefinition(scope, id);
      throwIfCancelled(signal);
      deleteDefinition(current);
      for (const [runId, run] of this.runs.entries()) {
        if (run.automationId !== current.id) continue;
        if (run.automationName === current.name) continue;
        await this.runs.update(
          runId,
          (latest) => latest.automationId === current.id && latest.automationName !== current.name ? { ...latest, automationName: current.name } : latest
        );
      }
      return this.definitions.delete(id);
    }, signal);
    this.requestPump();
    return { id, deleted };
  }
  async runNow(scope, id, signal) {
    const run = await this.serialize(async () => {
      const definition = await this.ownedDefinition(scope, id);
      throwIfCancelled(signal);
      const limit = definition.maxConcurrentRuns ?? 1;
      const activeCount = [...this.runs.entries()].filter(
        ([, candidate]) => candidate.automationId === id && (candidate.status === "queued" || candidate.status === "running")
      ).length;
      if (activeCount >= limit)
        throw new AutomationRequestError(`该自动化已有排队或运行中的任务，已达到并发上限（${limit}）。`);
      const value = createManualRun(definition, toIso());
      await this.runs.put(value.id, value);
      return value;
    }, signal);
    this.requestPump();
    return run;
  }
  async markRead(scope, runId, signal) {
    return this.serialize(async () => {
      const run = this.runs.get(runId);
      if (run === void 0)
        throw new AutomationRequestError(`unknown automation run '${runId}'`);
      throwIfCancelled(signal);
      if (scope.hostWide !== true) {
        const { workspace } = await this.resolveScope(scope);
        if (run.targetSnapshot.workspaceId !== workspace.id) {
          throw new AutomationRequestError("该运行记录属于其他工作区。");
        }
      }
      return this.runs.update(
        runId,
        (current) => current.unread ? { ...current, unread: false } : current
      );
    }, signal);
  }
  async forgetSession(sessionId) {
    const id = sessionId.trim();
    if (id === "") return;
    await this.serialize(async () => {
      for (const [runId, run] of this.runs.entries()) {
        if (run.sessionId !== id) continue;
        await this.runs.update(
          runId,
          (latest) => latest.sessionId === id ? { ...latest, sessionId: null } : latest
        );
      }
    });
  }
  async reconcileMissingSessions() {
    const known = await this.knownSessionIds();
    if (known === void 0) return;
    await this.serialize(async () => {
      for (const [runId, run] of this.runs.entries()) {
        if (typeof run.sessionId !== "string" || run.sessionId === "") continue;
        if (known.has(run.sessionId)) continue;
        const missingSessionId = run.sessionId;
        await this.runs.update(
          runId,
          (latest) => latest.sessionId === missingSessionId ? { ...latest, sessionId: null } : latest
        );
      }
    });
  }
  async knownSessionIds() {
    const live = this.ctx.sessions;
    const persistence = this.ctx.get?.("sessionPersistence");
    if (typeof persistence?.list !== "function") return void 0;
    const ids = /* @__PURE__ */ new Set();
    let lists;
    try {
      lists = [
        typeof live?.list === "function" ? live.list() : [],
        await persistence.list()
      ];
    } catch (error) {
      this.ctx.logger.warn(
        `omnimux-automation: 会话枚举失败，本轮保留全部会话关联：${asMessage(error)}`
      );
      return void 0;
    }
    for (const list of lists) {
      if (!Array.isArray(list)) {
        this.ctx.logger.warn(
          "omnimux-automation: 会话枚举格式异常，本轮保留全部会话关联。"
        );
        return void 0;
      }
      for (const item of list) {
        const id = readListedSessionId(item);
        if (id === void 0) {
          this.ctx.logger.warn(
            "omnimux-automation: 会话枚举包含无效 ID，本轮保留全部会话关联。"
          );
          return void 0;
        }
        ids.add(id);
      }
    }
    return ids;
  }
  async forgetAutomationSessions(automationId) {
    const id = automationId.trim();
    if (id === "") return;
    await this.serialize(async () => {
      for (const [runId, run] of this.runs.entries()) {
        if (run.automationId !== id || run.sessionId === null) continue;
        await this.runs.update(
          runId,
          (latest) => latest.automationId === id && latest.sessionId !== null ? { ...latest, sessionId: null } : latest
        );
      }
    });
  }
  async adoptSession(sessionId) {
    const id = sessionId.trim();
    if (id === "") return;
    const run = [...this.runs.entries()].map(([, item]) => item).find((item) => item.sessionId === id);
    if (run === void 0) return;
    const workspace = this.ctx.workspaceRegistry.get(
      WorkspaceId(run.targetSnapshot.workspaceId)
    );
    if (workspace === void 0) return;
    await workspace.attachSession(SessionId(id));
  }
  async resolveUpdateWorkspace(current, workspaceId, cwd) {
    const requestedId = workspaceId?.trim() || current.workspaceId;
    const requestedPath = cwd?.trim() || current.cwd;
    const registry = this.ctx.workspaceRegistry;
    const byId = registry.get?.(WorkspaceId(requestedId));
    const byPath = await registry.resolveByPath?.(requestedPath);
    if (byId === void 0 || byPath === void 0 || String(byId.id) !== String(byPath.id) || String(byId.path) !== String(byPath.path)) {
      throw new AutomationRequestError(
        "更新后的工作区必须是同一个已注册目录。"
      );
    }
    return { id: String(byId.id), path: String(byId.path) };
  }
  async collectOptions() {
    const registry = this.ctx.workspaceRegistry;
    const raw = registry.list === void 0 ? registry.values === void 0 ? registry.entries === void 0 ? [] : [...registry.entries()].map(([, value]) => value) : [...registry.values()] : [...registry.list()];
    const workspaces = raw.map((item) => ({
      id: String(item.id ?? item.workspaceId ?? ""),
      title: String(item.title ?? item.name ?? item.id ?? item.path ?? ""),
      path: String(item.path ?? item.cwd ?? "")
    })).filter((item) => item.id !== "" && item.path !== "");
    const now = Date.now();
    let catalog = this.optionCatalogCache;
    if (catalog === void 0 || catalog.expiresAt <= now) {
      const collected = await collectModelOptions(this.ctx);
      catalog = {
        expiresAt: now + OPTION_CACHE_TTL_MS,
        models: collected.models,
        modelFailures: collected.failures,
        defaultModel: collected.defaultModel,
        skills: collectSkillOptions()
      };
      this.optionCatalogCache = catalog;
    }
    return {
      workspaces,
      models: catalog.models,
      modelFailures: catalog.modelFailures,
      defaultModel: catalog.defaultModel,
      skills: catalog.skills
    };
  }
  async resolveCreateTarget(scope, request) {
    const fallback = this.ctx.agentDefaultModel?.currentSelection?.();
    let workspaceId = request.workspaceId?.trim() ?? "";
    let cwd = request.cwd?.trim() ?? "";
    let agentPreset = request.agentPreset?.trim() || "standard";
    let provider = request.provider ?? fallback?.provider ?? null;
    let model = request.model ?? fallback?.model ?? null;
    if (workspaceId !== "" || cwd !== "") {
      const registry = this.ctx.workspaceRegistry;
      const byId = workspaceId === "" ? void 0 : registry.get?.(WorkspaceId(workspaceId));
      const byPath = cwd === "" ? void 0 : await registry.resolveByPath?.(cwd);
      if (workspaceId !== "" && cwd !== "" && (byId === void 0 || byPath === void 0 || String(byId.id) !== String(byPath.id) || String(byId.path) !== String(byPath.path))) {
        throw new AutomationRequestError(
          "创建任务的工作区 ID 和目录必须指向同一个已注册目录。"
        );
      }
      const workspace = byId ?? byPath;
      if (workspace === void 0)
        throw new AutomationRequestError("所选工作区不存在或目录未注册。");
      workspaceId = String(workspace.id);
      cwd = String(workspace.path);
    } else {
      const resolved = await this.resolveScope(scope);
      workspaceId = resolved.workspace.id;
      cwd = resolved.workspace.path;
      agentPreset = this.ctx.agentPresets.composedPreset(resolved.agent.ctx) ?? resolved.agent.session.header.agentPreset ?? agentPreset;
      const loggedSelection = resolved.agent.session.requestHeader()?.config;
      provider = request.provider ?? loggedSelection?.provider ?? provider;
      model = request.model ?? loggedSelection?.model ?? model;
    }
    return { workspaceId, cwd, agentPreset, provider, model };
  }
  async resolveScope(scope) {
    const agent = this.ctx.agents.get(SessionId(scope.sessionId));
    if (agent === void 0)
      throw new AutomationRequestError(
        "自动化界面或工具需要一个存活的来源 Session。"
      );
    const cwd = agent.session.header.cwd;
    if (cwd === void 0)
      throw new AutomationRequestError("来源 Session 没有工作区目录。");
    const workspace = await this.ctx.workspaceRegistry.resolveByPath(cwd);
    if (workspace === void 0)
      throw new AutomationRequestError(
        "来源 Session 目录尚未注册为 DSH 工作区。"
      );
    if (this.ctx.agents.get(SessionId(scope.sessionId)) !== agent) {
      throw new AutomationRequestError(
        "自动化界面或工具需要一个存活的来源 Session。"
      );
    }
    return { agent, workspace };
  }
  async ownedDefinition(scope, id) {
    const definition = this.definitions.get(id);
    if (definition === void 0)
      throw new AutomationRequestError(`unknown automation '${id}'`);
    if (scope.hostWide === true) return definition;
    const { workspace } = await this.resolveScope(scope);
    if (definition.workspaceId !== workspace.id)
      throw new AutomationRequestError("该自动化属于其他工作区。");
    return definition;
  }
  requestPump() {
    if (this.stopping || !this.started) return;
    this.clearTimer();
    this.requested = true;
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    void this.serialize(async () => {
      try {
        while (this.requested && !this.stopping) {
          this.requested = false;
          await this.pumpOnce();
        }
      } catch (error) {
        this.ctx.logger.warn(
          `omnimux-automation: scheduler pump failed: ${asMessage(error)}`
        );
        this.armRetryTimer();
      } finally {
        this.pumpScheduled = false;
      }
    }).catch((error) => {
      if (!this.stopping)
        this.ctx.logger.warn(
          `omnimux-automation: scheduler admission failed: ${asMessage(error)}`
        );
    });
  }
  async pumpOnce() {
    if (this.stopping) return;
    const now = toIso();
    const runsByAutomation = /* @__PURE__ */ new Map();
    for (const [, run] of this.runs.entries()) {
      const related = runsByAutomation.get(run.automationId) ?? [];
      related.push(run);
      runsByAutomation.set(run.automationId, related);
    }
    for (const [, definition] of this.definitions.entries()) {
      if (definition.status !== "active") continue;
      await this.claimLatestDue(
        definition,
        now,
        runsByAutomation.get(definition.id) ?? []
      );
    }
    if (this.stopping) return;
    await this.startQueuedRuns();
    if (this.stopping) return;
    this.armNextTimer(now);
  }
  async claimLatestDue(definition, now, related) {
    const scheduledFor = latestDueOccurrence(definition.schedule, now);
    if (scheduledFor === null || Date.parse(scheduledFor) <= Date.parse(definition.updatedAt))
      return;
    if (related.some(
      (run) => run.trigger === "schedule" && run.scheduledFor === scheduledFor
    ))
      return;
    const candidate = createScheduledRun(definition, scheduledFor);
    if (this.runs.get(candidate.id) !== void 0) return;
    const overlapping = related.filter(
      (run) => run.status === "queued" || run.status === "running"
    ).length >= (definition.maxConcurrentRuns ?? 1);
    const age = Date.parse(now) - Date.parse(scheduledFor);
    if (overlapping || age > this.config.misfireGraceMs) {
      const reason = overlapping ? { code: "overlap", message: "已达到该自动化的并发上限，本次已跳过。" } : {
        code: "misfire",
        message: "Host 恢复时已超出补跑窗口，本次已跳过。"
      };
      await this.runs.put(candidate.id, {
        ...candidate,
        status: "skipped",
        finishedAt: now,
        error: reason
      });
      await this.pruneWorkspaceHistory(candidate.targetSnapshot.workspaceId);
      return;
    }
    await this.runs.put(candidate.id, candidate);
  }
  async startQueuedRuns() {
    if (this.stopping) return;
    const activeCounts = /* @__PURE__ */ new Map();
    for (const id of this.active.keys()) {
      const automationId = this.runs.get(id)?.automationId;
      if (automationId !== void 0) activeCounts.set(automationId, (activeCounts.get(automationId) ?? 0) + 1);
    }
    const candidates = [...this.runs.entries()].map(([, run]) => run).filter((run) => run.status === "queued" && !this.active.has(run.id)).sort(
      (left, right) => Date.parse(left.scheduledFor) - Date.parse(right.scheduledFor)
    );
    const queued = [];
    for (const run of candidates) {
      const count = activeCounts.get(run.automationId) ?? 0;
      const limit = this.definitions.get(run.automationId)?.maxConcurrentRuns ?? 1;
      if (count >= limit) continue;
      activeCounts.set(run.automationId, count + 1);
      queued.push(run);
    }
    for (const run of queued) this.startRun(run);
  }
  startRun(run) {
    const abort = new AbortController();
    const promise = this.executeRun(run, abort.signal).catch(async (error) => {
      this.ctx.logger.warn(
        `omnimux-automation: run '${run.id}' failed outside its execution boundary: ${asMessage(error)}`
      );
      try {
        const current = this.runs.get(run.id);
        if (current === void 0 || current.status !== "queued" && current.status !== "running")
          return;
        await this.runs.put(run.id, {
          ...current,
          status: "failed",
          finishedAt: toIso(),
          error: { code: "executor_error", message: asMessage(error) },
          unread: true
        });
      } catch (persistError) {
        this.ctx.logger.warn(
          `omnimux-automation: failed to persist run failure: ${asMessage(persistError)}`
        );
      }
    }).finally(() => {
      this.active.delete(run.id);
      this.requestPump();
    });
    this.active.set(run.id, { abort, promise });
  }
  async executeRun(run, signal) {
    const definition = this.definitions.get(run.automationId);
    if (definition === void 0) {
      await this.runs.put(run.id, {
        ...run,
        status: "failed",
        finishedAt: toIso(),
        error: {
          code: "definition_deleted",
          message: "自动化定义在本次运行启动前已被删除。"
        }
      });
      await this.pruneWorkspaceHistory(run.targetSnapshot.workspaceId);
      return;
    }
    const startedAt = toIso();
    const sessionId = `${AUTOMATION_SESSION_PREFIX}${randomUUID()}`;
    const running = {
      ...run,
      status: "running",
      startedAt,
      sessionId
    };
    await this.runs.put(run.id, running);
    const completion = await executeAutomationRun(this.ctx, definition, run, {
      runTimeoutMs: this.config.runTimeoutMs,
      sessionId,
      signal
    });
    const finishedAt = toIso();
    const boundSessionId = completion.sessionId ?? running.sessionId;
    await this.runs.update(run.id, (current) => ({
      ...current,
      status: completion.status,
      sessionId: completion.sessionId ?? null,
      finishedAt,
      summary: completion.summary ?? null,
      error: completion.error ?? null,
      unread: true
    }));
    if (typeof boundSessionId === "string" && boundSessionId !== "") {
      await this.adoptSession(boundSessionId).catch(() => void 0);
    }
    await this.pruneWorkspaceHistory(run.targetSnapshot.workspaceId);
  }
  armNextTimer(now) {
    if (this.stopping) return;
    let target;
    for (const [, definition] of this.definitions.entries()) {
      if (definition.status !== "active") continue;
      const next = nextOccurrence(definition.schedule, now);
      if (next === null) continue;
      const candidate = Date.parse(next);
      if (target === void 0 || candidate < target) target = candidate;
    }
    if (target === void 0) return;
    const delay = Math.max(
      1,
      Math.min(target - Date.parse(now), MAX_TIMER_DELAY_MS)
    );
    this.timer = setTimeout(() => {
      this.timer = void 0;
      this.requestPump();
    }, delay);
  }
  armRetryTimer() {
    if (this.stopping || this.timer !== void 0) return;
    const delay = Math.max(
      1e3,
      Math.min(6e4, this.config.misfireGraceMs || 6e4)
    );
    this.timer = setTimeout(() => {
      this.timer = void 0;
      this.requestPump();
    }, delay);
  }
  clearTimer() {
    if (this.timer === void 0) return;
    clearTimeout(this.timer);
    this.timer = void 0;
  }
  serialize(operation, signal) {
    if (this.stopping) return Promise.reject(new Error("自动化服务正在停止。"));
    if (signal?.aborted === true)
      return Promise.reject(new Error("自动化请求已取消。"));
    const result = this.operationTail.then(async () => {
      throwIfCancelled(signal);
      return operation();
    });
    this.operationTail = result.then(
      () => {
      },
      () => {
      }
    );
    return result;
  }
  permissionPresets() {
    return this.ctx.permissionPresets;
  }
  requirePermission(input) {
    const presets = this.permissionPresets();
    if (input === void 0) return this.defaultPermission();
    const value = normalizePermissionPreset(input, presets.names);
    if (value === void 0)
      throw new AutomationRequestError(`unknown permission preset '${input}'`);
    return value;
  }
  /** 把旧版 full-access 及已移除的预设收敛到 Host 当前可用列表。 */
  async migratePermissionPresets() {
    const presets = this.permissionPresets();
    const fallback = this.defaultPermission();
    for (const [id, definition] of this.definitions.entries()) {
      const permissionPreset = normalizePermissionPreset(definition.permissionPreset, presets.names) ?? fallback;
      if (permissionPreset === definition.permissionPreset) continue;
      await this.definitions.put(id, { ...definition, permissionPreset });
    }
    for (const [id, run] of this.runs.entries()) {
      const permissionPreset = normalizePermissionPreset(
        run.targetSnapshot.permissionPreset,
        presets.names
      ) ?? fallback;
      if (permissionPreset === run.targetSnapshot.permissionPreset) continue;
      await this.runs.put(id, {
        ...run,
        targetSnapshot: { ...run.targetSnapshot, permissionPreset }
      });
    }
  }
  async recoverInterruptedRuns() {
    const finishedAt = toIso();
    for (const [id, run] of this.runs.entries()) {
      if (run.status !== "running") continue;
      await this.runs.put(id, {
        ...run,
        status: "failed",
        finishedAt,
        error: {
          code: "host_interrupted",
          message: "DSH Host 在本次运行到达终态前停止。"
        },
        unread: true
      });
    }
  }
  async pruneWorkspaceHistory(workspaceId) {
    const terminalByAutomation = /* @__PURE__ */ new Map();
    for (const run of [...this.runs.entries()].map(([, run2]) => run2).filter(
      (run2) => run2.targetSnapshot.workspaceId === workspaceId && run2.status !== "queued" && run2.status !== "running"
    )) {
      const existing = terminalByAutomation.get(run.automationId) ?? [];
      existing.push(run);
      terminalByAutomation.set(run.automationId, existing);
    }
    for (const terminal of terminalByAutomation.values()) {
      terminal.sort(compareRuns);
      for (const run of terminal.slice(this.config.historyLimit))
        await this.runs.delete(run.id);
    }
  }
  async pruneAllHistory() {
    const workspaces = new Set(
      [...this.runs.entries()].map(([, run]) => run.targetSnapshot.workspaceId)
    );
    for (const workspaceId of workspaces)
      await this.pruneWorkspaceHistory(workspaceId);
  }
}
function readListedSessionId(item) {
  if (typeof item !== "object" || item === null) return void 0;
  const value = item;
  const header = typeof value.header === "object" && value.header !== null ? value.header : void 0;
  for (const id of [header?.id, value.id]) {
    if (typeof id === "string" && id.trim() !== "") return id;
  }
  return void 0;
}
async function collectModelOptions(ctx) {
  const found = [];
  const failures = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (item) => {
    const { provider, model } = item;
    if (provider === "" || model === "") return;
    const key = `${provider}::${model}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(item);
  };
  const current = ctx.agentDefaultModel?.currentSelection?.() ?? null;
  const llm = ctx.llm;
  for (const item of llm?.listProviders?.() ?? []) {
    const provider = String(item.id ?? item.provider ?? "");
    if (provider === "") continue;
    const providerLabel = String(item.name ?? provider);
    try {
      const models = await llm?.listModels?.(provider) ?? [];
      const entries = await Promise.all(
        models.map(
          async (model) => {
            const modelId = String(model.id ?? "");
            if (modelId === "") return null;
            const resolved = llm?.resolveModelInfo === void 0 ? void 0 : await llm.resolveModelInfo(provider, modelId);
            const reasoning = resolved?.reasoning === void 0 ? void 0 : {
              efforts: resolved.reasoning.efforts.map(
                (effort) => ({
                  id: String(effort.id),
                  name: String(effort.name),
                  ...effort.description === void 0 ? {} : { description: String(effort.description) }
                })
              ),
              ...resolved.reasoning.defaultEffort === void 0 ? {} : {
                defaultEffort: String(
                  resolved.reasoning.defaultEffort
                )
              }
            };
            return {
              provider,
              providerLabel,
              model: modelId,
              label: model.name?.trim() || prettyModelLabel({}, provider, modelId),
              ...(resolved?.description ?? model.description) === void 0 ? {} : {
                description: String(
                  resolved?.description ?? model.description
                )
              },
              ...reasoning === void 0 ? {} : { reasoning }
            };
          }
        )
      );
      for (const entry of entries) {
        if (entry !== null) push(entry);
      }
    } catch (error) {
      failures.push({
        provider,
        providerLabel,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const defaultModel = current === null ? found[0] ?? null : found.find(
    (item) => item.provider === current.provider && item.model === current.model
  ) ?? found[0] ?? null;
  return { models: found, failures, defaultModel };
}
function prettyModelLabel(_item, _provider, model) {
  return model.split(/[-_]/g).map((part) => {
    if (part.toLowerCase() === "deepseek") return "DeepSeek";
    if (/^v\d/i.test(part))
      return part.slice(0, 1).toUpperCase() + part.slice(1);
    if (part === "") return part;
    return part.slice(0, 1).toUpperCase() + part.slice(1);
  }).join("-") || model;
}
function collectSkillOptions() {
  const seen = /* @__PURE__ */ new Set();
  const skills = [];
  const home = process.env.USERPROFILE?.trim() || process.env.HOME?.trim() || homedir();
  const roots = [
    join(process.env.DSH_HOME?.trim() || join(home, ".dsh"), "skills"),
    join(home, ".dsh", "skills"),
    join(
      process.env.DSH_AGENTS_HOME?.trim() || join(home, ".agents"),
      "skills"
    ),
    join(home, ".agents", "skills")
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries = [];
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        const id = entry.name;
        if (seen.has(id)) continue;
        seen.add(id);
        skills.push({
          id,
          name: readSkillTitle(join(root, id, "SKILL.md")) ?? id
        });
      } else if (entry.name.endsWith(".md")) {
        const id = entry.name.replace(/\.md$/i, "");
        if (id === "" || seen.has(id)) continue;
        seen.add(id);
        skills.push({ id, name: readSkillTitle(join(root, entry.name)) ?? id });
      }
    }
  }
  return skills;
}
function readSkillTitle(file) {
  if (!existsSync(file)) return void 0;
  try {
    const text = readFileSync(file, "utf8");
    const match = text.match(/^name:\s*(.+)$/m);
    const value = match?.[1]?.trim();
    return value === "" ? void 0 : value;
  } catch {
    return void 0;
  }
}
export {
  AUTOMATION_SESSION_PREFIX,
  AutomationRequestError,
  AutomationService
};
