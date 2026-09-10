    const inject = ["slots", "sessions"];
    // rc.6 list slots require `id`; rc.7+ keyed slots require `key`. Pass both.
    function registerSlot(slots, options, component) {
      const next = { ...options };
      if (next.id == null && next.key != null) next.id = String(next.key);
      if (next.key == null && next.id != null) next.key = next.id;
      return slots.register(next, component);
    }
    function apply(ctx) {
      const slots = ctx.slots;
      const sessions = ctx.sessions;
      plazaSessions = sessions;
      plazaRemote = ctx.remote ?? ctx.get?.("remote");
      if (typeof ctx.inject === "function") {
        ctx.inject(["remote"], (c) => {
          try {
            plazaRemote = c.remote ?? c.get?.("remote") ?? plazaRemote;
          } catch {}
        });
        ctx.inject(["workspaces"], (c) => {
          try {
            plazaWorkspaces = c.workspaces ?? c.get?.("workspaces");
          } catch {}
        });
      }
      if (!slots) return;
      ctx.inject(["locale"], (c) => {
        if (!c.locale || typeof c.locale.register !== "function") return;
        c.effect(() => {
          try {
            return c.locale.register("omnimux-market", { zh: ZH, en: EN });
          } catch {
            return () => {};
          }
        }, "omnimux-market-locale");
      });
      ctx.effect(() => ensureCss(), "omnimux-market-style");
      slots.inject("tool.call.toolview", () => registerSlot(
        slots,
        { name: "tool.call.toolview", key: "skillhub_search", locale: "omnimux-market" },
        SearchToolView,
      ));
      slots.inject("tool.call.toolview", () => registerSlot(
        slots,
        { name: "tool.call.toolview", key: "plaza_search", locale: "omnimux-market" },
        PlazaSearchToolView,
      ));
      slots.inject("tool.call.toolview", () => registerSlot(
        slots,
        { name: "tool.call.toolview", key: "skillhub_list", locale: "omnimux-market" },
        ListToolView,
      ));
      slots.inject("settings.plugin.item", () => registerSlot(
        slots,
        { name: "settings.plugin.item", key: "omnimux-market", locale: "omnimux-market" },
        ConfigCard,
      ));
      slots.inject("conversation.input.left", () => registerSlot(
        slots,
        {
          name: "conversation.input.left",
          id: "omnimux-market-skill-picker",
          order: 10,
          label: () => lookup("picker.title") || "Skill",
          locale: "omnimux-market",
        },
        SkillPickerButton,
      ));

      function mountSidebarEntry() {
        const SIDEBAR_ENTRY_STYLES = `
.omnimux-sidebar-nav-entry {
  box-sizing: border-box; display: flex; align-items: center; gap: 6px; position: relative;
  width: calc(100% - 8px); height: 32px; margin: 0 4px; padding: 0 8px;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: var(--dsw-font-s-14, inherit); font-size: 14px; line-height: 20px;
  cursor: pointer; text-align: left;
}
.omnimux-sidebar-nav-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-sidebar-nav-entry[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-active);
  font-weight: 500;
}
.omnimux-sidebar-nav-entry-icon {
  flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center;
}
.omnimux-sidebar-nav-entry-icon svg {
  display: block; width: 14px; height: 14px;
}
.omnimux-sidebar-nav-entry-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 20px; font-size: 14px;
}
`;

        function createEntryElement() {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "omnimux-sidebar-nav-entry omnimux-market-entry";
          btn.setAttribute("data-omnimux-market-entry", "");
          btn.setAttribute("data-omnimux-esc-entry", "");
          const titleText = lookup("plaza.title") || "Skills";
          btn.setAttribute("aria-label", titleText);
          btn.title = titleText;

          const iconWrap = document.createElement("span");
          iconWrap.className = "omnimux-sidebar-nav-entry-icon";
          iconWrap.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><rect x="1.75" y="1.75" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.4"/><rect x="8.75" y="1.75" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.4"/><rect x="1.75" y="8.75" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.4"/><rect x="8.75" y="8.75" width="5.5" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.4"/></svg>';

          const labelWrap = document.createElement("span");
          labelWrap.className = "omnimux-sidebar-nav-entry-label";
          labelWrap.textContent = titleText;

          btn.appendChild(iconWrap);
          btn.appendChild(labelWrap);

          btn.addEventListener("click", (e) => {
            e.preventDefault();
            window.__omnimuxWorkbench?.open?.({ tabId: PLAZA_TAB_ID, title: lookup("plaza.title") || "Skills" });
          });

          const syncActive = () => {
            try {
              const active = window.__omnimuxWorkbench?.isActive?.(PLAZA_TAB_ID);
              if (active) {
                btn.setAttribute("data-active", "true");
              } else {
                btn.removeAttribute("data-active");
              }
            } catch {
              btn.removeAttribute("data-active");
            }
          };
          syncActive();
          window.__omnimuxWorkbench?.subscribe?.(syncActive);

          return btn;
        }

        let unregister = () => {};
        let disposed = false;
        const registerWhenReady = () => {
          if (disposed) return;
          const api = typeof window !== "undefined" ? window.__omnimuxSidebar : undefined;
          if (!api || typeof api.register !== "function") return;
          unregister = api.register({
            id: "omnimux-market-entry",
            rank: 4.1,
            styles: SIDEBAR_ENTRY_STYLES,
            styleId: "omnimux-sidebar-nav-entry-styles",
            create: createEntryElement,
          });
          clearInterval(timer);
        };
        const timer = setInterval(registerWhenReady, 200);
        registerWhenReady();

        return () => {
          disposed = true;
          clearInterval(timer);
          unregister();
        };
      }

      if (typeof ctx.effect === "function") {
        ctx.effect(() => mountSidebarEntry(), "omnimux-market-sidebar-entry");
      } else {
        mountSidebarEntry();
      }

      if (typeof ctx.inject === "function") {
        ctx.inject(["betterSidebar"], (inner) => {
          const sidebar = inner.betterSidebar ?? inner.get?.("betterSidebar");
          if (!sidebar || typeof sidebar.registerTab !== "function") return;
          try {
            window.__omnimuxWorkbench?.bind?.({ betterSidebar: sidebar });
          } catch {}
          const registerPlazaTab = () => sidebar.registerTab({
            id: PLAZA_TAB_ID,
            title: () => lookup("plaza.title") || "Skills",
            icon: renderPlazaIcon,
            order: 25,
            hidden: false,
            single: true,
            component: (props) => h(PlazaView, { ...props }),
          });
          if (typeof ctx.effect === "function") {
            ctx.effect(() => registerPlazaTab(), "omnimux-market: plaza tab");
          } else {
            registerPlazaTab();
          }
        });
      }
    }

    if (typeof module !== "undefined" && module.exports) {
      module.exports = { inject, apply };
    }
