    var inflightSessionCreation = null;

    /**
     * 寻找当前或目标 DOM 输入框（基于官方 Composer 属性）。
     */
    function findComposer() {
      if (typeof document === "undefined") return null;
      return document.querySelector(
        "[data-composer-card] textarea, [data-composer-seat] textarea, textarea[data-phase], textarea[placeholder], textarea"
      );
    }

    /**
     * 新建独立会话并安全预填内容（无损会话契约，AC-38~AC-44）。
     * 1. 连点/Enter重放防抖，返回同一 Promise。
     * 2. 严禁改写/转移原会话 A 的草稿、附件或 preset。
     * 3. 严格调用 sessions.create 分配全新会话 B，不复用旧空会话。
     * 4. 激活新会话 B，等待目标输入框就绪。
     * 5. CAS 检查：若目标输入框已有内容，严禁覆盖！
     * 6. 严禁自动发送（no auto-send）！
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
          const currentItem = sessionAId && snapshot?.byId ? snapshot.byId[sessionAId] : null;
          const workspaceId = currentItem?.workspaceId || undefined;

          // 2. 准备 skill-creator 目标
          const targetSlug = opts.slug || "skill-creator";
          const targetCatalogId = opts.catalogId || "sk-omx-skill-creator";
          try {
            await api("install", { slug: targetSlug, catalogId: targetCatalogId });
          } catch {
            // 已安装或静默继续
          }

          // 3. 官方 sessions.create 分配新会话 B
          const createOpts = workspaceId ? { workspaceId } : {};
          const sessionBId = await sessions.create(createOpts);
          if (!sessionBId || sessionBId === sessionAId) {
            throw new Error("create-session-failed");
          }

          // 4. 激活新会话 B
          if (typeof sessions.open === "function") {
            sessions.open(sessionBId);
          }

          // 显露对话栏 split
          const wb = typeof window !== "undefined" ? window.__omnimuxWorkbench : undefined;
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
              // 安全 CAS：已有用户输入严禁覆盖
              if (composer.value && composer.value.trim().length > 0) {
                prefilled = true;
                break;
              }

              const proto = typeof HTMLTextAreaElement === "function" && composer instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : typeof HTMLInputElement === "function" && composer instanceof HTMLInputElement
                  ? HTMLInputElement.prototype
                  : Object.getPrototypeOf(composer);
              const setter = proto ? Object.getOwnPropertyDescriptor(proto, "value")?.set : undefined;
              if (setter) setter.call(composer, prefillText);
              else composer.value = prefillText;

              const Input = typeof InputEvent === "function" ? InputEvent : Event;
              composer.dispatchEvent(new Input("input", { bubbles: true, inputType: "insertText", data: prefillText }));
              composer.focus?.();

              if (composer.value === prefillText) {
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
