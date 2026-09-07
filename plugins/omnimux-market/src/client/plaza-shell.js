    const PLAZA_TAB_ID = "omnimux-market:plaza";
    const PLAZA_INTENT_KEY = "omnimux-market:plaza-intent";
    // 与 skill-picker-logic.js PLAZA_HIDDEN_TABS / PLAZA_TABS 同步（skill-shelf-parity.test.js 对拍守卫）。
    // 连接器 Tab 暂时隐藏（Issue #502）：恢复时清空 PLAZA_HIDDEN_TABS，按钮与面板分支自动还原。
    const PLAZA_HIDDEN_TABS = ["connectors"];
    const PLAZA_TABS = ["plugins", "skills", "experts"];

    function consumePlazaIntent() {
      try {
        const raw = window.sessionStorage.getItem(PLAZA_INTENT_KEY);
        window.sessionStorage.removeItem(PLAZA_INTENT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const tab = parsed && parsed.tab;
        return PLAZA_TABS.includes(tab) ? tab : null;
      } catch {
        return null;
      }
    }

    function PlazaTopSearch({ query, onQuery, onSubmit, onClear, placeholder }) {
      return h("form", {
        className: "sh-plaza-search",
        onSubmit: (e) => {
          e.preventDefault();
          if (onSubmit) onSubmit();
        },
      },
        h(SearchField, {
          stretch: true,
          value: query,
          debounceMs: 0,
          placeholder: placeholder,
          onValueChange: onQuery,
          onClear: onClear || (() => onQuery("")),
        }),
      );
    }

    function PlazaView({ t, onClose, active = true, store }) {
      const tr = typeof t === "function" ? t : lookup;
      const [tab, setTab] = useState("skills");
      const [tabQueries, setTabQueries] = useState({
        plugins: "",
        skills: "",
        experts: "",
        connectors: "",
      });
      const [submittedQueries, setSubmittedQueries] = useState({
        plugins: "",
        skills: "",
        experts: "",
        connectors: "",
      });

      useEffect(() => {
        const api = typeof window !== "undefined" ? window.__omnimuxWorkbench : undefined;
        if (!api || typeof api.attachStore !== "function" || !store) return undefined;
        api.attachStore(store);
        return () => { api.detachStore?.(store); };
      }, [store]);

      useEffect(() => {
        const apply = () => {
          const intent = consumePlazaIntent();
          if (intent) setTab(intent);
        };
        if (active !== false) apply();
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return undefined;
        window.addEventListener("omnimux-market:plaza-intent", apply);
        return () => window.removeEventListener("omnimux-market:plaza-intent", apply);
      }, [active]);

      const currentQuery = tabQueries[tab] || "";
      const handleQueryChange = (val) => {
        setTabQueries((prev) => ({ ...prev, [tab]: val }));
      };
      const handleSubmit = () => {
        setSubmittedQueries((prev) => ({ ...prev, [tab]: tabQueries[tab] || "" }));
      };
      const handleClear = () => {
        setTabQueries((prev) => ({ ...prev, [tab]: "" }));
        setSubmittedQueries((prev) => ({ ...prev, [tab]: "" }));
      };

      const placeholder = tab === "plugins" ? tr("plaza.searchPlugins")
        : tab === "skills" ? tr("plaza.searchSkills")
        : tab === "experts" ? tr("plaza.searchExperts")
        : tr("plaza.searchConnectors");

      const handleClose = () => {
        const api = typeof window !== "undefined" ? window.__omnimuxWorkbench : undefined;
        if (api && typeof api.closeTab === "function") {
          api.closeTab(PLAZA_TAB_ID);
        } else if (typeof onClose === "function") {
          onClose();
        }
      };

      return h(I18nProvider, { t: tr },
        h("div", {
          className: "sh-plaza-page",
          role: "region",
          "aria-label": tr("plaza.title"),
          "aria-hidden": active ? undefined : "true",
          style: {
            display: active ? "flex" : "none",
            position: "relative",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            overflow: "hidden",
          },
        },
          h("div", { className: "sh-plaza-top" },
            h("div", { className: "sh-plaza-tabs", role: "tablist", style: { display: "none" } },
              h(Button, {
                type: "button",
                role: "tab",
                variant: "ghost",
                size: "sm",
                className: "sh-plaza-tab" + (tab === "plugins" ? " on" : ""),
                "aria-selected": tab === "plugins",
                onClick: () => setTab("plugins"),
              }, tr("plaza.plugins")),
              h(Button, {
                type: "button",
                role: "tab",
                variant: "ghost",
                size: "sm",
                className: "sh-plaza-tab" + (tab === "skills" ? " on" : ""),
                "aria-selected": tab === "skills",
                onClick: () => setTab("skills"),
              }, tr("plaza.skills")),
              h(Button, {
                type: "button",
                role: "tab",
                variant: "ghost",
                size: "sm",
                className: "sh-plaza-tab" + (tab === "experts" ? " on" : ""),
                "aria-selected": tab === "experts",
                onClick: () => setTab("experts"),
              }, tr("plaza.experts")),
              PLAZA_HIDDEN_TABS.includes("connectors") ? null : h(Button, {
                type: "button",
                role: "tab",
                variant: "ghost",
                size: "sm",
                className: "sh-plaza-tab" + (tab === "connectors" ? " on" : ""),
                "aria-selected": tab === "connectors",
                onClick: () => setTab("connectors"),
              }, tr("plaza.connectors")),
            ),
            h(PlazaTopSearch, {
              query: currentQuery,
              onQuery: handleQueryChange,
              onSubmit: handleSubmit,
              onClear: handleClear,
              placeholder,
            }),
            h("span", { className: "sh-plaza-close" },
              h(IconButton, {
                variant: "ghost",
                onClick: handleClose,
                "aria-label": tr("plaza.back"),
                title: tr("plaza.back"),
              }, h(IconCloseOutline16)),
            ),
          ),
          h("div", { className: "sh-plaza-body" },
            tab === "plugins" ? h(Marketplace, { t: tr, query: tabQueries.plugins, submittedQuery: submittedQueries.plugins })
              : tab === "skills" ? h(SkillPlaza, { query: tabQueries.skills, submittedQuery: submittedQueries.skills })
              : tab === "experts" ? h(ExpertPanel, { query: tabQueries.experts, onClose: handleClose })
              : tab === "connectors" && !PLAZA_HIDDEN_TABS.includes("connectors") ? h(ConnectorPanel, { query: tabQueries.connectors })
              : h(Marketplace, { t: tr, query: tabQueries.plugins, submittedQuery: submittedQueries.plugins }),
          ),
        ),
      );
    }

    function PlazaAction({ wide, t }) {
      useEffect(() => ensureCss(), []);
      const tr = typeof t === "function" ? t : lookup;
      const [active, setActive] = useState(false);

      useEffect(() => {
        const api = typeof window !== "undefined" ? window.__omnimuxWorkbench : undefined;
        if (!api) return undefined;
        const sync = () => {
          try {
            setActive(typeof api.isActive === "function" ? Boolean(api.isActive(PLAZA_TAB_ID)) : false);
          } catch {
            setActive(false);
          }
        };
        sync();
        if (typeof api.subscribe !== "function") return undefined;
        return api.subscribe(sync);
      }, []);

      const handleClick = (e) => {
        e.preventDefault();
        const api = typeof window !== "undefined" ? window.__omnimuxWorkbench : undefined;
        if (api && typeof api.open === "function") {
          api.open({ tabId: PLAZA_TAB_ID, title: tr("plaza.title") });
        }
      };

      return h(I18nProvider, { t: tr },
        h("div", { className: "sh-plaza-wrap" + (wide ? "" : " rail") },
          h("button", {
            type: "button",
            className: "sh-plaza-trigger" + (active ? " on" : ""),
            "aria-label": tr("plaza.title"),
            "aria-pressed": active ? "true" : "false",
            "data-omnimux-market-entry": "",
            "data-active": active ? "true" : undefined,
            onClick: handleClick,
          },
            renderPlazaIcon(wide ? 16 : 18),
            wide ? h("span", null, tr("plaza.title")) : null,
          ),
        ),
      );
    }
