window.__ModuleLoader__.load({
  id: "omnimux-device",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  DeviceStage: () => DeviceStage,
  createTranslate: () => createTranslate,
  locales: () => locales,
  mountSidebarEntry: () => mountSidebarEntry
});
module.exports = __toCommonJS(index_exports);

// src/client/sidebar-entry.js
var import_dsh_ui_kit = require("dsh-ui-kit");
var DEVICE_TAB_ID = "omnimux-device:library";
var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>';
function resolveWorkbenchTitle(t) {
  try {
    const val = typeof t === "function" ? t("nav") : void 0;
    if (val && val !== "nav") return val;
  } catch {
  }
  return "\u771F\u673A\u77E9\u9635";
}
function createWorkbenchStageStore(t, tabId) {
  let store = null;
  const ensure = () => {
    if (store) return store;
    const api = typeof window !== "undefined" ? window.__omnimuxWorkbench : void 0;
    if (!api || typeof api.createSidebarStore !== "function") return null;
    store = api.createSidebarStore({
      tabId,
      title: () => resolveWorkbenchTitle(t)
    });
    return store;
  };
  return {
    getSnapshot() {
      return Boolean(ensure()?.getSnapshot?.());
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {
      };
      const ready = ensure();
      if (ready && typeof ready.subscribe === "function") return ready.subscribe(listener);
      let unsub = () => {
      };
      const started = Date.now();
      const timer = setInterval(() => {
        const next = ensure();
        if (next && typeof next.subscribe === "function") {
          clearInterval(timer);
          unsub = next.subscribe(listener);
          listener();
          return;
        }
        if (Date.now() - started > 8e3) clearInterval(timer);
      }, 50);
      return () => {
        clearInterval(timer);
        unsub();
      };
    },
    open() {
      const s = ensure();
      if (!s) return;
      s.open();
    },
    close() {
      ensure()?.close?.();
    },
    set(next) {
      if (next) this.open();
      else this.close();
    },
    readBox() {
      return ensure()?.readBox?.() || { top: 0, left: 0, width: 0, height: 0 };
    }
  };
}
function mountSidebarEntry(_stage, t, locale) {
  return (0, import_dsh_ui_kit.createSidebarEntry)({
    id: "omnimux-device",
    rank: 6,
    label: () => typeof t === "function" ? t("nav") : "\u771F\u673A\u77E9\u9635",
    iconSvg: ICON,
    stageStore: createWorkbenchStageStore(t, DEVICE_TAB_ID),
    locale,
    access: "cloud",
    customClassName: "omnimux-device-entry",
    datasetKey: "data-omnimux-device-entry"
  });
}

// src/client/DeviceStage.jsx
var import_react = require("react");
var import_dsh_ui_kit2 = require("dsh-ui-kit");

