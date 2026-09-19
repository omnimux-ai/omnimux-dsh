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
  return "\u624B\u673A\u7BA1\u7406";
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
    rank: 3.5,
    label: () => typeof t === "function" ? t("nav") : "\u624B\u673A\u7BA1\u7406",
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
    /* ==========================================================================
       OmniMux Device UI \u751F\u4EA7\u7EA7\u6837\u5F0F\u89C4\u8303
       1. \u9ED1\u8272\uFF1A100% DSH \u539F\u751F\u7EAF\u7CB9\u66DC\u77F3\u9ED1\u5E95 (#111113) \u4E0E\u4E2D\u6027\u7EAF\u7070\u9ED1\u5361\u7247 (#18181b / #212124)
       2. \u7D2B\u8272\uFF1A\u54C1\u724C\u6781\u5149\u7D2B (#7961f2)\uFF0C\u552F\u4E00\u66FF\u4EE3\u539F\u7CFB\u7EDF\u84DD\u8272\uFF08\u7126\u70B9\u5FAE\u5149\u3001\u9AD8\u4EAE\u80F6\u56CA\uFF09
       3. \u6309\u94AE\uFF1A\u7EAF\u767D\u5E95\u9ED1\u5B57 Ink CTA\uFF0C\u4E25\u7981\u9AD8\u9971\u548C\u5F69\u8272\u901A\u80C0
       4. \u63A7\u4EF6\u51E0\u4F55\uFF1A\u57FA\u51C6\u9AD8\u5EA6 32px\uFF0C\u5706\u89D2 8px\uFF0C\u5361\u7247\u5706\u89D2 12px
       ========================================================================== */

    .omnimux-device-stage {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background-color: var(--dsw-alias-bg-base, #111113);
      background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      background-size: 20px 20px;
      color: var(--dsw-alias-label-primary, #ffffff);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      font-size: 13px;
    }

    /* \u9876\u90E8\u5BFC\u822A\u9009\u9879\u5361\u680F (32px \u57FA\u51C6\uFF0C\u5355\u884C\u6D41) */
    .omx-stage-tabs {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 24px;
      border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.07));
      background: var(--dsw-alias-bg-base, #111113);
      flex-shrink: 0;
      flex-wrap: nowrap;
    }

    .omx-stage-tab-btn {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      color: var(--dsw-alias-label-secondary, rgba(255,255,255,0.70));
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 120ms ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      user-select: none;
      box-sizing: border-box;
    }
    .omx-stage-tab-btn:hover {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      color: var(--dsw-alias-label-primary, #ffffff);
    }
    .omx-stage-tab-btn.active {
      background: var(--dsw-alias-bg-layer-2, #212124);
      color: #ffffff;
      font-weight: 600;
      border-color: var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
    }

    .omx-stage-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }

    /* \u6807\u51C6 32px \u63A7\u4EF6\u6309\u94AE\u4F53\u7CFB */
    .omx-btn-ink {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      background: #ffffff;
      color: #111113;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 120ms ease;
      box-sizing: border-box;
      user-select: none;
    }
    .omx-btn-ink:hover {
      background: rgba(255, 255, 255, 0.90);
      transform: translateY(-1px);
    }
    .omx-btn-ink:active { transform: scale(0.96); }

    .omx-btn-subtle {
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      background: var(--dsw-alias-bg-layer-1, #18181b);
      color: var(--dsw-alias-label-primary, #ffffff);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 120ms ease;
      box-sizing: border-box;
      user-select: none;
    }
    .omx-btn-subtle:hover {
      background: var(--dsw-alias-bg-layer-2, #212124);
      border-color: rgba(255, 255, 255, 0.22);
    }
    .omx-btn-subtle:active { transform: scale(0.96); }

    /* \u54C1\u724C\u6781\u5149\u7D2B\u6807\u8BC6\u5FBD\u7AE0 */
    .omx-badge-violet {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(121, 97, 242, 0.12);
      color: #7961f2;
      border: 1px solid rgba(121, 97, 242, 0.25);
    }

    /* \u5361\u7247\u7F51\u683C (12px \u5706\u89D2\u4E0E\u7EAF\u7070\u9ED1\u5E95) */
    .omx-card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .omx-fleet-card {
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,0.07));
      border-radius: 12px;
      padding: 16px;
      transition: border-color 150ms ease, transform 150ms ease;
      cursor: pointer;
    }
    .omx-fleet-card:hover {
      border-color: rgba(255, 255, 255, 0.22);
      transform: translateY(-1px);
    }

    .omx-mock-screen-box {
      height: 180px;
      background: #000000;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 12px;
      position: relative;
    }

    /* \u6781\u5149\u7D2B\u8F93\u5165\u6846\u7126\u70B9\u6001 */
    .omx-input {
      height: 32px;
      background: var(--dsw-alias-bg-layer-1, #18181b);
      border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      border-radius: 8px;
      color: #ffffff;
      padding: 0 12px;
      font-size: 13px;
      outline: none;
      transition: border-color 120ms ease, box-shadow 120ms ease;
      box-sizing: border-box;
    }
    .omx-input:focus {
      border-color: #7961f2;
      box-shadow: 0 0 0 2px rgba(121, 97, 242, 0.25);
    }

    /* \u5F39\u7A97\u4E0E\u62BD\u5C49 */
    .omx-drawer-mask {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      z-index: 200;
      display: none;
      justify-content: flex-end;
    }
    .omx-drawer-mask.active { display: flex; }

    .omx-drawer-panel {
      width: 460px;
      height: 100%;
      background: var(--dsw-alias-bg-elevated, #1c1c1f);
      border-left: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.12));
      padding: 24px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      animation: slideDrawer 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideDrawer {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
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
  const [activeDrawer, setActiveDrawer] = (0, import_react.useState)(null);
  const [autoHealed, setAutoHealed] = (0, import_react.useState)(false);
  const [teamKeys, setTeamKeys] = (0, import_react.useState)([
    { id: "8K2N94XYZ1", name: "\u7F8E\u533A\u77E9\u9635\u8FD0\u8425\u56E2\u961F", used: 85, days: 294 },
    { id: "3M7P21LAA9", name: "\u6B27\u6D32\u77ED\u89C6\u9891\u77E9\u9635\u56E2\u961F", used: 92, days: 312 }
  ]);
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
    setTimeout(() => setToastMsg(""), 2200);
  };
  const handleAutoHeal = () => {
    showToast("\u51B3\u7B56\u5F15\u64CE\u5DF2\u5728 112 \u6BEB\u79D2\u5185\u8BC6\u522B\u8BE5\u7CFB\u7EDF\u5F39\u7A97\uFF0C\u5E76\u81EA\u52A8\u70B9\u51FB\u300C\u7A0D\u540E\u518D\u8BF4\u300D\uFF0C\u9875\u9762\u5DF2\u6062\u590D\uFF01");
    setAutoHealed(true);
  };
  const handleAddCert = () => {
    const nextId = "9Q1B44WW" + Math.floor(Math.random() * 89 + 10);
    setTeamKeys((prev) => [...prev, { id: nextId, name: "\u65B0\u589E\u5F00\u53D1\u8005\u8D26\u53F7", used: 0, days: 365 }]);
    showToast(`\u65B0\u56E2\u961F\u5BC6\u94A5 ${nextId} \u5F55\u5165\u6210\u529F\uFF0C\u5DF2\u6269\u5BB9 100 \u53F0\u4E00\u5E74\u671F\u6388\u6743\u914D\u989D\uFF01`);
  };
  const title = typeof t === "function" ? t("title") : "\u79FB\u52A8\u771F\u673A\u77E9\u9635\u4E0E\u8BBE\u5907\u667A\u80FD\u4F53\u4E2D\u67A2";
  const subtitle = typeof t === "function" ? t("subtitle") : "\u672C\u5730\u7269\u7406\u771F\u673A\u9635\u5217\u7EB3\u7BA1\uFF0C11\u9879\u5E95\u5C42\u5065\u5EB7\u81EA\u68C0\u4E0E\u53CC\u8111\u51B3\u7B56\u63A7\u5236\u56DE\u8DEF";
  const devices = [
    { id: "dev-01", name: "01\u53F7\u673A", model: "iPhone 13", account: "@trend_cat_us", state: "\u5C31\u7EEA", proxy: "\u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 22\u6BEB\u79D2", battery: "100%" },
    { id: "dev-02", name: "02\u53F7\u673A", model: "iPhone 13", account: "@beauty_tips_us", state: "\u5C31\u7EEA", proxy: "\u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 25\u6BEB\u79D2", battery: "100%" },
    { id: "dev-03", name: "03\u53F7\u673A", model: "iPhone 13", account: "@pet_care_uk", state: "\u9700\u4EBA\u5DE5\u5173\u6CE8", proxy: "\u82F1\u56FD\u4F26\u6566 \xB7 32\u6BEB\u79D2", battery: "96%" },
    { id: "dev-04", name: "04\u53F7\u673A", model: "iPhone 12", account: "@ootd_us", state: "\u9884\u70ED\u4E2D", proxy: "\u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 21\u6BEB\u79D2", battery: "100%" },
    { id: "dev-05", name: "05\u53F7\u673A", model: "iPhone 11", account: "@daily_viral", state: "\u5C31\u7EEA", proxy: "\u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 28\u6BEB\u79D2", battery: "100%" },
    { id: "dev-06", name: "06\u53F7\u673A", model: "iPhone 11", account: "@gadget_zone", state: "\u5C31\u7EEA", proxy: "\u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 26\u6BEB\u79D2", battery: "100%" },
    { id: "dev-07", name: "07\u53F7\u673A", model: "iPhone 8", account: "@recipe_master", state: "\u5C31\u7EEA", proxy: "\u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 30\u6BEB\u79D2", battery: "100%" },
    { id: "dev-08", name: "08\u53F7\u673A", model: "iPhone 8", account: "@humor_short", state: "\u5C31\u7EEA", proxy: "\u7F8E\u56FD\u6D1B\u6749\u77F6 \xB7 31\u6BEB\u79D2", battery: "100%" }
  ];
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
          activeTab === "fleet" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "15px", color: "#fff" }, children: "\u672C\u5730\u673A\u67B6\u786C\u4EF6\u603B\u89C8 (15 \u53F0\u5728\u7EBF\u5E76\u53D1)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u6BCF\u53F0\u624B\u673A\u7ECF\u7531 11 \u9879\u5E95\u5C42\u786C\u6027\u6307\u6807\u4E25\u683C\u4F53\u68C0\u8BA4\u8BC1\uFF0C\u5355\u673A\u72EC\u7ACB Worker \u8FDB\u7A0B\u5B89\u5168\u9694\u79BB" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "omx-badge-violet", children: "\u6781\u5149\u7D2B\u72B6\u6001\u63A2\u9488\u6B63\u5E38" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "omx-card-grid", children: devices.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-fleet-card", onClick: () => setActiveDrawer(d), children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "10px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "13px", color: "#ffffff" }, children: d.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontFamily: "var(--font-mono)" }, children: [
                    d.model,
                    " \xB7 ",
                    d.proxy
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
                  fontSize: "10px",
                  fontWeight: "bold",
                  padding: "2px 7px",
                  borderRadius: "9999px",
                  background: d.state === "\u5C31\u7EEA" ? "rgba(16,185,129,0.12)" : d.state === "\u9884\u70ED\u4E2D" ? "rgba(245,158,11,0.12)" : "rgba(244,63,94,0.12)",
                  color: d.state === "\u5C31\u7EEA" ? "var(--omx-status-green)" : d.state === "\u9884\u70ED\u4E2D" ? "var(--omx-status-amber)" : "var(--omx-status-rose)"
                }, children: d.state })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-mock-screen-box", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#fff" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "09:41" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                    d.battery,
                    " \u6EE1\u7535"
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { textAlign: "center" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", fontWeight: "bold", color: "#ffffff" }, children: d.account }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u4F1A\u8BDD\u6D3B\u8DC3 \xB7 11 \u9879\u4F53\u68C0\u5168\u90E8\u8FBE\u6807" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--dsw-alias-label-tertiary)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "4px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u72EC\u7ACB\u5DE5\u4F5C\u8FDB\u7A0B" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--omx-status-green)" }, children: "\u25CF \u63A7\u5236\u7AEF\u53E3 8100" })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: "10px", display: "flex", gap: "6px" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "11px", background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "6px", padding: "2px 8px", color: "var(--dsw-alias-label-secondary)" }, children: [
                "\u6D77\u5916\u6296\u97F3 ",
                d.account
              ] }) })
            ] }, d.id)) })
          ] }),
          activeTab === "schedules" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", padding: "20px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "15px", color: "#fff" }, children: "\u77ED\u89C6\u9891\u77E9\u9635\u5468\u6392\u671F\u65E5\u5386" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u7EDF\u4E00\u7F16\u6392\u6D77\u5916\u6296\u97F3\u4E0E\u7167\u7247\u5899\u53D1\u5E03\u65F6\u6BB5\uFF0C\u81EA\u52A8\u5BF9\u9F50\u76EE\u6807\u8D26\u53F7\u6240\u5728\u56FD\u5BB6\u65F6\u533A" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-ink", onClick: () => showToast("\u5DF2\u62C9\u8D77\u6279\u91CF\u53D1\u5E03\u6392\u671F\u4EFB\u52A1\u7A97\u53E3"), children: "+ \u65B0\u589E\u53D1\u5E03\u6392\u671F" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "8px", overflow: "hidden" }, children: ["\u5468\u4E00 (9/15)", "\u5468\u4E8C (9/16)", "\u5468\u4E09 (\u4ECA\u65E5)", "\u5468\u56DB (9/18)", "\u5468\u4E94 (9/19)", "\u5468\u516D (9/20)", "\u5468\u65E5 (9/21)"].map((day, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { borderRight: i === 6 ? "none" : "1px solid var(--dsw-alias-border-l1)", background: "var(--dsw-alias-bg-base)", minHeight: "340px", display: "flex", flexDirection: "column" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: "10px", textAlign: "center", borderBottom: "1px solid var(--dsw-alias-border-l1)", background: "var(--dsw-alias-bg-layer-2)" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "11px", fontWeight: "bold", color: i === 2 ? "#ffffff" : "var(--dsw-alias-label-tertiary)" }, children: day }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "8px", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }, children: [
                i === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "6px", padding: "8px", fontSize: "11px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "10px" }, children: "09:30 \u4E0A\u5348" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { color: "#fff" }, children: "@trend_cat_us" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "var(--omx-status-green)", fontSize: "10px" }, children: "\u5DF2\u6210\u529F\u53D1\u5E03" })
                ] }),
                i === 2 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-3)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "6px", padding: "8px", fontSize: "11px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#ffffff", fontSize: "10px", fontWeight: "bold" }, children: "18:00 (\u7F8E\u4E1C)" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { color: "#fff" }, children: "@trend_cat_us" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#ffffff", fontSize: "10px" }, children: "\u6392\u961F\u4E2D \xB7 1\u53F7\u69FD\u4F4D" })
                ] })
              ] })
            ] }, day)) })
          ] }),
          activeTab === "inspector" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", padding: "22px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "15px", color: "#fff" }, children: "\u6545\u969C\u65AD\u70B9\u5BF9\u6BD4\u5668 (\u6BCF\u6B21\u5F02\u5E38\u7686\u6709\u660E\u786E\u5F52\u56E0)" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u62D2\u7EDD\u65E0\u54CD\u5E94\u5047\u6B7B\u3002\u7CFB\u7EDF\u51C6\u786E\u6307\u51FA\u9884\u671F\u770B\u5230\u7684\u754C\u9762\u7ED3\u6784\uFF0C\u4EE5\u53CA\u5B9E\u9645\u906D\u9047\u7684\u5F02\u5E38\u5E72\u6270\u5C42" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-ink", onClick: handleAutoHeal, children: "\u6267\u884C\u51B3\u7B56\u5F15\u64CE\u667A\u80FD\u81EA\u6108" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "11px", color: "var(--omx-status-green)", fontWeight: "bold" }, children: "\u9884\u671F\u754C\u9762\u7ED3\u6784\uFF1A\u7CFB\u7EDF\u76F8\u518C\u4E5D\u5BAB\u683C" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "#000", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", height: "260px", padding: "14px", marginTop: "8px", display: "flex", flexDirection: "column", justifyContent: "space-between" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u76F8\u518C\u6700\u8FD1\u9879\u76EE" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { textAlign: "center", color: "var(--dsw-alias-label-secondary)", fontSize: "12px" }, children: "[\u89C6\u9891\u9996\u56FE\u6B63\u5E38\u53EF\u89C1 \xB7 \u70B9\u51FB\u5C31\u7EEA]" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "10px", textAlign: "right", color: "var(--dsw-alias-label-tertiary)" }, children: "\u4E0B\u4E00\u6B65\u6309\u94AE [\u53EF\u7528]" })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "11px", color: autoHealed ? "var(--omx-status-green)" : "var(--omx-status-rose)", fontWeight: "bold" }, children: autoHealed ? "\u5B9E\u9645\u753B\u9762\u68C0\u6D4B\uFF1A\u5F39\u7A97\u5DF2\u81EA\u6108\u5173\u95ED" : "\u5B9E\u9645\u753B\u9762\u68C0\u6D4B\uFF1A\u906D\u9047\u7B2C\u4E09\u65B9\u5E94\u7528\u8BC4\u5206\u5F39\u7A97" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "#000", border: autoHealed ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(244,63,94,0.3)", borderRadius: "8px", height: "260px", padding: "14px", marginTop: "8px", display: "flex", flexDirection: "column", justifyContent: "space-between" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u7CFB\u7EDF\u8986\u76D6\u5C42" }),
                  autoHealed ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { textAlign: "center", color: "var(--omx-status-green)", fontSize: "12px", fontWeight: "bold" }, children: [
                    "\u2714 \u5F39\u7A97\u5DF2\u7531\u51B3\u7B56\u5F15\u64CE\u81EA\u52A8\u5173\u95ED",
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#fff", fontSize: "11px", fontWeight: "normal" }, children: "\u5DF2\u81EA\u52A8\u63A8\u8FDB\u81F3\u300C\u4E0B\u4E00\u6B65\u300D\u5B8C\u6210\u77ED\u89C6\u9891\u53D1\u5E03" })
                  ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { textAlign: "center", background: "rgba(244,63,94,0.08)", padding: "14px", borderRadius: "6px" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { color: "#fff", fontSize: "12px" }, children: "\u559C\u6B22\u8FD9\u6B3E\u5E94\u7528\u5417\uFF1F" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "11px" }, children: "\u8BF7\u524D\u5F80\u5E94\u7528\u5546\u5E97\u4E3A\u6211\u4EEC\u8BC4\u5206" })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--dsw-alias-label-secondary)" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--omx-status-amber)" }, children: "\u7A0D\u540E\u518D\u8BF4" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u63D0\u4EA4" })
                  ] })
                ] })
              ] })
            ] })
          ] }),
          activeTab === "signing" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", padding: "20px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "15px", color: "#fff" }, children: "\u82F9\u679C\u5F00\u53D1\u8005\u8BC1\u4E66\u6C60\u7BA1\u7406" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" }, children: "\u7269\u7406\u771F\u673A\u5FC5\u987B\u7B7E\u540D\u65B9\u53EF\u8FD0\u884C\u63A7\u5236\u7A0B\u5E8F\u3002\u901A\u8FC7\u591A\u8BC1\u4E66\u5BC6\u94A5\u6C60\u6A2A\u5411\u6269\u5C55\uFF0C\u8F7B\u677E\u7EB3\u7BA1\u6570\u767E\u53F0 iPhone" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-ink", onClick: handleAddCert, children: "+ \u5BFC\u5165\u65B0\u56E2\u961F\u5BC6\u94A5 (.p8)" })
            ] }),
            teamKeys.map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: "8px", padding: "14px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { style: { color: "#fff", fontSize: "13px" }, children: [
                  "\u56E2\u961F\u7F16\u53F7: ",
                  k.id,
                  " (",
                  k.name,
                  ")"
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)" }, children: [
                  "Apple Development \u8BC1\u4E66 \xB7 \u5269\u4F59 ",
                  k.days,
                  " \u5929"
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { fontSize: "12px", color: "var(--omx-status-green)", fontWeight: "bold" }, children: [
                "\u5DF2\u4F7F\u7528 ",
                k.used,
                " / 100 \u53F0\u8BBE\u5907"
              ] })
            ] }, k.id))
          ] }),
          activeTab === "warmup" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "12px", padding: "20px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "15px", color: "#fff" }, children: "\u5168\u81EA\u4E3B\u667A\u80FD\u517B\u53F7\u7B56\u7565" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)", marginBottom: "16px" }, children: "\u4E00\u6B21\u8BBE\u5B9A\uFF0C\u5168\u5929\u5019\u7531 Mac \u672C\u5730\u5F15\u64CE\u81EA\u52A8\u6267\u884C\uFF0C\u652F\u6301 21 \u5929\u6E10\u8FDB\u5F0F\u63D0\u9891\u66F2\u7EBF\u4E0E\u771F\u4EBA\u4F5C\u606F\u7A97\u53E3\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", padding: "16px", borderRadius: "8px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" }, children: "\u5355\u65E5\u8BBF\u95EE\u9891\u6B21" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "18px", fontWeight: "bold", color: "#ffffff", marginTop: "4px" }, children: "6 ~ 10 \u8F6E\u968F\u673A\u5DE1\u68C0" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", padding: "16px", borderRadius: "8px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" }, children: "\u65B0\u53F7\u6743\u91CD\u722C\u5761\u671F" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "18px", fontWeight: "bold", color: "#ffffff", marginTop: "4px" }, children: "21 \u5929\u9632\u98CE\u63A7\u6E10\u8FDB\u66F2\u7EBF" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", padding: "16px", borderRadius: "8px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px" }, children: "\u5355\u65E5\u6D3B\u8DC3\u65F6\u95F4\u7A97" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "18px", fontWeight: "bold", color: "#ffffff", marginTop: "4px" }, children: "14 ~ 18 \u5C0F\u65F6\u771F\u4EBA\u4F5C\u606F" })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `omx-drawer-mask ${activeDrawer ? "active" : ""}`, onClick: () => setActiveDrawer(null), children: activeDrawer && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "omx-drawer-panel", onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { style: { fontSize: "15px", fontWeight: "600", color: "#ffffff" }, children: [
                activeDrawer.name,
                " (",
                activeDrawer.model,
                ")"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary)", fontFamily: "var(--font-mono)" }, children: activeDrawer.proxy })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-subtle", style: { height: "26px", padding: "0 8px" }, onClick: () => setActiveDrawer(null), children: "\u5173\u95ED" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", padding: "12px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "12px", color: "#fff" }, children: "\u521D\u59CB\u5316\u6B65\u5E8F\u68C0\u67E5" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", color: "var(--omx-status-green)", marginTop: "6px" }, children: "\u2714 \u7269\u7406\u8BBE\u5907 USB \u8FDE\u63A5\u5C31\u7EEA" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { fontSize: "12px", color: "var(--omx-status-green)", marginTop: "4px" }, children: [
              "\u2714 \u5DF2\u5206\u914D\u4E13\u5C5E\u793E\u5A92\u8D26\u53F7 (",
              activeDrawer.account,
              ")"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", color: "var(--omx-status-green)", marginTop: "4px" }, children: "\u2714 \u63A7\u5236\u5B88\u62A4\u7A0B\u5E8F\u5DF2\u5B8C\u6210\u8BC1\u4E66\u7B7E\u540D" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: "12px", color: "var(--omx-status-green)", marginTop: "4px" }, children: "\u2714 \u81EA\u52A8\u517B\u53F7\u5DE1\u68C0\u961F\u5217\u5DF2\u5C31\u7EEA" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: "12px", color: "#fff", display: "block", marginBottom: "8px" }, children: "11 \u9879\u5E95\u5C42\u786C\u6027\u6307\u6807\u5065\u5EB7\u4F53\u68C0" }),
            ["\u5F00\u53D1\u8005\u6A21\u5F0F\u72B6\u6001: \u5DF2\u5F00\u542F", "\u754C\u9762\u81EA\u52A8\u5316\u6743\u9650: \u5DF2\u5C31\u7EEA", "\u7CFB\u7EDF\u6D45\u8272\u5916\u89C2: \u7B26\u5408\u6807\u51C6", "\u5C4F\u5E55\u81EA\u52A8\u9501\u5B9A: \u6C38\u4E0D\u9501\u5C4F", "\u9501\u5C4F\u5BC6\u7801\u72B6\u6001: \u81EA\u52A8\u89E3\u9501\u5DF2\u914D\u7F6E", "\u51CF\u5C11\u52A8\u6001\u6548\u679C: \u5DF2\u542F\u7528", "\u5F85\u673A\u663E\u793A\u6A21\u5F0F: \u5DF2\u5173\u95ED", "\u81EA\u52A8\u4EAE\u5EA6\u8C03\u8282: \u5DF2\u5173\u95ED", "\u4E91\u7AEF\u7167\u7247\u540C\u6B65: \u5DF2\u5173\u95ED (\u9632\u5173\u8054)", "\u72EC\u5360\u4F4F\u5B85\u9759\u6001\u4EE3\u7406: \u8FDE\u901A\u6B63\u5E38", "\u7535\u6C60\u7535\u91CF\u4E0E\u673A\u8EAB\u6E29\u5EA6: 100% \xB7 31.5\xB0C \u6B63\u5E38"].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--dsw-alias-border-l1)", fontSize: "12px", color: "var(--dsw-alias-label-secondary)" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.split(":")[0] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: "var(--omx-status-green)", fontWeight: "bold" }, children: [
                "\u2714 ",
                item.split(":")[1]
              ] })
            ] }, item))
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: "8px", marginTop: "12px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-subtle", style: { flex: 1 }, onClick: () => showToast("\u5DF2\u5BF9\u8BE5 iPhone \u91CD\u65B0\u6267\u884C 11 \u9879\u4F53\u68C0"), children: "\u91CD\u65B0\u4F53\u68C0\u8BE5\u8BBE\u5907" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "omx-btn-ink", style: { flex: 1 }, onClick: () => showToast("\u5DF2\u5411\u624B\u673A\u53D1\u9001\u70B9\u6309\u52A0\u53F7\u6307\u4EE4"), children: "\u6A21\u62DF\u70B9\u51FB\u52A0\u53F7" })
          ] })
        ] }) }),
        toastMsg && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { position: "fixed", bottom: "24px", right: "24px", background: "var(--dsw-alias-bg-elevated)", border: "1px solid var(--dsw-alias-border-l3)", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", color: "#fff", zIndex: 1e3, boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }, children: toastMsg })
      ]
    }
  );
}

// src/client/locales.js
var locales = {
  "zh-CN": {
    nav: "\u624B\u673A\u7BA1\u7406",
    title: "\u624B\u673A\u7BA1\u7406",
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
    title: "Device Management",
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
