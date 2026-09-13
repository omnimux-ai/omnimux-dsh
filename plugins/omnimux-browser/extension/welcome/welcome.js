// Welcome to OmniMux - 向导页交互逻辑

// Welcome to OmniMux - 向导页交互逻辑

const isZh = () => {
  try {
    const manual = localStorage.getItem('omnimux_manual_locale');
    if (manual === 'zh') return true;
    if (manual === 'en') return false;
    const dsh = localStorage.getItem('dsh_configured_locale');
    if (dsh === 'zh') return true;
    if (dsh === 'en') return false;
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
      const uiLang = chrome.i18n.getUILanguage();
      if (uiLang && (uiLang.toLowerCase().startsWith('zh') || uiLang.toLowerCase() === 'zh')) return true;
    }
    const langs = navigator.languages || [navigator.language];
    return langs.some((l) => typeof l === 'string' && l.toLowerCase().startsWith('zh'));
  } catch {
    return true;
  }
};

const applyI18n = () => {
  if (!isZh()) return;
  document.documentElement.lang = "zh-CN";
  document.title = "欢迎使用 OmniMux-精灵助手";

  const tipText1 = document.querySelector(".pin-tip-banner span:first-child");
  const tipText2 = document.querySelector(".pin-tip-banner span:last-child");
  if (tipText1) tipText1.textContent = "点击右上角";
  if (tipText2) tipText2.textContent = "图标并固定 OmniMux";

  const slogan = document.querySelector(".slogan-text");
  if (slogan) slogan.textContent = "聪明学习 · 大胆创作";

  const title = document.querySelector(".main-title");
  if (title) title.textContent = "OmniMux 随时准备与你一起创作！";

  const extTitle = document.querySelector(".ext-popover-header span");
  if (extTitle) extTitle.textContent = "扩展程序";

  const extDesc = document.querySelector(".ext-popover-desc");
  if (extDesc) extDesc.textContent = "这些扩展程序可以查看和更改此网站上的信息。";

  const pinTag = document.querySelector(".pin-tag");
  if (pinTag) pinTag.textContent = "固定 OMNIMUX";

  const manageLink = document.querySelector(".manage-link span");
  if (manageLink) manageLink.textContent = "管理扩展程序";

  const btnGetStarted = document.getElementById("btn-get-started");
  if (btnGetStarted) btnGetStarted.textContent = "开始体验";
};

const onReady = () => {
  applyI18n();
  const btnGetStarted = document.getElementById("btn-get-started");

  const onClick = async () => {
    try {
      // 1. 获取当前窗口
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTab && currentTab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
        // 唤起侧边栏
        await chrome.sidePanel.open({ windowId: currentTab.windowId });
      }
    } catch (e) {
      console.log("Open sidepanel note:", e);
    }

    // 2. 引导文案切换与完成反馈
    btnGetStarted.textContent = isZh() ? "✓ 开启创作！" : "✓ Let's Create!";
    btnGetStarted.style.background = "#22c55e";

    setTimeout(() => {
      window.close();
    }, 600);
  };

  btnGetStarted?.addEventListener("click", onClick);
};

document.addEventListener("DOMContentLoaded", onReady);

// unsubscribe lifecycle cleanup
function cleanup() {
  document.removeEventListener("DOMContentLoaded", onReady);
}
