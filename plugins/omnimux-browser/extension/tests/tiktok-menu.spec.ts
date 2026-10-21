// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, beforeEach } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MENU_FALLBACK_WIDTH_PX,
  TIKTOK_SCENE_HOST_ID,
  mountTiktokScene
} from "../src/content/tiktok-scene/menu.ts";
import { tiktokCopy } from "../src/content/tiktok-scene/copy.ts";
const inlineStyles = readFileSync(resolve(__dirname, "../src/content/tiktok-scene/styles.css"), "utf8");
const COPY = tiktokCopy("zh");
function exported(filename = "cleanlife-钩子-741.mp4") {
  return { ok: true, code: "exported", filename };
}
function mount(run) {
  const calls = [];
  const runner = run ?? (async (action) => {
    calls.push(action);
    return exported();
  });
  const handle = mountTiktokScene({
    doc: document,
    copy: COPY,
    run: runner
  });
  return { handle, calls };
}
function shadow() {
  const host = document.getElementById(TIKTOK_SCENE_HOST_ID);
  if (host?.shadowRoot === null || host?.shadowRoot === void 0) throw new Error("scene not mounted");
  return host.shadowRoot;
}
function anchor() {
  return shadow().querySelector(".omx-anchor");
}
function trigger() {
  return shadow().querySelector(".omx-trigger");
}
function row(action) {
  return shadow().querySelector(`.omx-item[data-action="${action}"]`);
}
function menu() {
  return shadow().querySelector(".omx-menu");
}
const settle = () => new Promise((resolve2) => setTimeout(resolve2, 0));
function pointer(el, type, pointerType) {
  const event = new Event(type);
  Object.defineProperty(event, "pointerType", { value: pointerType });
  el.dispatchEvent(event);
}
function rule(selector) {
  const start = inlineStyles.indexOf(selector);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  const open = inlineStyles.indexOf("{", start);
  const close = inlineStyles.indexOf("}", open);
  return inlineStyles.slice(open + 1, close);
}
function px(body, property) {
  const found = new RegExp(`${property}:\\s*([\\d.]+)px`).exec(body);
  if (found === null) throw new Error(`no ${property} in: ${body.slice(0, 60)}`);
  return Number.parseFloat(found[1]);
}
function renderedMenuWidth() {
  const columns = px(rule(".omx-item {"), "width");
  const menu2 = rule(".omx-menu {");
  return columns + 2 * px(menu2, "padding") + 2 * px(menu2, "border");
}
beforeEach(() => {
  document.body.innerHTML = "";
});
describe("TikTok 场景触发器 — 圆形形态", () => {
  it("是 48px 圆形 (AC-110)", () => {
    const body = rule(".omx-trigger {");
    assert.match(body, /width:\s*48px/);
    assert.match(body, /height:\s*48px/);
    assert.match(body, /border-radius:\s*50%/);
  });
  it("品牌淡紫底 + 深色幽灵，眼睛胶囊用底色镂空", () => {
    const body = rule(".omx-trigger {");
    assert.match(body, /background:\s*var\(--omx-brand\)/);
    assert.match(body, /color:\s*var\(--omx-brand-ink\)/);
    assert.match(inlineStyles, /--omx-brand:\s*#b8b7ff/);
    assert.match(inlineStyles, /--omx-brand-ink:\s*#121213/);
    assert.match(rule(".omx-eye {"), /fill:\s*var\(--omx-brand\)/);
  });
  it("不再渲染文字标签 (AC-111)", () => {
    mount();
    assert.equal(trigger().textContent, "");
    assert.equal(shadow().querySelector(".omx-trigger-label"), null);
    assert.notEqual(trigger().querySelector("svg"), null);
  });
});
describe("TikTok 场景工具栏 — 形态", () => {
  it("上下垂直列表、与按钮垂直居中、默认落在按钮右侧 (AC-304 / AC-305 / AC-401)", () => {
    const body = rule(".omx-menu {");
    assert.match(body, /top:\s*50%/);
    assert.match(body, /transform:\s*translateY\(-50%\)/);
    assert.match(body, /display:\s*flex/);
    assert.match(body, /flex-direction:\s*column/);
    assert.match(body, /left:\s*100%/);
    assert.match(body, /padding:\s*6px/);
    assert.match(body, /border-radius:\s*14px/);
    assert.match(body, /backdrop-filter:\s*blur/);
    const open = rule(".omx-anchor:hover .omx-menu");
    assert.match(open, /transform:\s*translateY\(-50%\)\s*scale\(1\)/);
  });
  it("详情行撑宽时面板在视口内换行，而不是长出去 (P1-2)", () => {
    assert.match(rule(".omx-menu {"), /max-width:\s*calc\(100vw - 24px\)/);
    assert.match(rule(".omx-item-detail {"), /overflow-wrap:\s*anywhere/);
  });
  it("翻左只是一侧的几何：从右缘生长、从右侧滑入", () => {
    const flipped = rule(".omx-menu.is-left");
    assert.match(flipped, /transform-origin:\s*right center/);
    assert.match(flipped, /translateX\(6px\)/);
    assert.match(rule(".omx-menu {"), /transform-origin:\s*left center/);
  });
  it("每项呈现左右横向排列（图标在左、文字在右） (AC-304)", () => {
    const body = rule(".omx-item {");
    assert.match(body, /flex-direction:\s*row/);
    assert.match(body, /align-items:\s*center/);
    assert.match(body, /white-space:\s*nowrap/);
    assert.match(rule(".omx-item svg {"), /width:\s*18px/);
    assert.match(rule(".omx-item-state {"), /font-size:\s*10px/);
  });
  it("默认不可见且不可点击命中 (AC-112)", () => {
    mount();
    assert.equal(menu().classList.contains("is-open"), false);
    const body = rule(".omx-menu {");
    assert.match(body, /opacity:\s*0/);
    assert.match(body, /visibility:\s*hidden/);
  });
  it("悬停态在 200ms 内可见，过渡时长写在样式里 (AC-113)", () => {
    const body = rule(".omx-menu {");
    assert.match(body, /transition:\s*opacity 150ms/);
    assert.match(body, /transform 190ms cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    const hover = rule(".omx-anchor:hover .omx-menu");
    assert.match(hover, /opacity:\s*1/);
    assert.match(hover, /visibility:\s*visible/);
    assert.match(rule(".omx-anchor:focus-within .omx-menu"), /visibility:\s*visible/);
  });
  it("prefers-reduced-motion 下关闭过渡 (AC-117)", () => {
    const reduced = inlineStyles.slice(inlineStyles.indexOf("@media (prefers-reduced-motion: reduce)"));
    assert.match(reduced, /transition:\s*none/);
  });
  it("三项就是约定的三项，顺序与文案取自当前语区 (AC-116)", () => {
    mount();
    const labels = Array.from(shadow().querySelectorAll(".omx-item-label")).map((el) => el.textContent);
    assert.deepEqual(labels, [COPY.menu.video, COPY.menu.audio, COPY.menu.save]);
  });
});
describe("TikTok 场景工具栏 — 结构", () => {
  it("挂到独立的影子根里，不污染宿主页面", () => {
    mount();
    assert.notEqual(document.getElementById(TIKTOK_SCENE_HOST_ID), null);
    assert.notEqual(shadow().querySelector(".omx-trigger"), null);
  });
  it("初始是收起的", () => {
    mount();
    assert.equal(menu().classList.contains("is-open"), false);
    assert.equal(trigger().getAttribute("aria-expanded"), "false");
  });
  it("图标位置来自锚点判定，落在视口内", () => {
    mount();
    assert.equal(anchor().style.position, "fixed");
    assert.ok(Number.parseInt(anchor().style.left, 10) >= 0);
    assert.ok(Number.parseInt(anchor().style.bottom, 10) >= 0);
  });
});
describe("TikTok 场景工具栏 — 方向自适应", () => {
  const MENU_W = renderedMenuWidth();
  function page(markup, boxes) {
    document.body.innerHTML = markup;
    for (const [selector, box] of Object.entries(boxes)) {
      const el = document.querySelector(selector);
      if (el === null) throw new Error(`fixture has no ${selector}`);
      const rect = {
        x: box.left,
        y: box.top,
        top: box.top,
        left: box.left,
        right: box.left + box.width,
        bottom: box.top + box.height,
        width: box.width,
        height: box.height,
        toJSON: () => ({})
      };
      el.getBoundingClientRect = () => rect;
    }
  }
  function portraitPage() {
    page('<div id="bar"><img id="author" /></div>', {
      "#bar": { top: 60, left: 375, width: 55, height: 700 },
      "#author": { top: 68, left: 379, width: 48, height: 48 }
    });
  }
  function mountSized(width, height, widthOfMenu = () => MENU_W) {
    window.innerWidth = width;
    window.innerHeight = height;
    const mounted = mount();
    const el = menu();
    el.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: widthOfMenu(),
      bottom: 70,
      width: widthOfMenu(),
      height: 70,
      toJSON: () => ({})
    });
    mounted.handle.reposition();
    return { ...mounted, menu: el };
  }
  function menuLeft() {
    return Number.parseFloat(anchor().style.left) + Number.parseFloat(menu().style.left);
  }
  it("兜底宽度就是样式渲染出来的宽度（列宽 + 内边距 + 边框）(P2-1)", () => {
    assert.equal(MENU_W, 170);
    assert.equal(MENU_FALLBACK_WIDTH_PX, MENU_W);
  });
  it("⑥ 桌面布局默认靠右：菜单左缘 = 按钮右缘 (AC-401)", () => {
    page('<div data-e2e="nav-profile"><img id="me" /></div>', {
      "#me": { top: 472, left: 20, width: 32, height: 32 }
    });
    const { menu: el } = mountSized(1920, 929);
    assert.equal(el.classList.contains("is-left"), false);
    assert.equal(menuLeft(), 20 + 48);
    assert.ok(menuLeft() + MENU_W <= 1920);
  });
  it("⑦ 按钮贴右缘、右侧放不下时翻左，且整块菜单不出屏 (AC-402 / AC-405)", () => {
    portraitPage();
    const { menu: el } = mountSized(430, 932);
    assert.equal(el.classList.contains("is-left"), true);
    assert.equal(menuLeft(), 379 - MENU_W);
    assert.ok(menuLeft() >= 0);
    assert.ok(menuLeft() + MENU_W <= 430);
    assert.ok(menuLeft() + MENU_W <= 379);
  });
  it("每次重新测量：翻左时的偏移跟着菜单实际宽度走 (AC-403)", () => {
    portraitPage();
    const { handle } = mountSized(430, 932);
    assert.equal(menuLeft(), 379 - MENU_W);
    const narrow = 120;
    menu().getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: narrow,
      bottom: 70,
      width: narrow,
      height: 70,
      toJSON: () => ({})
    });
    handle.reposition();
    assert.equal(menu().classList.contains("is-left"), true);
    assert.equal(menuLeft(), 379 - narrow);
    assert.ok(menuLeft() + narrow <= 430);
  });
  it("⑧ 菜单变宽后重新判定方向：面板不再压住按钮 (P1-2)", async () => {
    portraitPage();
    let wide = false;
    const { menu: el } = mountSized(430, 932, () => wide ? 400 : MENU_W);
    assert.equal(menuLeft(), 379 - MENU_W);
    wide = true;
    row("video").click();
    await settle();
    assert.equal(el.classList.contains("is-left"), true);
    assert.equal(menuLeft(), 0);
    assert.ok(menuLeft() + 400 <= 430);
    assert.ok(menuLeft() + 400 <= 379 + 48 / 2);
    assert.equal(shadow().querySelector(".omx-item-detail")?.textContent ?? "", "");
    assert.equal(row("video").textContent.trim(), COPY.menu.video);
  });
  it("⑨ 面板量不到宽度时用兜底宽度，方向仍按兜底宽度判 (P2-2)", () => {
    portraitPage();
    const { menu: el } = mountSized(430, 932, () => 0);
    assert.equal(el.classList.contains("is-left"), true);
    assert.equal(menuLeft(), 379 - MENU_FALLBACK_WIDTH_PX);
    assert.ok(menuLeft() >= 0);
    assert.ok(menuLeft() + MENU_FALLBACK_WIDTH_PX <= 430);
  });
});
describe("TikTok 场景工具栏 — 悬停展开", () => {
  it("鼠标进入图标或它的容器时展开 (AC-113)", () => {
    mount();
    pointer(anchor(), "pointerenter", "mouse");
    assert.equal(menu().classList.contains("is-open"), true);
    assert.equal(trigger().getAttribute("aria-expanded"), "true");
  });
  it("鼠标移开后收起 (AC-114)", () => {
    mount();
    pointer(anchor(), "pointerenter", "mouse");
    pointer(anchor(), "pointerleave", "mouse");
    assert.equal(menu().classList.contains("is-open"), false);
    assert.equal(trigger().getAttribute("aria-expanded"), "false");
  });
  it("悬停已经展开时，点一下不会把它收起来", () => {
    mount();
    pointer(anchor(), "pointerenter", "mouse");
    trigger().click();
    assert.equal(menu().classList.contains("is-open"), true);
  });
  it("触屏没有悬停，点一下仍然可以切换（兜底路径）", () => {
    mount();
    pointer(anchor(), "pointerenter", "touch");
    assert.equal(menu().classList.contains("is-open"), false);
    trigger().click();
    assert.equal(menu().classList.contains("is-open"), true);
    trigger().click();
    assert.equal(menu().classList.contains("is-open"), false);
  });
  it("键盘聚焦同样展开，移走焦点收起（焦点可达性）", () => {
    mount();
    anchor().dispatchEvent(new Event("focusin"));
    assert.equal(menu().classList.contains("is-open"), true);
    anchor().dispatchEvent(new FocusEvent("focusout", { relatedTarget: document.body }));
    assert.equal(menu().classList.contains("is-open"), false);
  });
  it("焦点在工具栏内部的控件之间移动时不收起", () => {
    mount();
    anchor().dispatchEvent(new Event("focusin"));
    anchor().dispatchEvent(new FocusEvent("focusout", { relatedTarget: trigger() }));
    assert.equal(menu().classList.contains("is-open"), true);
  });
  it("按 ESC 收起", () => {
    mount();
    pointer(anchor(), "pointerenter", "mouse");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(menu().classList.contains("is-open"), false);
  });
  it("点页面上的其它区域收起", () => {
    mount();
    pointer(anchor(), "pointerenter", "mouse");
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.equal(menu().classList.contains("is-open"), false);
  });
});
describe("TikTok 场景菜单 — 执行与反馈", () => {
  it("点下载无水印视频时把 video 这个动作交给宿主", async () => {
    const { calls } = mount();
    pointer(anchor(), "pointerenter", "mouse");
    row("video").click();
    assert.deepEqual(calls, ["video"]);
    await settle();
  });
  it("点保存到灵感库时把 save 这个动作交给宿主", async () => {
    const { calls } = mount();
    pointer(anchor(), "pointerenter", "mouse");
    row("save").click();
    assert.deepEqual(calls, ["save"]);
    await settle();
  });
  it("执行期间这一行进入等待态并显示进度文案", async () => {
    const gate = {};
    const { handle } = mount(() => new Promise((resolve2) => {
      gate.release = () => resolve2(exported());
    }));
    pointer(anchor(), "pointerenter", "mouse");
    row("video").click();
    assert.equal(row("video").classList.contains("is-busy"), true);
    assert.ok(String(row("video").textContent).includes(COPY.busy.video));
    gate.release?.();
    await settle();
    assert.equal(row("video").classList.contains("is-busy"), false);
    assert.equal(row("video").textContent.trim(), COPY.menu.video);
    assert.equal(shadow().querySelector(".omx-item-detail")?.textContent ?? "", "");
    handle.dispose();
  });
  it("成功后这一行恢复默认，不残留完成文案", async () => {
    mount(async () => exported("a.mp4"));
    pointer(anchor(), "pointerenter", "mouse");
    row("video").click();
    await settle();
    assert.equal(row("video").classList.contains("is-done"), false);
    assert.equal(row("video").classList.contains("is-busy"), false);
    assert.equal(row("video").textContent.trim(), COPY.menu.video);
    assert.equal(shadow().querySelector(".omx-item-detail")?.textContent ?? "", "");
  });
  it("已在库里也算成功：行恢复默认，不进入错误态", async () => {
    mount(async () => ({ ok: true, code: "duplicate" }));
    pointer(anchor(), "pointerenter", "mouse");
    row("save").click();
    await settle();
    assert.equal(row("save").classList.contains("is-error"), false);
    assert.equal(row("save").textContent.trim(), COPY.menu.save);
    assert.equal(shadow().querySelector(".omx-item-detail")?.textContent ?? "", "");
  });
  it("失败时把宿主给的原因显示出来", async () => {
    mount(async () => ({ ok: false, code: "rejected", detail: "未从该作品解析到可下载的视频直链" }));
    pointer(anchor(), "pointerenter", "mouse");
    row("video").click();
    await settle();
    assert.equal(row("video").classList.contains("is-error"), true);
    const detail = shadow().querySelector(".omx-item-detail");
    assert.ok(String(detail?.textContent).includes("视频直链"));
  });
  it("响应超时与“主程序没在跑”给出的是两条不同的提示", async () => {
    mount(async () => ({ ok: false, code: "timeout" }));
    pointer(anchor(), "pointerenter", "mouse");
    row("video").click();
    await settle();
    const shown = shadow().querySelector(".omx-item-detail")?.textContent ?? "";
    assert.ok(String(shown).includes(COPY.failed({ ok: false, code: "timeout" })));
    assert.ok(!String(shown).includes(COPY.failed({ ok: false, code: "unreachable" })));
  });
  it("主程序没在跑时给出的也是可执行的原因", async () => {
    mount(async () => ({ ok: false, code: "unreachable" }));
    pointer(anchor(), "pointerenter", "mouse");
    row("audio").click();
    await settle();
    assert.ok(String(shadow().querySelector(".omx-item-detail")?.textContent).includes(COPY.failed({ ok: false, code: "unreachable" })));
  });
});
describe("TikTok 场景菜单 — 生命周期", () => {
  it("卸载后影子宿主一并移除，页面上不留残留", () => {
    const { handle } = mount();
    handle.dispose();
    assert.equal(document.getElementById(TIKTOK_SCENE_HOST_ID), null);
  });
  it("重复挂载不会叠加两个图标", () => {
    const first = mount();
    first.handle.dispose();
    mount();
    assert.equal(document.querySelectorAll(`#${TIKTOK_SCENE_HOST_ID}`).length, 1);
  });
  it("重新挂载会带走上一份的页面监听，ESC 只影响当前这一份", () => {
    const first = mount();
    first.handle.dispose();
    const second = mount();
    second.handle.dispose();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(document.getElementById(TIKTOK_SCENE_HOST_ID), null);
  });
  it("卸载后指针事件不再作用到已移除的宿主上", () => {
    const { handle } = mount();
    const el = anchor();
    handle.dispose();
    assert.doesNotThrow(() => pointer(el, "pointerenter", "mouse"));
    assert.equal(document.getElementById(TIKTOK_SCENE_HOST_ID), null);
  });
});
