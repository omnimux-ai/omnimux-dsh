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
      slots.inject("sidebar.footer.action", () => registerSlot(
        slots,
        {
          name: "sidebar.footer.action",
          id: "omnimux-market-plaza",
          order: 8,
          label: () => lookup("plaza.title") || "Skill工坊",
          locale: "omnimux-market",
        },
        function PlazaEntry(actionProps) {
          return h(PlazaAction, { ...actionProps });
        },
      ));

      if (typeof ctx.inject === "function") {
        ctx.inject(["betterSidebar"], (inner) => {
          const sidebar = inner.betterSidebar ?? inner.get?.("betterSidebar");
          if (!sidebar || typeof sidebar.registerTab !== "function") return;
          try {
            window.__omnimuxWorkbench?.bind?.({ betterSidebar: sidebar });
          } catch {}
          const registerPlazaTab = () => sidebar.registerTab({
            id: PLAZA_TAB_ID,
            title: () => lookup("plaza.title") || "Skill工坊",
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