// src/client/styles.js
var STYLE_ID = "omnimux-device-styles";
function injectDeviceStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .omnimux-device-stage {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--dsw-alias-bg-base, #111113);
      color: var(--dsw-alias-label-primary, #ffffff);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif;
    }

    .omx-stage-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 24px;
      border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      background: var(--dsw-alias-bg-primary, #16181d);
      flex-shrink: 0;
    }

    .omx-stage-tab-btn {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.72));
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .omx-stage-tab-btn:hover {
      background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06));
      color: var(--dsw-alias-label-primary, #ffffff);
    }
    .omx-stage-tab-btn.active {
      background: var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.1));
      color: #ffffff;
      font-weight: 600;
      border-color: var(--dsw-alias-border-l2, rgba(255,255,255,0.15));
    }

    .omx-stage-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }

    .omx-grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .omx-card {
      background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.04));
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      border-radius: 12px;
      padding: 16px;
      transition: all 0.15s ease;
      cursor: pointer;
    }
    .omx-card:hover {
      border-color: var(--dsw-alias-border-l3, rgba(255,255,255,0.25));
      background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06));
      transform: translateY(-1px);
    }

    /* 32px \u63A7\u4EF6\u9AD8\u57FA\u51C6\u4E0E Ink CTA */
    .omx-btn-ink {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      background: #ffffff;
      color: #000000;
      border: 1px solid transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.12s ease;
    }
    .omx-btn-ink:hover { background: #e2e8f0; }

    .omx-btn-subtle {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,0.05));
      color: var(--dsw-alias-label-primary, #ffffff);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.12s ease;
    }
    .omx-btn-subtle:hover {
      background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.08));
      border-color: var(--dsw-alias-border-l3, rgba(255,255,255,0.25));
    }
  `;
  document.head.appendChild(style);
}

// src/client/DeviceStage.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var TAB_ID = "omnimux-device:library";
function DeviceStage({ t, stage, store, visible = true }) {
  const [activeTab, setActiveTab] = (0, import_react.useState)("fleet");
  const [toastMsg, setToastMsg] = (0, import_react.useState)("");
  (0, import_react.useEffect)(() => {
    injectDeviceStyles();
  }, []);
  (0, import_react.useEffect)(() => {
    const api = typeof window !== "undefined" ? window.__omnimuxWorkbench : void 0;
    if (!api || typeof api.attachStore !== "function" || !store) return void 0;
    api.attachStore(store);
    return () => {
      api.detachStore?.(store);
    };
  }, [store]);
  const handleClose = () => {
    const api = typeof window !== "undefined" ? window.__omnimuxWorkbench : void 0;
    if (api && typeof api.closeTab === "function") {
      api.closeTab(TAB_ID);
    } else {
      stage?.set?.(false);
    }
  };
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2400);
  };
  const title = typeof t === "function" ? t("title") : "\u79FB\u52A8\u771F\u673A\u77E9\u9635\u4E0E\u8BBE\u5907\u667A\u80FD\u4F53\u4E2D\u67A2";
  const subtitle = typeof t === "function" ? t("subtitle") : "\u672C\u5730\u7269\u7406\u771F\u673A\u9635\u5217\u7EB3\u7BA1\uFF0C11\u9879\u5E95\u5C42\u5065\u5EB7\u81EA\u68C0\u4E0E\u53CC\u8111\u51B3\u7B56\u63A7\u5236\u56DE\u8DEF";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      role: "region",
      "aria-label": title,
      "aria-hidden": visible ? void 0 : "true",
      className: "omnimux-device-stage",
      style: { display: visible ? "flex" : "none" },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          import_dsh_ui_kit2.PageHeader,
          {
            title,
            subtitle,
            onClose: handleClose,
            actionSlot: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: "8px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-subtle", onClick: () => showToast("\u5DF2\u5BF9\u5168\u90E8\u8BBE\u5907\u91CD\u65B0\u6267\u884C 11 \u9879\u5065\u5EB7\u81EA\u68C0\uFF0C\u5168\u90E8\u6307\u6807\u6B63\u5E38"), children: "\u5168\u91CF\u91CD\u65B0\u4F53\u68C0" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-ink", onClick: () => showToast("\u8BF7\u901A\u8FC7 USB \u6570\u636E\u7EBF\u5C06 iPhone \u63A5\u5165\u5F53\u524D Mac \u5E76\u5728\u624B\u673A\u4E0A\u70B9\u51FB\u4FE1\u4EFB"), children: "+ \u63A5\u5165\u65B0\u624B\u673A" })
            ] })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-stage-tabs", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: `omx-stage-tab-btn ${activeTab === "fleet" ? "active" : ""}`,
              onClick: () => setActiveTab("fleet"),
              children: "\u771F\u673A\u5927\u5C4F\u4E0E\u4F53\u68C0"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: `omx-stage-tab-btn ${activeTab === "schedules" ? "active" : ""}`,
              onClick: () => setActiveTab("schedules"),
              children: "\u5468\u6392\u671F\u53D1\u5E03\u65E5\u5386"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: `omx-stage-tab-btn ${activeTab === "inspector" ? "active" : ""}`,
              onClick: () => setActiveTab("inspector"),
              children: "\u6545\u969C\u65AD\u70B9\u5BF9\u6BD4\u5668"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: `omx-stage-tab-btn ${activeTab === "signing" ? "active" : ""}`,
              onClick: () => setActiveTab("signing"),
              children: "\u82F9\u679C\u5F00\u53D1\u8005\u8BC1\u4E66"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: `omx-stage-tab-btn ${activeTab === "warmup" ? "active" : ""}`,
              onClick: () => setActiveTab("warmup"),
              children: "\u81EA\u52A8\u5316\u517B\u53F7\u7B56\u7565"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-stage-content", children: [
          activeTab === "fleet" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-grid-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-card", onClick: () => showToast("\u5DF2\u6253\u5F00 01\u53F7\u673A (iPhone 13) \u5B9E\u65F6\u8C03\u8BD5\u9762\u677F"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "8px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "14px", color: "#fff" }, children: "01\u53F7\u673A (iPhone 13)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "10px", color: "var(--dsw-accent-green)", background: "rgba(16,185,129,0.12)", padding: "2px 6px", borderRadius: "9999px", fontWeight: "bold" }, children: "\u5C31\u7EEA" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontFamily: "var(--font-mono)" }, children: "\u4EE3\u7406: \u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 22ms \xB7 100% \u6EE1\u7535" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { height: "120px", background: "#000", borderRadius: "8px", margin: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" }, children: "[TikTok \u524D\u53F0\u6D3B\u8DC3 \xB7 \u4F1A\u8BDD\u6B63\u5E38]" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", color: "#fff", display: "flex", gap: "6px" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { background: "rgba(255,255,255,0.06)", padding: "3px 6px", borderRadius: "4px" }, children: "\u{1F3B5} @trend_cat_us" }) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-card", onClick: () => showToast("\u5DF2\u6253\u5F00 02\u53F7\u673A (iPhone 13) \u5B9E\u65F6\u8C03\u8BD5\u9762\u677F"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "8px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "14px", color: "#fff" }, children: "02\u53F7\u673A (iPhone 13)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "10px", color: "var(--dsw-accent-green)", background: "rgba(16,185,129,0.12)", padding: "2px 6px", borderRadius: "9999px", fontWeight: "bold" }, children: "\u5C31\u7EEA" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontFamily: "var(--font-mono)" }, children: "\u4EE3\u7406: \u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 25ms \xB7 100% \u6EE1\u7535" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { height: "120px", background: "#000", borderRadius: "8px", margin: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" }, children: "[\u76F8\u518C\u7D20\u6750\u9009\u62E9\u9875\u5C31\u7EEA]" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", color: "#fff", display: "flex", gap: "6px" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { background: "rgba(255,255,255,0.06)", padding: "3px 6px", borderRadius: "4px" }, children: "\u{1F3B5} @beauty_tips_us" }) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-card", onClick: () => showToast("\u5DF2\u6253\u5F00 03\u53F7\u673A (iPhone 13) \u5B9E\u65F6\u8C03\u8BD5\u9762\u677F"), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "8px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "14px", color: "#fff" }, children: "03\u53F7\u673A (iPhone 13)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "10px", color: "var(--dsw-accent-rose)", background: "rgba(244,63,94,0.12)", padding: "2px 6px", borderRadius: "9999px", fontWeight: "bold" }, children: "\u9700\u4EBA\u5DE5\u5173\u6CE8" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontFamily: "var(--font-mono)" }, children: "\u4EE3\u7406: \u82F1\u56FD\u4F26\u6566 \xB7 32ms \xB7 96% \u7535\u91CF" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { height: "120px", background: "#000", borderRadius: "8px", margin: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", color: "var(--dsw-accent-rose)", border: "1px solid rgba(244,63,94,0.3)" }, children: "[\u68C0\u6D4B\u5230\u8BC4\u5206\u5F39\u7A97\u963B\u65AD]" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", color: "#fff", display: "flex", gap: "6px" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { background: "rgba(255,255,255,0.06)", padding: "3px 6px", borderRadius: "4px" }, children: "\u{1F3B5} @pet_care_uk" }) })
            ] })
          ] }),
          activeTab === "schedules" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", padding: "20px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { fontSize: "15px", color: "#fff", marginBottom: "8px" }, children: "\u672C\u5468\u77ED\u89C6\u9891\u81EA\u52A8\u53D1\u5E03\u6392\u671F (\u5468\u4E00\u81F3\u5468\u65E5)" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", marginBottom: "16px" }, children: "\u81EA\u52A8\u6839\u636E\u76EE\u6807\u8D26\u53F7\u6240\u5728\u5730\uFF08\u7F8E\u4E1C EST / \u7F8E\u897F PST / \u6B27\u6D32 GMT\uFF09\u8FDB\u884C\u9EC4\u91D1\u6D41\u91CF\u65F6\u533A\u5BF9\u9F50\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px" }, children: ["\u5468\u4E00 (9/15)", "\u5468\u4E8C (9/16)", "\u5468\u4E09 (\u4ECA\u65E5)", "\u5468\u56DB (9/18)", "\u5468\u4E94 (9/19)", "\u5468\u516D (9/20)", "\u5468\u65E5 (9/21)"].map((day, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "8px", padding: "10px", minHeight: "240px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", fontWeight: "bold", color: i === 2 ? "var(--dsw-accent-blue)" : "#fff", marginBottom: "8px" }, children: day }),
              i === 2 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "rgba(255,255,255,0.08)", borderRadius: "6px", padding: "6px", fontSize: "10px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-accent-blue)", fontWeight: "bold" }, children: "18:00 (\u7F8E\u4E1C)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#fff" }, children: "@trend_cat_us" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)" }, children: "1\u53F7\u69FD\u4F4D\u6392\u961F" })
              ] })
            ] }, day)) })
          ] }),
          activeTab === "inspector" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", padding: "20px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "14px", color: "#fff" }, children: "\u6545\u969C\u65AD\u70B9\u5BF9\u6BD4\u5668 (\u6BCF\u6B21\u5F02\u5E38\u7686\u6709\u660E\u786E\u5F52\u56E0)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u5BF9\u6BD4\u3010\u9884\u671F\u63A7\u4EF6\u7ED3\u6784\u3011\u4E0E\u3010\u5B9E\u9645\u906D\u9047\u8986\u76D6\u5C42\u3011\uFF0C\u652F\u6301 TypeSafe 100ms \u4E00\u952E\u81EA\u6108" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-ink", onClick: () => showToast("TypeSafe \u51B3\u7B56\u5F15\u64CE\u5DF2\u5728 112 \u6BEB\u79D2\u5185\u81EA\u52A8\u8BC6\u522B\u5E76\u5173\u95ED\u5F39\u7A97\uFF01"), children: "\u6267\u884C\u51B3\u7B56\u5F15\u64CE\u4E00\u952E\u81EA\u6108" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "#000", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", height: "220px", padding: "12px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "11px", color: "var(--dsw-accent-green)", fontWeight: "bold" }, children: "\u9884\u671F\u754C\u9762\uFF1A\u76F8\u518C\u4E5D\u5BAB\u683C\u9009\u62E9\u9875" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { textAlign: "center", color: "var(--dsw-alias-label-tertiary)", marginTop: "60px", fontSize: "12px" }, children: "\u9996\u56FE\u65E0\u969C\u788D\u5C5E\u6027\u6B63\u5E38 \xB7 \u70B9\u51FB\u4F4D\u5C31\u7EEA" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "#000", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "8px", height: "220px", padding: "12px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "11px", color: "var(--dsw-accent-rose)", fontWeight: "bold" }, children: "\u5B9E\u9645\u754C\u9762\uFF1A\u906D\u9047\u5E94\u7528\u5546\u5E97\u8BC4\u5206\u5F39\u7A97" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { textAlign: "center", background: "rgba(244,63,94,0.1)", padding: "10px", borderRadius: "6px", marginTop: "50px", fontSize: "12px", color: "#fff" }, children: "\u201C\u559C\u6B22\u8FD9\u6B3E\u5E94\u7528\u5417\uFF1F\u8BF7\u8BC4\u5206\u201D" })
              ] })
            ] })
          ] }),
          activeTab === "signing" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", padding: "20px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { fontSize: "15px", color: "#fff", marginBottom: "8px" }, children: "\u82F9\u679C\u5F00\u53D1\u8005\u8BC1\u4E66\u6C60\u7BA1\u7406" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", marginBottom: "14px" }, children: "\u901A\u8FC7\u591A Team ID \u5BC6\u94A5\u6A2A\u5411\u6269\u5C55\uFF0C\u6253\u7834\u5355\u8D26\u53F7 100 \u53F0 UDID \u4E0A\u9650\uFF0C\u652F\u6301\u6570\u767E\u53F0\u771F\u673A\u96C6\u7FA4\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "8px", padding: "12px", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { color: "#fff", fontSize: "13px" }, children: "\u56E2\u961F\u7F16\u53F7: 8K2N94XYZ1 (\u7F8E\u533A\u77E9\u9635\u4E3B\u4F53)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" }, children: "Apple Development \u8BC1\u4E66 \xB7 \u5269\u4F59 294 \u5929" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "12px", color: "var(--dsw-accent-green)", fontWeight: "bold" }, children: "\u5DF2\u4F7F\u7528 85 / 100 \u53F0\u8BBE\u5907" })
            ] })
          ] }),
          activeTab === "warmup" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", padding: "20px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: { fontSize: "15px", color: "#fff", marginBottom: "8px" }, children: "\u5168\u81EA\u4E3B\u667A\u80FD\u517B\u53F7\u7B56\u7565" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "21\u5929\u6E10\u8FDB\u5F0F\u63D0\u9891\u66F2\u7EBF\uFF0C\u5355\u65E5 6~10 \u6B21\u968F\u673A\u5DE1\u68C0\uFF0C\u6A21\u62DF\u771F\u4EBA 14~18 \u5C0F\u65F6\u4F5C\u606F\u7A97\u53E3\u3002" })
          ] })
        ] }),
        toastMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { position: "fixed", bottom: "24px", right: "24px", background: "var(--dsw-alias-bg-elevated)", border: "1px solid var(--dsw-alias-border-l3)", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", color: "#fff", zIndex: 1e3, boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }, children: toastMsg })
      ]
    }
  );
}

// src/client/locales.js
var locales = {
  "zh-CN": {
    nav: "\u771F\u673A\u77E9\u9635",
    title: "\u79FB\u52A8\u771F\u673A\u77E9\u9635\u4E0E\u8BBE\u5907\u667A\u80FD\u4F53\u4E2D\u67A2",
    subtitle: "\u672C\u5730\u7269\u7406\u771F\u673A\u9635\u5217\u7EB3\u7BA1\uFF0C11\u9879\u5E95\u5C42\u5065\u5EB7\u81EA\u68C0\u4E0E\u53CC\u8111\u51B3\u7B56\u63A7\u5236\u56DE\u8DEF",
    refresh: "\u5168\u91CF\u4F53\u68C0",
    addDevice: "\u63A5\u5165\u65B0\u624B\u673A",
    tabFleet: "\u771F\u673A\u5927\u5C4F",
    tabSchedules: "\u5468\u5386\u6392\u671F",
    tabInspector: "\u65AD\u70B9\u5BF9\u6BD4\u5668",
    tabSigning: "\u5F00\u53D1\u8005\u8BC1\u4E66",
    tabWarmup: "\u81EA\u52A8\u517B\u53F7"
  },
  "en-US": {
    nav: "Devices",
    title: "Mobile Device Farm & Agent Brain",
    subtitle: "Local iPhone fleet management with 11 health checks & dual-brain decision loop",
    refresh: "Recheck All",
    addDevice: "Add iPhone",
    tabFleet: "Fleet",
    tabSchedules: "Schedules",
    tabInspector: "Inspector",
    tabSigning: "Apple Signing",
    tabWarmup: "Warmup"
  }
};
function createTranslate(locale = "zh-CN") {
  const dict = locales[locale] || locales["zh-CN"];
  return (key) => dict[key] || key;
}

    return module.exports;
  }
});
