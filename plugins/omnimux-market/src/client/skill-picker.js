    // 规则真源：SkillShelf（boot.js 注入 skill-picker-logic.js），禁止内联副本。
    const pickerSearchCache = new Map();
    const pickerSearchInflight = new Map();

    function peekPickerCache(payload) {
      return SkillShelf.peekPickerCache(pickerSearchCache, SkillShelf.pickerCacheKey(payload));
    }

    function loadPickerSearch(payload) {
      return SkillShelf.loadPickerSearch(payload, {
        cache: pickerSearchCache,
        inflight: pickerSearchInflight,
        fetchSearch: (p) => api("search", p),
      });
    }

    function writePlazaSkillsIntent() {
      try {
        window.sessionStorage.setItem("omnimux-market:plaza-intent", JSON.stringify({ tab: "skills" }));
      } catch { /* private mode */ }
      try {
        window.dispatchEvent(new CustomEvent("omnimux-market:plaza-intent", { detail: { tab: "skills" } }));
      } catch { /* ignore */ }
    }

    function focusComposerCard() {
      if (typeof document === "undefined") return;
      const el = document.querySelector('[data-composer-card] [contenteditable="true"], [data-composer-card] textarea, [data-lexical-editor="true"]');
      if (el && typeof el.focus === "function") el.focus();
    }

    function renderBookOpenIcon(size = 16) {
      const px = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 16;
      return h("svg", {
        width: px,
        height: px,
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": "true",
        preserveAspectRatio: "xMidYMid meet",
        className: "lucide lucide-book-open",
        style: {
          width: px,
          height: px,
          minWidth: px,
          minHeight: px,
          flex: "none",
          flexShrink: 0,
          display: "block",
        },
      },
        h("path", {
          d: "M12 5v16",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
        h("path", {
          d: "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      );
    }
    const renderPuzzleIcon = renderBookOpenIcon;

    function PickerInfoIcon() {
      return h("svg", {
        width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true",
      },
        h("circle", { cx: "8", cy: "8", r: "6.25", stroke: "currentColor", strokeWidth: "1.4" }),
        h("path", { d: "M8 7.2V11.2", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }),
        h("circle", { cx: "8", cy: "5.15", r: "0.85", fill: "currentColor" }),
      );
    }

    function PickerChevronIcon() {
      return h("svg", {
        width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true",
      },
        h("path", { d: "M6 3.5 11 8l-5 4.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }),
      );
    }

    function PickerDownloadIcon() {
      return h("svg", {
        width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true",
      },
        h("path", { d: "M8 2.5v8", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }),
        h("path", { d: "M4.5 8.5 8 12l3.5-3.5", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }),
        h("path", { d: "M3 13.5h10", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }),
      );
    }

    function SkillPickerPanel({ open, anchorRef, onClose, onPick, onExplore, onCreate, t, presetBinding }) {
      const tr = typeof t === "function" ? t : lookup;
      const panelRef = useRef(null);
      const tabsRef = useRef(null);
      const [query, setQuery] = useState("");
      const [debounced, setDebounced] = useState("");
      const [tabId, setTabId] = useState("all");
      const [items, setItems] = useState([]);
      const [status, setStatus] = useState("loading");
      const [err, setErr] = useState("");
      const [remoteDown, setRemoteDown] = useState(false);
      const [hint, setHint] = useState("");
      const [activeIndex, setActiveIndex] = useState(0);
      const [pos, setPos] = useState({ left: 0, top: 0, width: 380 });

      useEffect(() => {
        if (!open) return undefined;
        const timer = setTimeout(() => setDebounced(query), SkillShelf.PICKER_DEBOUNCE_MS);
        return () => clearTimeout(timer);
      }, [query, open]);

      useEffect(() => {
        if (!open) return undefined;
        if (presetBinding && !presetBinding.useDefaultContentCatalog) {
          const list = SkillShelf.filterPresetSkills(presetBinding.skills, tabId, debounced);
          setItems(list);
          setStatus("ready");
          setErr("");
          setRemoteDown(false);
          setActiveIndex(0);
          return undefined;
        }
        let live = true;
        const payload = SkillShelf.buildSearchPayload(tabId, debounced);
        const cached = peekPickerCache(payload);
        if (cached) {
          setItems(Array.isArray(cached.items) ? cached.items : []);
          setRemoteDown(Boolean(cached.channelErrors && cached.channelErrors.skillhub));
          setStatus("ready");
          setErr("");
        } else {
          setStatus((cur) => (cur === "ready" ? cur : "loading"));
        }
        loadPickerSearch(payload).then((result) => {
          if (!live) return;
          const d = result && result.body;
          if (!d) return;
          setItems(Array.isArray(d.items) ? d.items : []);
          setRemoteDown(Boolean(d.channelErrors && d.channelErrors.skillhub));
          setStatus("ready");
          setErr("");
          if (!result.fromCache) setActiveIndex(0);
        }).catch((e) => {
          if (!live) return;
          if (cached) return;
          setItems([]);
          setStatus("error");
          setErr(e && e.message ? e.message : String(e || "error"));
        });
        return () => { live = false; };
      }, [open, tabId, debounced, presetBinding]);

      useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => {
          const anchor = anchorRef && anchorRef.current;
          const panel = panelRef.current;
          if (!anchor || typeof anchor.getBoundingClientRect !== "function") return;
          const r = anchor.getBoundingClientRect();
          const width = Math.min(400, Math.max(360, Math.min(380, window.innerWidth - 16)));
          const height = panel ? panel.offsetHeight : 420;
          let left = r.left;
          if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
          if (left < 8) left = 8;
          let top = r.top - height - 8;
          if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - height - 8);
          setPos({ left, top: Math.max(8, top), width });
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
      }, [open, items, status, tabId, anchorRef]);

      useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
          const tEl = e.target;
          if (panelRef.current && panelRef.current.contains(tEl)) return;
          if (anchorRef && anchorRef.current && anchorRef.current.contains(tEl)) return;
          onClose();
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
          document.removeEventListener("mousedown", onDoc);
          document.removeEventListener("keydown", onKey);
        };
      }, [open, onClose, anchorRef]);

      const visible = presetBinding && !presetBinding.useDefaultContentCatalog
        ? SkillShelf.filterPickerItems(items, tabId, presetBinding)
        : SkillShelf.filterPickerItems(items, tabId);

      const handlePick = (item) => {
        const ok = onPick(item);
        if (!ok) setHint(tr("picker.writeFail"));
      };

      const onListKey = (e) => {
        if (!visible.length) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % visible.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + visible.length) % visible.length);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const item = visible[activeIndex];
          if (item) handlePick(item);
        }
      };

      if (!open) return null;

      const emptyMine = tabId === "mine" && status === "ready" && !visible.length && !debounced.trim();
      const emptySearch = status === "ready" && !visible.length && !emptyMine;

      const pickerTabs = presetBinding && Array.isArray(presetBinding.tabs)
        ? presetBinding.tabs
        : SkillShelf.PICKER_TABS;

      const node = h("div", {
        ref: panelRef,
        className: "sh-picker",
        role: "dialog",
        "aria-label": tr("picker.title"),
        "aria-modal": "true",
        style: { left: pos.left + "px", top: pos.top + "px", width: pos.width + "px" },
        onKeyDown: onListKey,
      },
        h("div", { className: "sh-picker-head" },
          h("div", { className: "sh-picker-title" },
            h("span", null, tr("picker.title")),
            h("span", { className: "sh-picker-info", title: tr("picker.hint") }, h(PickerInfoIcon)),
          ),
          h("div", { className: "sh-picker-search" },
            h(SearchField, {
              value: query,
              placeholder: tr("picker.searchPlaceholder"),
              onValueChange: setQuery,
              onClear: () => setQuery(""),
              stretch: true,
            }),
          ),
        ),
        h("div", { className: "sh-picker-cats" },
          h("div", { className: "sh-picker-tabs", ref: tabsRef, role: "tablist" },
            pickerTabs.map((tab) => h("button", {
              key: tab.id,
              type: "button",
              role: "tab",
              className: "sh-picker-tab" + (tabId === tab.id ? " on" : ""),
              "aria-selected": tabId === tab.id,
              onClick: () => { setTabId(tab.id); setActiveIndex(0); },
            }, (tab.labelKey && tr(tab.labelKey)) || tab.name || tab.id)),
          ),
          h("button", {
            type: "button",
            className: "sh-picker-more",
            "aria-label": tr("picker.scrollCats"),
            onClick: () => {
              const el = tabsRef.current;
              if (el) el.scrollBy({ left: 120, behavior: "smooth" });
            },
          }, h(PickerChevronIcon)),
        ),
        remoteDown ? h("p", { className: "sh-picker-banner", role: "status" }, tr("picker.remoteDown")) : null,
        hint ? h("p", { className: "sh-picker-banner", role: "status" }, hint) : null,
        h("div", { className: "sh-picker-list", role: "listbox" },
          status === "loading" && !items.length
            ? [0, 1, 2].map((i) => h("div", { key: i, className: "sh-picker-skel", "aria-hidden": "true" },
              h("span", { className: "sh-picker-skel-a" }),
              h("span", { className: "sh-picker-skel-b" }),
            ))
            : null,
          status === "error" ? h("p", { className: "sh-picker-empty" }, tr("picker.error", { m: err })) : null,
          emptyMine ? h("p", { className: "sh-picker-empty" }, tr("picker.emptyMine")) : null,
          emptySearch ? h("p", { className: "sh-picker-empty" }, tr("picker.empty", { q: debounced || "" })) : null,
          visible.map((item, index) => {
            const slug = SkillShelf.skillToken(item);
            const name = item.name || item.title || slug;
            const desc = item.description || item.summary || "";
            const selected = index === activeIndex;
            return h("button", {
              key: (item.id || slug) + ":" + index,
              type: "button",
              role: "option",
              "aria-selected": selected,
              className: "sh-picker-row" + (selected ? " on" : ""),
              onMouseEnter: () => setActiveIndex(index),
              onClick: () => handlePick(item),
            },
              h("div", { className: "sh-picker-row-main" },
                h("div", { className: "sh-picker-row-top" },
                  h("span", { className: "sh-picker-name" }, name),
                  h("span", { className: "sh-picker-slug" }, "/" + slug),
                ),
                h("div", { className: "sh-picker-desc" }, desc),
              ),
              item.installed === true ? null : h("span", {
                className: "sh-picker-dl",
                title: tr("picker.uninstalled"),
              }, h(PickerDownloadIcon)),
            );
          }),
        ),
        h("div", { className: "sh-picker-foot" },
          h("button", { type: "button", className: "sh-picker-btn", onClick: onExplore }, tr("picker.explore")),
          h("button", { type: "button", className: "sh-picker-btn primary", onClick: onCreate }, tr("picker.create")),
        ),
      );
      if (typeof document === "undefined" || !document.body) return node;
      return createPortal(node, document.body);
    }

    function SkillPickerButton(props) {
      const tr = lookup;
      const [open, setOpen] = useState(false);
      const btnRef = useRef(null);
      const inputActions = props && props.inputActions;
      const useInputHook = props && typeof props.useInput === "function" ? props.useInput : null;
      const draft = useInputHook ? (useInputHook((s) => (s && s.draft) || "") || "") : "";
      const sessionId = props && props.sessionId;
      const [activeSkill, setActiveSkill] = useState(() => {
        if (typeof window !== "undefined" && window.__omnimuxActiveSkill) {
          return window.__omnimuxActiveSkill;
        }
        return null;
      });

      const sessions = typeof plazaSessions !== "undefined" ? plazaSessions : null;
      const [currentPreset, setCurrentPreset] = useState(() => {
        return SkillShelf.resolveActivePreset({
          props,
          sessions,
        });
      });

      useEffect(() => {
        const updatePreset = () => {
          const s = typeof plazaSessions !== "undefined" ? plazaSessions : null;
          const next = SkillShelf.resolveActivePreset({
            props,
            sessions: s,
          });
          setCurrentPreset((prev) => (prev !== next ? next : prev));
        };
        updatePreset();
        const s = typeof plazaSessions !== "undefined" ? plazaSessions : null;
        if (s && s.list && typeof s.list.subscribe === "function") {
          return s.list.subscribe(updatePreset);
        }
        return undefined;
      }, [sessionId, props]);

      const presetBinding = SkillShelf.getPresetSkillBinding(currentPreset);

      useEffect(() => { setOpen(false); }, [sessionId]);

      useEffect(() => {
        const payload = SkillShelf.buildSearchPayload("all", "");
        loadPickerSearch(payload).catch(() => {});
      }, []);

      useEffect(() => {
        if (!open) return undefined;
        const onPage = () => setOpen(false);
        window.addEventListener("dsh-product-stage", onPage);
        return () => window.removeEventListener("dsh-product-stage", onPage);
      }, [open]);

      // 如果当前预设没有绑定 skill 则默认不显示 skill 按钮
      if (!presetBinding) {
        return null;
      }

      const close = useCallback(() => setOpen(false), []);

      const clearActiveSkill = useCallback(() => {
        setActiveSkill(null);
        if (typeof window !== "undefined") {
          window.__omnimuxActiveSkill = null;
          try {
            window.dispatchEvent(new CustomEvent("omnimux:skill:changed", {
              detail: { skill: null, category: "" },
            }));
          } catch {}
        }
      }, []);

      const applyItem = useCallback((item) => {
        focusComposerCard();
        setActiveSkill(item);
        if (typeof window !== "undefined") {
          window.__omnimuxActiveSkill = item;
          try {
            window.dispatchEvent(new CustomEvent("omnimux:skill:changed", {
              detail: {
                skill: item,
                category: item.category || (item.categories && item.categories[0]) || "",
              },
            }));
          } catch {}
        }
        const payload = SkillShelf.installPayload(item);
        if (payload) {
          api("install", payload).catch(() => {});
        }
        setOpen(false);
        return true;
      }, []);

      const onExplore = useCallback(() => {
        writePlazaSkillsIntent();
        setOpen(false);
        const wb = typeof window !== "undefined" ? window.__omnimuxWorkbench : undefined;
        if (wb && typeof wb.open === "function") {
          wb.open({ tabId: "omnimux-market:plaza", title: tr("plaza.title") });
        }
      }, [tr]);

      const onCreate = useCallback(() => {
        applyItem(SkillShelf.CREATE_SKILL);
      }, [applyItem]);

      return h(I18nProvider, { t: tr },
        h("div", { className: "sh-picker-wrap" },
          h("button", {
            ref: btnRef,
            type: "button",
            className: "sh-picker-trigger" + (open ? " on" : ""),
            "aria-label": tr("picker.title"),
            "aria-haspopup": "dialog",
            "aria-expanded": open ? "true" : "false",
            "data-omnimux-skill-picker": "",
            onClick: () => setOpen((v) => !v),
          },
            renderBookOpenIcon(16),
            h("span", { className: "sh-picker-trigger-label" }, tr("picker.title")),
          ),
          activeSkill ? h("div", {
            className: "sh-active-skill-chip",
            title: activeSkill.description || activeSkill.summary || "",
          },
            h("svg", {
              width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2,
              style: { flexShrink: 0 },
            },
              h("line", { x1: 3, y1: 6, x2: 21, y2: 6 }),
              h("line", { x1: 3, y1: 12, x2: 15, y2: 12 }),
              h("line", { x1: 3, y1: 18, x2: 9, y2: 18 }),
            ),
            h("span", null, activeSkill.name || activeSkill.title || activeSkill.slug),
            h("button", {
              type: "button",
              className: "sh-chip-close",
              title: "移除技能",
              "aria-label": "移除技能",
              onClick: (e) => {
                e.stopPropagation();
                clearActiveSkill();
              },
            },
              h("svg", {
                width: 10,
                height: 10,
                viewBox: "0 0 10 10",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.5,
                strokeLinecap: "round",
                style: { display: "block" },
              },
                h("path", { d: "M2 2L8 8M8 2L2 8" }),
              ),
            ),
          ) : null,
          h(SkillPickerPanel, {
            open,
            anchorRef: btnRef,
            onClose: close,
            onPick: applyItem,
            onExplore,
            onCreate,
            t: tr,
            presetBinding,
          }),
        ),
      );
    }
