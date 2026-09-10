    var inflightSessionCreation = null;
    var plazaWorkspaces = null;

    const SESSION_MENU_RE = /新会话|新建会话|new session|新对话|新建对话/i;
    const PROJECT_MENU_RE = /新建项目|create project|new project/i;

    function resolveDoc(doc) {
      if (doc) return doc;
      return typeof document !== "undefined" ? document : null;
    }

    function isElementVisible(el) {
      if (!el) return false;
      if (typeof el.getClientRects !== "function") return true;
      try {
        return el.getClientRects().length > 0;
      } catch {
        return true;
      }
    }

    function isTopbarNewSession(button) {
      if (!button) return false;
      if (typeof button.getAttribute === "function") {
        const value = button.getAttribute("data-omnimux-topbar-new-session");
        if (value != null && value !== "false" && value !== "0") return true;
      }
      if (typeof button.hasAttribute === "function" && button.hasAttribute("data-omnimux-topbar-new-session")) {
        return true;
      }
      if (typeof button.closest === "function") {
        if (button.closest('[data-omnimux-topbar-new-session="1"]')) return true;
        if (button.closest("[data-omnimux-topbar-new-session]")) return true;
      }
      return false;
    }

    function matchesOfficialNewSession(button) {
      if (!button || typeof button.getAttribute !== "function") return false;
      if (isTopbarNewSession(button)) return false;
      if (typeof button.closest === "function") {
        if (button.closest("#omnimux-sidebar-new-menu")) return false;
        if (button.closest('[role="treeitem"]')) return false;
      }
      if (String(button.className || "").includes("newSession")) return true;
      const aria = String(button.getAttribute("aria-label") || "").trim();
      if (/^(新建会话|新会话|New session|新对话|新建对话)$/i.test(aria)) return true;
      const text = String(button.textContent || "").trim();
      if (/^(新建会话|新会话|New session|新对话|新建对话)$/i.test(text)) return true;
      return false;
    }

    function findNewSessionButton(doc) {
      const d = resolveDoc(doc);
      if (!d) return null;
      const list = typeof d.querySelectorAll === "function"
        ? Array.from(d.querySelectorAll("button"))
        : (typeof d.querySelector === "function" ? [d.querySelector("button")].filter(Boolean) : []);
      const hits = list.filter((el) => matchesOfficialNewSession(el));
      if (hits.length === 0) return null;
      const classHits = hits.filter((el) => String(el.className || "").includes("newSession"));
      const pool = classHits.length > 0 ? classHits : hits;
      const visible = pool.find((el) => isElementVisible(el));
      return visible || pool[0];
    }

    function findSingleWorkspaceNewSessionButton(doc) {
      const d = resolveDoc(doc);
      if (!d || typeof d.querySelectorAll !== "function") return null;
      const matches = Array.from(d.querySelectorAll("button")).filter((button) => {
        if (!isElementVisible(button) || typeof button.getAttribute !== "function") return false;
        const aria = String(button.getAttribute("aria-label") || "").trim();
        const text = String(button.textContent || "").trim();
        const re = /^(在.+中新建会话|New session in .+|在.+中新建对话|New chat in .+)$/i;
        return re.test(aria) || re.test(text);
      });
      return matches.length === 1 ? matches[0] : null;
    }

    function isNewSessionMenuItem(el) {
      if (!el) return false;
      const text = el.textContent != null && String(el.textContent).trim()
        ? String(el.textContent).trim()
        : (typeof el.getAttribute === "function" ? String(el.getAttribute("aria-label") || "").trim() : "");
      if (!text) return false;
      if (PROJECT_MENU_RE.test(text)) return false;
      return SESSION_MENU_RE.test(text);
    }

    function queryMenuItems(doc) {
      const d = resolveDoc(doc);
      if (!d) return [];
      if (typeof d.querySelector === "function") {
        const menu = d.querySelector("#omnimux-sidebar-new-menu");
        if (menu && typeof menu.querySelectorAll === "function") {
          return Array.from(menu.querySelectorAll('[role="menuitem"]'));
        }
      }
      if (typeof d.querySelectorAll === "function") {
        return Array.from(d.querySelectorAll('#omnimux-sidebar-new-menu [role="menuitem"]'));
      }
      return [];
    }

    function findNewSessionMenuItem(doc) {
      return queryMenuItems(doc).find((el) => isNewSessionMenuItem(el)) || null;
    }

    function clickIfPossible(el, beforeClick) {
      if (!el || typeof el.click !== "function") return false;
      if (typeof beforeClick === "function") beforeClick();
      el.click();
      return true;
    }

    function sessionSnapshot(sessions) {
      const list = sessions && sessions.list;
      if (!list || typeof list.getSnapshot !== "function") return null;
      try {
        return list.getSnapshot();
      } catch {
        return null;
      }
    }

    function resolvedOfficialTarget(sessions, beforeId) {
      const snapshot = sessionSnapshot(sessions);
      const sessionId = snapshot?.current;
      if (!sessionId || typeof sessionId !== "string") return null;
      if (sessionId !== beforeId) {
        return { ok: true, sessionId };
      }
      const summary = snapshot.byId?.[sessionId];
      if (summary && summary.blank === true) {
        return { ok: true, sessionId, reusedBlank: true };
      }
      return null;
    }

    /**
     * 点击官方新会话按钮/菜单项以复用官方创建与工作区绑定流程。
     */
    async function clickOfficialNewSession(opts = {}) {
      const doc = resolveDoc(opts.document);
      const sessions = opts.sessions || plazaSessions || (typeof window !== "undefined" ? window.__omnimuxSessions : undefined);
      if (!doc) return { ok: false, error: "no-document" };
      const list = sessions?.list;
      if (!list || typeof list.getSnapshot !== "function") {
        return { ok: false, error: "no-sessions" };
      }

      const beforeId = sessionSnapshot(sessions)?.current || "";
      const hasOfficialCurrent = Boolean(beforeId);
      let directActionPending = false;
      let menuActionDispatched = false;
      let observedTarget = null;

      const unsubscribe = typeof list.subscribe === "function"
        ? list.subscribe(() => {
            if (!directActionPending && !menuActionDispatched) return;
            const target = resolvedOfficialTarget(sessions, beforeId);
            if (target) observedTarget = target;
          })
        : () => {};

      const dispatchMenu = (el) => clickIfPossible(el, () => { menuActionDispatched = true; });
      const dispatchButton = (el) => clickIfPossible(el, () => { directActionPending = true; });

      try {
        let clickedMenu = dispatchMenu(findNewSessionMenuItem(doc));
        if (!clickedMenu) {
          const button = !hasOfficialCurrent
            ? (findSingleWorkspaceNewSessionButton(doc) || findNewSessionButton(doc))
            : findNewSessionButton(doc);
          if (!button || typeof button.click !== "function") {
            return { ok: false, error: "button-not-found" };
          }
          dispatchButton(button);

          const menuItem = findNewSessionMenuItem(doc);
          if (menuItem) {
            directActionPending = false;
            observedTarget = null;
            clickedMenu = dispatchMenu(menuItem);
          }
        }

        const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 1500;
        const pollMs = 50;
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
          if (!clickedMenu) {
            const menuItem = findNewSessionMenuItem(doc);
            if (menuItem) {
              directActionPending = false;
              observedTarget = null;
              clickedMenu = dispatchMenu(menuItem);
            }
          }
          if (observedTarget) return observedTarget;
          const target = resolvedOfficialTarget(sessions, beforeId);
          if (target && (directActionPending || menuActionDispatched)) {
            return target;
          }
          await new Promise((r) => setTimeout(r, pollMs));
        }
        return observedTarget || { ok: false, error: "newSessionTimeout" };
      } finally {
        try { unsubscribe(); } catch {}
      }
    }

    /**
     * 兜底解析合法工作区 ID：从当前会话、workspaces 服务或 sessions 历史中获取。
     */
    function resolveFallbackWorkspaceId(sessions, workspaces) {
      try {
        const sessionSnapshot = sessions?.list?.getSnapshot?.();
        const currentId = sessionSnapshot?.current;
        const currentSession = currentId && sessionSnapshot?.byId ? sessionSnapshot.byId[currentId] : null;

        // 1. 当前会话如果有 workspaceId，直接继承
        if (currentSession?.workspaceId) {
          return String(currentSession.workspaceId);
        }

        const wsService = workspaces || plazaWorkspaces || (typeof window !== "undefined" ? window.__omnimuxWorkspaces : undefined);
        const wsSnapshot = wsService?.list?.getSnapshot?.();

        // 2. 从 workspaces 快照看当前会话是否归属某工作区
        if (currentId && Array.isArray(wsSnapshot?.items)) {
          const match = wsSnapshot.items.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(currentId));
          if (match?.workspaceId) return String(match.workspaceId);
        }

        // 3. 检查最近工作区 ID
        if (wsSnapshot?.recentWorkspaceId) {
          return String(wsSnapshot.recentWorkspaceId);
        }

        // 4. 从 workspaces 快照计算最近活跃工作区（根据 session updatedAt）
        if (Array.isArray(wsSnapshot?.items) && wsSnapshot.items.length > 0) {
          let selectedId = undefined;
          let selectedTime = Number.NEGATIVE_INFINITY;
          const sessionsById = sessionSnapshot?.byId || {};
          for (const workspace of wsSnapshot.items) {
            if (!workspace?.workspaceId) continue;
            let latest = Number.NEGATIVE_INFINITY;
            if (Array.isArray(workspace.sessionIds)) {
              for (const sId of workspace.sessionIds) {
                const s = sessionsById[sId];
                if (s && typeof s.updatedAt === "number") {
                  latest = Math.max(latest, s.updatedAt);
                }
              }
            }
            if (latest === Number.NEGATIVE_INFINITY && workspace.createdAt) {
              latest = Date.parse(workspace.createdAt) || 0;
            }
            if (selectedId === undefined || latest > selectedTime) {
              selectedId = workspace.workspaceId;
              selectedTime = latest;
            }
          }
          if (selectedId) return String(selectedId);
          if (wsSnapshot.items[0]?.workspaceId) return String(wsSnapshot.items[0].workspaceId);
        }

        // 5. 从 sessions 快照寻找最近具有有效 workspaceId 的会话
        if (sessionSnapshot?.byId) {
          const sessionsWithWs = Object.values(sessionSnapshot.byId)
            .filter((s) => s && s.workspaceId)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          if (sessionsWithWs.length > 0 && sessionsWithWs[0].workspaceId) {
            return String(sessionsWithWs[0].workspaceId);
          }
        }

        // 6. 如果有 cwd，匹配 workspaces.items[].path
        const cwd = currentSession?.cwd;
        if (cwd && Array.isArray(wsSnapshot?.items)) {
          const normCwd = String(cwd).replace(/[/\\]+$/u, "");
          const match = wsSnapshot.items.find((item) => {
            if (!item?.path) return false;
            return String(item.path).replace(/[/\\]+$/u, "") === normCwd;
          });
          if (match?.workspaceId) return String(match.workspaceId);
        }
      } catch (err) {
        console.warn("resolveFallbackWorkspaceId failed:", err);
      }
      return undefined;
    }

    /**
     * 寻找当前或目标 DOM 输入框（基于官方 Composer 属性）。
     * 必须是正常激活的输入框，支持官方 contenteditable 富文本及传统 textarea，排除处于禁用状态（如未选工作区）的元素。
     */
    function findComposer() {
      if (typeof document === "undefined") return null;
      const selectors = [
        "[data-composer-card] [contenteditable='true']",
        "[data-composer-seat] [contenteditable='true']",
        "[role='textbox'][contenteditable='true']",
        "[contenteditable='true']",
        "[data-composer-card] textarea",
        "[data-composer-seat] textarea",
        "textarea[data-phase]",
        "textarea[placeholder]",
        "textarea",
      ];
      for (const selector of selectors) {
        if (typeof document.querySelectorAll === "function") {
          const list = Array.from(document.querySelectorAll(selector));
          const hit = list.find((el) => {
            if (!el) return false;
            if (el.disabled) return false;
            if (typeof el.getAttribute === "function" && el.getAttribute("aria-disabled") === "true") return false;
            return true;
          });
          if (hit) return hit;
        } else if (typeof document.querySelector === "function") {
          const el = document.querySelector(selector);
          if (el) {
            if (el.disabled) continue;
            if (typeof el.getAttribute === "function" && el.getAttribute("aria-disabled") === "true") continue;
            return el;
          }
        }
      }
      return null;
    }

    /**
     * 新建独立会话并安全预填内容（无损会话契约，AC-38~AC-44，Issue #773 修复）。
     * 1. 连点/Enter重放防抖，返回同一 Promise。
     * 2. 严禁改写/转移原会话 A 的草稿、附件或 preset。
     * 3. 优先触发官方新对话相同事件（DOM 寻找并点击 newSession 按钮或菜单项）；
     *    若未找到则安全从 workspaces/sessions 获取当前或最近工作区 ID 兜底调用 sessions.create。
     * 4. 激活新会话 B，调用 workbench.open 保持右侧侧边栏不关闭，显露中间对话栏（split 布局）。
     * 5. 等待激活的输入框就绪（排除禁用/无工作区状态）。
     * 6. CAS 检查：若目标输入框已有内容，严禁覆盖！
     * 7. 严禁自动发送（no auto-send）！
     */
    async function createSkillSession(opts = {}) {
      if (inflightSessionCreation) return inflightSessionCreation;

      const promise = (async () => {
        try {
          const sessions = plazaSessions || (typeof window !== "undefined" ? window.__omnimuxSessions : undefined);
          if (!sessions || typeof sessions.create !== "function") {
            throw new Error("sessions-unavailable");
          }

          // 1. 捕获当前会话 A 状态（只读，防污染，绝不改写其草稿与附件）
          const snapshot = typeof sessions.list?.getSnapshot === "function" ? sessions.list.getSnapshot() : null;
          const sessionAId = snapshot?.current;

          // 2. 准备 skill-creator 目标
          const targetSlug = opts.slug || "skill-creator";
          const targetCatalogId = opts.catalogId || "sk-omx-skill-creator";
          try {
            await api("install", { slug: targetSlug, catalogId: targetCatalogId });
          } catch {
            // 已安装或静默继续
          }

          // 3. 优先通过 DOM 寻找并点击官方新对话按钮，触发官方完整新对话事件
          let sessionBId = null;
          try {
            const clickResult = await clickOfficialNewSession({
              sessions,
              document: typeof document !== "undefined" ? document : null,
            });
            if (clickResult && clickResult.ok && clickResult.sessionId) {
              sessionBId = clickResult.sessionId;
            }
          } catch (err) {
            console.warn("clickOfficialNewSession error, falling back:", err);
          }

          // 兜底逻辑：若未能通过点击官方按钮获得会话，则继承合法工作区 ID 并调用 sessions.create
          if (!sessionBId) {
            const workspaceId = resolveFallbackWorkspaceId(sessions, plazaWorkspaces);
            const createOpts = workspaceId ? { workspaceId } : {};
            sessionBId = await sessions.create(createOpts);
            if (!sessionBId || sessionBId === sessionAId) {
              throw new Error("create-session-failed");
            }
          }

          // 4. 激活新会话 B
          if (typeof sessions.open === "function") {
            sessions.open(sessionBId);
          }

          // 保持右侧侧边栏不关闭，显露中间对话栏（split 布局）
          const wb = typeof window !== "undefined" ? window.__omnimuxWorkbench : undefined;
          const plazaTitle = typeof lookup === "function" ? (lookup("plaza.title") || "Skills") : "Skills";
          try {
            window.__omnimuxWorkbench?.open?.({ tabId: "omnimux-market:plaza", sessionId: sessionBId, title: typeof lookup === "function" ? (lookup("plaza.title") || "Skills") : "Skills" });
          } catch {}
          try { wb?.setFocus?.("split"); } catch {}
          try { wb?.setConversationCollapsed?.(false, { sessionId: sessionBId }); } catch {}

          // 5. 预填内容（严格无损，禁止自动发送）
          const prefillText = opts.text || "/skill-creator\n帮我使用它来创建一个新的技能。首先询问我这个技能应该做什么。";

          // 有界等待 B 输入框就绪（最长 10 秒）
          const maxWait = 10000;
          const start = Date.now();
          let prefilled = false;

          while (Date.now() - start < maxWait) {
            // 检查当前会话是否已被用户切换到 C
            const currentActive = sessions.list?.getSnapshot?.()?.current;
            if (currentActive && currentActive !== sessionBId) {
              break;
            }

            const composer = findComposer();
            if (composer) {
              const isContentEditable = Boolean(composer.isContentEditable || (typeof composer.getAttribute === "function" && composer.getAttribute("contenteditable") === "true"));
              const currentText = (composer.value && composer.value.trim().length > 0)
                ? composer.value
                : (isContentEditable ? (composer.innerText || composer.textContent || "") : (composer.value || ""));

              // 安全 CAS：已有用户输入严禁覆盖
              if (currentText && currentText.trim().length > 0) {
                prefilled = true;
                break;
              }

              if (isContentEditable) {
                try {
                  composer.focus?.();
                  if (typeof window !== "undefined" && window.getSelection && document.createRange) {
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(composer);
                    sel.removeAllRanges();
                    sel.addRange(range);
                  }
                  const success = typeof document.execCommand === "function"
                    ? document.execCommand("insertText", false, prefillText)
                    : false;
                  if (!success) {
                    composer.innerText = prefillText;
                  }
                } catch {
                  composer.innerText = prefillText;
                }
              } else {
                const proto = typeof HTMLTextAreaElement === "function" && composer instanceof HTMLTextAreaElement
                  ? HTMLTextAreaElement.prototype
                  : typeof HTMLInputElement === "function" && composer instanceof HTMLInputElement
                    ? HTMLInputElement.prototype
                    : Object.getPrototypeOf(composer);
                const setter = proto ? Object.getOwnPropertyDescriptor(proto, "value")?.set : undefined;
                if (setter) setter.call(composer, prefillText);
                else composer.value = prefillText;
              }

              const Input = typeof InputEvent === "function"
                ? InputEvent
                : (typeof Event === "function" ? Event : function(type, opts) { this.type = type; Object.assign(this, opts); });
              composer.dispatchEvent(new Input("input", { bubbles: true, inputType: "insertText", data: prefillText }));
              composer.focus?.();

              const updatedText = isContentEditable ? (composer.innerText || composer.textContent || "") : (composer.value || "");
              if (updatedText.includes(prefillText) || updatedText.trim().length > 0) {
                prefilled = true;
                break;
              }
            }
            await new Promise((r) => setTimeout(r, 100));
          }

          return { ok: true, sessionId: sessionBId, prefilled };
        } finally {
          inflightSessionCreation = null;
        }
      })();

      inflightSessionCreation = promise;
      return promise;
    }

    /**
     * 在新会话中试用特定技能（仅引用，禁止自动发送）
     */
    async function trySkillInSession(skill) {
      if (!skill) return { ok: false };
      const slug = skill.token || skill.slug || skill.skillKey || "";
      if (!slug) return { ok: false };

      if (!skill.installed) {
        try {
          await api("install", { slug, catalogId: skill.catalogId || skill.id });
        } catch {}
      }

      return createSkillSession({
        slug,
        catalogId: skill.catalogId || skill.id,
        text: `/${slug} `,
      });
    }
