    // 模型选择器：默认自动，可手动选择模型。
    // 勾选模型后关闭自动，并在输入框胶囊展示「模型图标 + 名称」。

    const MODEL_CATALOG = {
      video: [
        {
          id: "seedance-2-5",
          name: "Dreamina Seedance 2.5",
          capsuleName: "Dreamina Seedance 2.5",
          type: "video",
          subtitle: "30秒视频生成，精准片段编辑",
          pro: true,
          badge: null,
          icon: "dreamina",
        },
        {
          id: "seedance-2-0-fast",
          name: "Dreamina Seedance 2.0 快速版",
          capsuleName: "Dreamina Seedance 2.0 Fast",
          type: "video",
          subtitle: "细节和质量提升，成本更低",
          pro: true,
          badge: { text: "高达43%折扣", type: "purple" },
          icon: "dreamina",
        },
        {
          id: "seedance-2-0",
          name: "Dreamina Seedance 2.0",
          capsuleName: "Dreamina Seedance 2.0",
          type: "video",
          subtitle: "更精准的参考，更真实，高达4K",
          pro: true,
          badge: null,
          icon: "dreamina",
        },
        {
          id: "seedance-2-0-mini-trial",
          name: "Dreamina Seedance 2.0 Mini (试用版)",
          capsuleName: "Dreamina Seedance 2.0 Mini",
          type: "video",
          subtitle: "最适合快速生成，仅需7积分/秒",
          pro: true,
          badge: { text: "新增", type: "green" },
          icon: "dreamina",
        },
        {
          id: "seedance-2-0-mini",
          name: "Dreamina Seedance 2.0 Mini",
          capsuleName: "Dreamina Seedance 2.0 Mini",
          type: "video",
          subtitle: "轻量级推理，最具成本效益",
          pro: true,
          badge: { text: "最高可享58折优惠", type: "purple" },
          icon: "dreamina",
        },
      ],
      image: [
        {
          id: "nanobanana-pro",
          name: "Nano Banana Pro",
          capsuleName: "Nano Banana Pro",
          type: "image",
          subtitle: "专业图像质量和文本布局",
          pro: true,
          badge: null,
          icon: "nanobanana",
        },
        {
          id: "gpt-image-2",
          name: "GPT图像2",
          capsuleName: "GPT图像2",
          type: "image",
          subtitle: "精准文本渲染，更强的推理能力",
          pro: false,
          badge: null,
          icon: "openai",
        },
        {
          id: "nanobanana",
          name: "Nano Banana",
          capsuleName: "Nano Banana",
          type: "image",
          subtitle: "图像质量可靠，价格更实惠",
          pro: false,
          badge: null,
          icon: "nanobanana",
        },
        {
          id: "seedream-5-0-pro",
          name: "Seedream 5.0 Pro",
          capsuleName: "Seedream 5.0 Pro",
          type: "image",
          subtitle: "更精确、更可控的编辑",
          pro: true,
          badge: null,
          icon: "seedream",
        },
        {
          id: "seedream-5-0-lite",
          name: "Seedream 5.0 Lite",
          capsuleName: "Seedream 5.0 Lite",
          type: "image",
          subtitle: "卓越的提示遵循和推理能力",
          pro: false,
          badge: null,
          icon: "seedream",
        },
      ],
    };

    function renderModelLayersIcon(size = 16) {
      const px = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 16;
      return h("svg", {
        width: px,
        height: px,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { width: px + "px", height: px + "px", flex: "none", display: "block" },
      },
        h("path", { d: "m12 2 10 5-10 5L2 7Z" }),
        h("path", { d: "m2 17 10 5 10-5" }),
        h("path", { d: "m2 12 10 5 10-5" }),
      );
    }

    function renderPurpleDiamond(size = 13) {
      const px = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 13;
      return h("svg", {
        width: px,
        height: px,
        viewBox: "0 0 24 24",
        fill: "currentColor",
        className: "sh-model-diamond",
        style: { width: px + "px", height: px + "px", flexShrink: 0, display: "inline-block" },
      },
        h("path", { d: "M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2Z" }),
      );
    }

    function renderModelIcon(iconType, size = 16) {
      const px = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 16;
      if (iconType === "dreamina") {
        return h("svg", {
          width: px,
          height: px,
          viewBox: "0 0 24 24",
          fill: "currentColor",
          style: { width: px + "px", height: px + "px", flex: "none", display: "block" },
        },
          h("path", { d: "M6 16.5C8.5 14 11 11.5 12 3.5C13.5 9.5 17 12 21 13C15 15.5 13 18.5 11.5 21C10 18 8 17 6 16.5Z" }),
        );
      }
      if (iconType === "openai") {
        return h("svg", {
          width: px,
          height: px,
          viewBox: "0 0 24 24",
          fill: "currentColor",
          style: { width: px + "px", height: px + "px", flex: "none", display: "block" },
        },
          h("path", { d: "M22.28 9.82a6 6 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.5-2.9A6.07 6.07 0 0 0 4.98 4.18a6 6 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 6 6 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.2 6 6 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.08zM13.26 22.43a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.59a4.5 4.5 0 0 1-4.5 4.49zm-9.66-4.13a4.47 4.47 0 0 1-.53-3l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.85-3.37v2.33a.08.08 0 0 1-.03.06l-4.84 2.79a4.5 4.5 0 0 1-6.15-1.65zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.98v5.68a.77.77 0 0 0 .38.68l5.82 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.1 3.85L12.6 8.38l2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.5 4.5 0 0 1-.67 8.1v-5.67a.8.8 0 0 0-.41-.67zm2.01-3.02l-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.14 1.65 4.47 4.47 0 0 1 .58 3.01zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.8.8 0 0 0-.4.68zm1.1-2.36l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z" }),
        );
      }
      if (iconType === "nanobanana") {
        return h("svg", {
          width: px,
          height: px,
          viewBox: "0 0 24 24",
          fill: "currentColor",
          style: { width: px + "px", height: px + "px", flex: "none", display: "block" },
        },
          h("path", { d: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 17.5a7.5 7.5 0 1 1 7.5-7.5 7.5 7.5 0 0 1-7.5 7.5zm0-11a3.5 3.5 0 1 0 3.5 3.5A3.5 3.5 0 0 0 12 8.5zm0 5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5z" }),
        );
      }
      if (iconType === "seedream") {
        return h("svg", {
          width: px,
          height: px,
          viewBox: "0 0 24 24",
          fill: "currentColor",
          style: { width: px + "px", height: px + "px", flex: "none", display: "block" },
        },
          h("rect", { x: "4.5", y: "8", width: "3.5", height: "10", rx: "1.75" }),
          h("rect", { x: "10.25", y: "4", width: "3.5", height: "16", rx: "1.75" }),
          h("rect", { x: "16", y: "8", width: "3.5", height: "10", rx: "1.75" }),
        );
      }
      return renderModelLayersIcon(px);
    }

    function ModelPickerPanel({ open, anchorRef, auto, selectedModel, onToggleAuto, onSelectModel, onClose, t }) {
      const tr = typeof t === "function" ? t : lookup;
      const panelRef = useRef(null);
      const [tab, setTab] = useState("video");
      const [pos, setPos] = useState({ left: 0, top: 0, width: 380 });

      useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => {
          const anchor = anchorRef && anchorRef.current;
          const panel = panelRef.current;
          if (!anchor || typeof anchor.getBoundingClientRect !== "function") return;
          const r = anchor.getBoundingClientRect();
          const width = Math.min(400, Math.max(360, Math.min(380, window.innerWidth - 16)));
          const height = panel ? panel.offsetHeight : 440;
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
      }, [open, tab, anchorRef]);

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

      if (!open) return null;

      const items = MODEL_CATALOG[tab] || [];

      const node = h("div", {
        ref: panelRef,
        className: "sh-model-picker",
        role: "dialog",
        "aria-label": tr("modelPicker.title") || "模型",
        "aria-modal": "true",
        style: { left: pos.left + "px", top: pos.top + "px", width: pos.width + "px" },
      },
        h("div", { className: "sh-model-picker-header" },
          h("div", { className: "sh-model-picker-title" }, tr("modelPicker.title") || "模型"),
          h("div", { className: "sh-model-auto-row" },
            h("span", { className: "sh-model-auto-label" }, tr("modelPicker.auto") || "自动"),
            h("button", {
              type: "button",
              role: "switch",
              "aria-checked": auto ? "true" : "false",
              className: "sh-model-switch" + (auto ? " on" : ""),
              onClick: () => onToggleAuto(!auto),
            },
              h("span", { className: "sh-model-switch-thumb" }),
            ),
          ),
        ),
        h("div", { className: "sh-model-tabs", role: "tablist" },
          h("button", {
            type: "button",
            role: "tab",
            className: "sh-model-tab" + (tab === "video" ? " active" : ""),
            "aria-selected": tab === "video",
            onClick: () => setTab("video"),
          }, tr("modelPicker.tab.video") || "视频"),
          h("button", {
            type: "button",
            role: "tab",
            className: "sh-model-tab" + (tab === "image" ? " active" : ""),
            "aria-selected": tab === "image",
            onClick: () => setTab("image"),
          }, tr("modelPicker.tab.image") || "图像"),
        ),
        h("div", { className: "sh-model-section-title" }, tab === "video" ? (tr("modelPicker.tab.video") || "视频") : (tr("modelPicker.tab.image") || "图像")),
        h("div", { className: "sh-model-list", role: "listbox" },
          items.map((model) => {
            const isSelected = !auto && selectedModel && selectedModel.id === model.id;
            return h("div", {
              key: model.id,
              className: "sh-model-row" + (isSelected ? " selected" : ""),
              role: "option",
              "aria-selected": isSelected ? "true" : "false",
              onClick: () => onSelectModel(model),
            },
              h("div", { className: "sh-model-row-left" },
                h("div", { className: "sh-model-icon-box" }, renderModelIcon(model.icon, 20)),
                h("div", { className: "sh-model-row-info" },
                  h("div", { className: "sh-model-row-title-row" },
                    h("span", { className: "sh-model-name" }, model.name),
                    model.pro ? renderPurpleDiamond(13) : null,
                    model.badge ? h("span", { className: "sh-model-badge " + (model.badge.type || "purple") }, model.badge.text) : null,
                  ),
                  h("div", { className: "sh-model-row-desc" }, model.subtitle),
                ),
              ),
              h("div", { className: "sh-model-row-right" },
                h("div", { className: "sh-model-radio" + (isSelected ? " checked" : "") },
                  isSelected ? h("span", { className: "sh-model-radio-dot" }) : null,
                ),
              ),
            );
          }),
        ),
      );

      if (typeof document === "undefined" || !document.body) return node;
      return createPortal(node, document.body);
    }

    function ModelPickerButton(props) {
      const tr = lookup;
      const [open, setOpen] = useState(false);
      const btnRef = useRef(null);
      const sessions = typeof plazaSessions !== "undefined" ? plazaSessions : null;

      const [sessionId, setSessionId] = useState(() => {
        return (props && props.sessionId) ||
          (sessions && sessions.list && typeof sessions.list.getSnapshot === "function" && sessions.list.getSnapshot().current) ||
          "default";
      });

      const [auto, setAuto] = useState(() => {
        try {
          const sid = (props && props.sessionId) ||
            (sessions && sessions.list && typeof sessions.list.getSnapshot === "function" && sessions.list.getSnapshot().current) ||
            "default";
          const raw = window.sessionStorage.getItem("omnimux:model:" + sid);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.auto === "boolean") return parsed.auto;
          }
        } catch {}
        return true;
      });

      const [selectedModel, setSelectedModel] = useState(() => {
        try {
          const sid = (props && props.sessionId) ||
            (sessions && sessions.list && typeof sessions.list.getSnapshot === "function" && sessions.list.getSnapshot().current) ||
            "default";
          const raw = window.sessionStorage.getItem("omnimux:model:" + sid);
          if (raw) {
            const parsed = JSON.parse(raw);
            return parsed.selectedModel || null;
          }
        } catch {}
        return null;
      });

      useEffect(() => {
        const updateSession = () => {
          const s = typeof plazaSessions !== "undefined" ? plazaSessions : null;
          const currentId = (props && props.sessionId) ||
            (s && s.list && typeof s.list.getSnapshot === "function" && s.list.getSnapshot().current) ||
            "default";
          setSessionId((prev) => {
            if (prev !== currentId) {
              try {
                const raw = window.sessionStorage.getItem("omnimux:model:" + currentId);
                if (raw) {
                  const parsed = JSON.parse(raw);
                  setAuto(typeof parsed.auto === "boolean" ? parsed.auto : true);
                  setSelectedModel(parsed.selectedModel || null);
                } else {
                  setAuto(true);
                  setSelectedModel(null);
                }
              } catch {
                setAuto(true);
                setSelectedModel(null);
              }
              return currentId;
            }
            return prev;
          });
        };
        updateSession();
        if (sessions && sessions.list && typeof sessions.list.subscribe === "function") {
          return sessions.list.subscribe(updateSession);
        }
        return undefined;
      }, [props, sessions]);

      const handleToggleAuto = useCallback((nextAuto) => {
        setAuto(nextAuto);
        if (nextAuto) {
          setSelectedModel(null);
        }
        try {
          window.sessionStorage.setItem("omnimux:model:" + sessionId, JSON.stringify({
            auto: nextAuto,
            selectedModel: nextAuto ? null : selectedModel,
          }));
          window.dispatchEvent(new CustomEvent("omnimux:model:changed", {
            detail: { sessionId, auto: nextAuto, selectedModel: nextAuto ? null : selectedModel },
          }));
        } catch {}
        if (typeof api === "function") {
          api("setModelSelection", {
            sessionId,
            auto: nextAuto,
            selectedModel: nextAuto ? null : selectedModel,
          }).catch(() => {});
        }
      }, [sessionId, selectedModel]);

      const handleSelectModel = useCallback((model) => {
        setAuto(false);
        setSelectedModel(model);
        try {
          window.sessionStorage.setItem("omnimux:model:" + sessionId, JSON.stringify({
            auto: false,
            selectedModel: model,
          }));
          window.dispatchEvent(new CustomEvent("omnimux:model:changed", {
            detail: { sessionId, auto: false, selectedModel: model },
          }));
        } catch {}
        if (typeof api === "function") {
          api("setModelSelection", {
            sessionId,
            auto: false,
            selectedModel: model,
          }).catch(() => {});
        }
        setOpen(false);
      }, [sessionId]);

      const isModelChosen = !auto && selectedModel;

      return h("div", { className: "sh-model-picker-wrap" },
        isModelChosen ? h("button", {
          ref: btnRef,
          type: "button",
          className: "sh-model-capsule-btn" + (open ? " on" : ""),
          "aria-label": selectedModel.name,
          title: selectedModel.name,
          "aria-haspopup": "dialog",
          "aria-expanded": open ? "true" : "false",
          "data-omnimux-model-capsule": "",
          onClick: () => setOpen((v) => !v),
        },
          renderModelIcon(selectedModel.icon, 16),
          h("span", { className: "sh-model-capsule-name" }, selectedModel.capsuleName || selectedModel.name),
        ) : h("button", {
          ref: btnRef,
          type: "button",
          className: "sh-picker-trigger sh-model-picker-trigger" + (open ? " on" : ""),
          "aria-label": tr("modelPicker.title") || "模型",
          title: tr("modelPicker.title") || "模型",
          "aria-haspopup": "dialog",
          "aria-expanded": open ? "true" : "false",
          "data-omnimux-model-picker": "",
          onClick: () => setOpen((v) => !v),
        },
          renderModelLayersIcon(16),
          h("span", { className: "sh-picker-trigger-label" }, tr("modelPicker.title") || "模型"),
        ),
        h(ModelPickerPanel, {
          open,
          anchorRef: btnRef,
          auto,
          selectedModel,
          onToggleAuto: handleToggleAuto,
          onSelectModel: handleSelectModel,
          onClose: () => setOpen(false),
          t: tr,
        }),
      );
    }
