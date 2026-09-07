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

    function renderPuzzleIcon(size = 16) {
      const px = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 16;
      return h("svg", {
        width: px,
        height: px,
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": "true",
        preserveAspectRatio: "xMidYMid meet",
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
          d: "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      );
    }

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

    function SkillPickerPanel({ open, anchorRef, onClose, onPick, onExplore, onCreate, t }) {
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
      }, [open, tabId, debounced]);

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

      const visible = SkillShelf.filterPickerItems(items, tabId);

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
            SkillShelf.PICKER_TABS.map((tab) => h("button", {
              key: tab.id,
              type: "button",
              role: "tab",
              className: "sh-picker-tab" + (tabId === tab.id ? " on" : ""),
              "aria-selected": tabId === tab.id,
              onClick: () => { setTabId(tab.id); setActiveIndex(0); },
            }, tr(tab.labelKey))),
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

      const close = useCallback(() => setOpen(false), []);

      const applyItem = useCallback((item) => {
        const gesture = SkillShelf.skillGesture(item);
        if (!gesture) return false;
        if (!inputActions || typeof inputActions.setDraft !== "function") return false;
        inputActions.setDraft(SkillShelf.appendSkillGesture(draft, gesture));
        focusComposerCard();
        const payload = SkillShelf.installPayload(item);
        if (payload) {
          api("install", payload).catch(() => {});
        }
        setOpen(false);
        return true;
      }, [draft, inputActions]);

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
            renderPuzzleIcon(16),
            h("span", { className: "sh-picker-trigger-label" }, tr("picker.title")),
          ),
          h(SkillPickerPanel, {
            open,
            anchorRef: btnRef,
            onClose: close,
            onPick: applyItem,
            onExplore,
            onCreate,
            t: tr,
          }),
        ),
      );
    }
