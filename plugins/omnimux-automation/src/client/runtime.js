import { unwrapRpcResult } from "./protocol.js";
const CHANNEL = "/dsh-automation";
const IDLE_POLL_INTERVAL_MS = 15e3;
const ACTIVE_POLL_INTERVAL_MS = 2e3;
const HOST_SESSION_RETRY_REFRESH_GAPS = [1, 2, 4];
const HOST_SESSION_MAX_ATTEMPTS = HOST_SESSION_RETRY_REFRESH_GAPS.length + 1;
const HOST_SESSION_REARM_INTERVAL_MS = 5 * 60 * 1e3;
const RECENT_TERMINAL_RUN_WINDOW_MS = 24 * 60 * 60 * 1e3;
function snapshotPollIntervalMs(runs) {
  return (runs ?? []).some((run) => run.status === "running" || run.status === "queued") ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS;
}
function effectiveSnapshotPollIntervalMs(runs, foregroundSubscribers) {
  return foregroundSubscribers > 0 ? snapshotPollIntervalMs(runs) : IDLE_POLL_INTERVAL_MS;
}
function isTransportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}
function sessionIdsNeedingHostSync(runs, serverNow) {
  const parsedNow = Date.parse(serverNow);
  const referenceTime = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const cutoff = referenceTime - RECENT_TERMINAL_RUN_WINDOW_MS;
  return [...new Set(runs.filter((run) => {
    if (run.status === "queued" || run.status === "running") return true;
    const timestamp = Date.parse(run.finishedAt ?? run.startedAt ?? run.scheduledFor);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  }).map((run) => run.sessionId).filter((sessionId) => sessionId !== void 0 && sessionId !== ""))].sort();
}
function installAutomationSessionSync(runtime, getSessions, options = {}) {
  let stopped = false;
  let completedRefreshes = 0;
  let automationRefreshInProgress = runtime.source.getSnapshot().phase === "loading";
  let trackedSessions;
  let trackedMissingKey;
  let attempts = 0;
  let nextAttemptRefresh = 0;
  let nextRearmAt = 0;
  let warnedMissingKey;
  let hostRefreshPromise;
  let reconcileAfterRefresh = false;
  const resetAttempts = (missingKey) => {
    trackedMissingKey = missingKey;
    attempts = 0;
    nextAttemptRefresh = completedRefreshes;
    nextRearmAt = 0;
    warnedMissingKey = void 0;
  };
  const missingSessionKey = (sessions) => {
    const snapshot = runtime.source.getSnapshot().snapshot;
    const hostSnapshot = sessions?.list?.getSnapshot();
    if (snapshot === void 0 || hostSnapshot === void 0 || sessions?.refresh === void 0) return void 0;
    const present = /* @__PURE__ */ new Set([
      ...hostSnapshot.ids ?? [],
      ...Object.keys(hostSnapshot.byId ?? {})
    ]);
    return sessionIdsNeedingHostSync(snapshot.runs, snapshot.serverNow).filter((sessionId) => !present.has(sessionId)).join("\0");
  };
  const reconcile = () => {
    if (stopped) return;
    const sessions = getSessions();
    if (sessions !== trackedSessions) {
      trackedSessions = sessions;
      resetAttempts();
    }
    const missingKey = missingSessionKey(sessions);
    if (missingKey === void 0) return;
    if (missingKey === "") {
      resetAttempts();
      return;
    }
    if (missingKey !== trackedMissingKey) resetAttempts(missingKey);
    if (attempts >= HOST_SESSION_MAX_ATTEMPTS) {
      if ((options.now ?? Date.now)() < nextRearmAt) return;
      resetAttempts(missingKey);
    }
    if (completedRefreshes < nextAttemptRefresh) return;
    if (hostRefreshPromise !== void 0) {
      reconcileAfterRefresh = true;
      return;
    }
    const attemptIndex = attempts;
    attempts += 1;
    const retryGap = HOST_SESSION_RETRY_REFRESH_GAPS[attemptIndex];
    nextAttemptRefresh = retryGap === void 0 ? Number.POSITIVE_INFINITY : completedRefreshes + retryGap;
    if (attempts >= HOST_SESSION_MAX_ATTEMPTS) {
      nextRearmAt = (options.now ?? Date.now)() + HOST_SESSION_REARM_INTERVAL_MS;
    }
    hostRefreshPromise = Promise.resolve().then(async () => {
      await sessions.refresh();
    }).catch((error) => {
      if (!stopped && warnedMissingKey !== missingKey) {
        warnedMissingKey = missingKey;
        console.warn("[omnimux-automation] 刷新 Host 会话列表失败", error);
      }
    }).finally(() => {
      hostRefreshPromise = void 0;
      if (stopped || !reconcileAfterRefresh) return;
      reconcileAfterRefresh = false;
      reconcile();
    });
  };
  const unsubscribe = runtime.source.subscribe(() => {
    const phase = runtime.source.getSnapshot().phase;
    if (phase === "loading") {
      automationRefreshInProgress = true;
    } else if (automationRefreshInProgress) {
      automationRefreshInProgress = false;
      completedRefreshes += 1;
    }
    reconcile();
  }, { background: true });
  reconcile();
  return () => {
    stopped = true;
    reconcileAfterRefresh = false;
    unsubscribe();
  };
}
function createAutomationRuntime(rpc) {
  let state = { phase: "idle" };
  let refreshPromise;
  let pollTimer;
  let active = true;
  let removePageResumeListeners = () => void 0;
  const listeners = /* @__PURE__ */ new Set();
  const foregroundListeners = /* @__PURE__ */ new Set();
  const armPoll = () => {
    if (pollTimer !== void 0) clearInterval(pollTimer);
    if (listeners.size === 0 || !active) {
      pollTimer = void 0;
      return;
    }
    pollTimer = setInterval(
      () => {
        void refresh().catch(() => void 0);
      },
      effectiveSnapshotPollIntervalMs(state.snapshot?.runs, foregroundListeners.size)
    );
  };
  const armPageResumeListeners = () => {
    removePageResumeListeners();
    if (foregroundListeners.size === 0) return;
    const refreshOnResume = () => {
      void refresh().catch(() => void 0);
    };
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") refreshOnResume();
    };
    if (typeof window !== "undefined") window.addEventListener("focus", refreshOnResume);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", refreshOnVisible);
    removePageResumeListeners = () => {
      if (typeof window !== "undefined") window.removeEventListener("focus", refreshOnResume);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refreshOnVisible);
      removePageResumeListeners = () => void 0;
    };
  };
  const publish = (next) => {
    const previousInterval = effectiveSnapshotPollIntervalMs(state.snapshot?.runs, foregroundListeners.size);
    state = next;
    if (listeners.size > 0 && previousInterval !== effectiveSnapshotPollIntervalMs(state.snapshot?.runs, foregroundListeners.size)) armPoll();
    for (const listener of [...listeners]) listener();
  };
  const source = {
    getSnapshot: () => state,
    subscribe: (listener, options = {}) => {
      const hadListeners = listeners.size > 0;
      const hadForegroundListeners = foregroundListeners.size > 0;
      listeners.add(listener);
      if (options.background !== true) foregroundListeners.add(listener);
      if (!hadListeners || options.background !== true && !hadForegroundListeners) {
        queueMicrotask(() => {
          if (listeners.size > 0) void refresh().catch(() => void 0);
        });
      }
      armPoll();
      if (foregroundListeners.size > 0 && !hadForegroundListeners) armPageResumeListeners();
      return () => {
        listeners.delete(listener);
        foregroundListeners.delete(listener);
        if (listeners.size === 0 && pollTimer !== void 0) {
          clearInterval(pollTimer);
          pollTimer = void 0;
        } else if (listeners.size > 0) {
          armPoll();
        }
        if (foregroundListeners.size === 0) removePageResumeListeners();
      };
    }
  };
  const refresh = async () => {
    if (refreshPromise !== void 0) return refreshPromise;
    const previous = state.snapshot;
    publish(previous === void 0 ? { phase: "loading" } : {
      phase: "loading",
      snapshot: previous,
      ...state.refreshedAt === void 0 ? {} : { refreshedAt: state.refreshedAt }
    });
    refreshPromise = (async () => {
      try {
        const response = await rpc.call(CHANNEL, "snapshot", { sessionId: "settings" });
        const snapshot = unwrapRpcResult(response);
        publish({ phase: "ready", snapshot, refreshedAt: Date.now() });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        publish(previous === void 0 ? { phase: "error", error: message } : {
          phase: "error",
          snapshot: previous,
          error: message,
          ...state.refreshedAt === void 0 ? {} : { refreshedAt: state.refreshedAt }
        });
        throw error;
      } finally {
        refreshPromise = void 0;
      }
    })();
    return refreshPromise;
  };
  const callRpc = async (endpoint, payload) => {
    try {
      return await rpc.call(CHANNEL, endpoint, payload);
    } catch (error) {
      if (!isTransportError(error)) throw error;
      return await rpc.call(CHANNEL, endpoint, payload);
    }
  };
  const mutateThenRefresh = async (endpoint, payload, patch) => {
    unwrapRpcResult(await callRpc(endpoint, payload));
    const applyPatch = () => {
      if (patch !== void 0 && state.snapshot !== void 0) {
        publish({ phase: "ready", snapshot: patch(state.snapshot), refreshedAt: Date.now() });
      }
    };
    const pendingBeforeRefresh = refreshPromise;
    applyPatch();
    if (pendingBeforeRefresh !== void 0) {
      await pendingBeforeRefresh.catch(() => void 0);
      applyPatch();
    }
    try {
      await refresh();
    } catch {
    }
  };
  return {
    source,
    refresh,
    /**
     * 由工作台 Tab 的 `visible` 驱动：面板收起或 Tab 未激活时停表，
     * 保留最后一次快照；重新激活时立即拉一次并恢复轮询。
     *
     * @param {boolean} next
     */
    setActive(next) {
      const wanted = next === true;
      if (wanted === active) return;
      active = wanted;
      if (!wanted) {
        if (pollTimer !== void 0) {
          clearInterval(pollTimer);
          pollTimer = void 0;
        }
        removePageResumeListeners();
        return;
      }
      armPoll();
      if (foregroundListeners.size > 0) armPageResumeListeners();
      if (listeners.size > 0) void refresh().catch(() => void 0);
    },
    async createAutomation(input) {
      const payload = { sessionId: "settings", input };
      await mutateThenRefresh("create", payload);
    },
    async mutateAutomation(automationId, mutation) {
      const payload = { sessionId: "settings", automationId, mutation };
      await mutateThenRefresh("mutate", payload, mutation === "delete" ? (snapshot) => ({
        ...snapshot,
        automations: snapshot.automations.filter((item) => item.id !== automationId)
      }) : (snapshot) => ({
        ...snapshot,
        automations: snapshot.automations.map((item) => item.id === automationId ? { ...item, status: mutation === "pause" ? "paused" : "active" } : item)
      }));
    },
    async updateAutomation(automationId, input) {
      const payload = { sessionId: "settings", automationId, input };
      await mutateThenRefresh("update", payload);
    },
    async runNow(automationId) {
      const payload = { sessionId: "settings", automationId };
      await mutateThenRefresh("run-now", payload);
    },
    async markRunRead(runId) {
      const payload = { sessionId: "settings", runId };
      await mutateThenRefresh("mark-read", payload);
    },
    async adoptSession(sessionId) {
      unwrapRpcResult(await rpc.call(CHANNEL, "adopt-session", { sessionId }));
    },
    async forgetSession(sessionId) {
      await mutateThenRefresh("forget-session", { sessionId }, (snapshot) => ({
        ...snapshot,
        runs: snapshot.runs.map((run) => {
          if (run.sessionId !== sessionId) return run;
          const { sessionId: _ignored, ...rest } = run;
          return rest;
        })
      }));
    },
    async forgetAutomationSessions(automationId) {
      await mutateThenRefresh("forget-automation-sessions", { automationId }, (snapshot) => ({
        ...snapshot,
        runs: snapshot.runs.map((run) => {
          if (run.automationId !== automationId) return run;
          const { sessionId: _ignored, ...rest } = run;
          return rest;
        })
      }));
    }
  };
}
export {
  createAutomationRuntime,
  effectiveSnapshotPollIntervalMs,
  installAutomationSessionSync,
  isTransportError,
  sessionIdsNeedingHostSync,
  snapshotPollIntervalMs
};
