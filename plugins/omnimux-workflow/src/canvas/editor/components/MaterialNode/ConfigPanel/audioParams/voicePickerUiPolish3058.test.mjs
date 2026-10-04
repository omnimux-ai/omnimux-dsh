/**
 * VoicePickerDialog 局部界面优化契约测试（Issue #3058 UI polish）。
 *
 * 真源：docs/product/voice-picker-ui-polish-3058.md §3.1 尺寸与排版锁定表
 * （PM_PREFLIGHT: APPROVED）。源码契约（readFileSync + node:test）锁定：
 *  - 宽度回归设计指引 min(480px, calc(100vw - 48px))，暂留 540px 退出；
 *  - overlay 仅本弹窗 :has(> .wf-voice-picker-modal) 顶部锚定 15vh，
 *    同次打开搜索框不随结果数上下跳；
 *  - 列表 min-height:0 + max-height:320px + 按内容收缩（移除 160px 底槽），
 *    少结果不留固定空洞，长列表只在结果区滚动；
 *  - 搜索 32px/8px 圆角（36px/10px 退出）；四维筛选窄态 min-width 88px
 *    横向滚动不折行；行 min-height 48px、padding 6px 10px；
 *  - 行名称 / 底栏当前名称允许自然换行，不做单行 ellipsis 尾截；
 *  - 试听按钮 32x32 / 8px 圆角（28px 圆形退出）；空态 padding 24px 0；
 *  - 底栏当前音色名称 13px/500 主信息、标签 12px 次级。
 * 文案字典变更 0：本测试不断言任何新文案，逐字白名单沿原契约。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(join(here, 'VoicePickerDialog.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../../../../theme/components.css'), 'utf8');
// acceptance-20261004 FE-01/02/03：宿主与公共组件源码一并纳入契约断言
const modalSrc = readFileSync(join(here, '../../../../../ui/CustomModal.tsx'), 'utf8');
const selectSrc = readFileSync(join(here, '../../../../../ui/CustomSelect.tsx'), 'utf8');
const configPanelSrc = readFileSync(join(here, '..', 'index.tsx'), 'utf8');

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 抽取指定选择器的声明块（首个匹配；本弹窗选择器均为单一定义） */
function blockOf(css, selector) {
  const idx = css.indexOf(selector);
  assert.notEqual(idx, -1, `缺少样式块 ${selector}`);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  assert.notEqual(open, -1, `${selector} 缺少 {`);
  assert.notEqual(close, -1, `${selector} 缺少 }`);
  return css.slice(open + 1, close);
}

test('#3058 宽度：回归设计指引 min(480px, calc(100vw - 48px))，540px 暂留退出', () => {
  assert.match(dialogSrc, /width="min\(480px, calc\(100vw - 48px\)\)"/);
  assert.doesNotMatch(dialogSrc, /width=\{540\}/);
});

test('#3058 顶部锚定：overlay 仅本弹窗 :has 限定，15vh 顶部锚定', () => {
  const overlay = blockOf(cssSrc, '.wf-modal-overlay:has(> .wf-voice-picker-modal)');
  // 顶部锚定：flex 起点 + 15vh 顶部内边距，水平居中保持
  assert.match(overlay, /align-items:\s*flex-start/);
  assert.match(overlay, /padding-top:\s*15vh/);
  assert.match(overlay, /justify-content:\s*center/);
});

test('#3058 FE-01：overlay 强制 row 轴 + border-box + 视口高，修正错轴与溢出', () => {
  const overlay = blockOf(cssSrc, '.wf-modal-overlay:has(> .wf-voice-picker-modal)');
  // 叠加 .wf-canvas-root 的 display:flex/flex-direction:column/height:100% 后：
  // 必须显式 row 使 justify-content:center 回到横轴、align-items:flex-start 回到纵轴
  assert.match(overlay, /flex-direction:\s*row/);
  // border-box 使 padding-top:15vh 计入 100% 高，不再把 overlay 撑出视口
  assert.match(overlay, /box-sizing:\s*border-box/);
  // 高度保持视口覆盖（inset:0 由基规则提供，本块显式声明防继承歧义）
  assert.match(overlay, /height:\s*100%/);
  // 不允许全局 overlay 改轴：基础 .wf-modal-overlay 仍是默认 row 居中，不写 flex-direction
  const baseOverlay = blockOf(cssSrc, '.wf-modal-overlay {');
  assert.doesNotMatch(baseOverlay, /flex-direction:\s*column/);
});

test('#3058 列表：内容自适应 + 320px 上限，移除 160px 底槽与 flex-fill', () => {
  const list = blockOf(cssSrc, '.wf-voice-picker__list');
  assert.match(list, /min-height:\s*0/);
  assert.match(list, /max-height:\s*320px/);
  assert.match(list, /overflow-y:\s*auto/);
  assert.doesNotMatch(list, /min-height:\s*160px/);
  // 禁止 flex-fill 撑出少结果空槽（flex:1 / flex-grow）
  assert.doesNotMatch(list, /flex:\s*1/);
  assert.doesNotMatch(list, /flex-grow:\s*[1-9]/);
  // 滚动条不挤压行宽：稳定 gutter
  assert.match(list, /scrollbar-gutter:\s*stable/);
});

test('#3058 搜索：32px 高、8px 圆角、16px 图标、10px 横向内边距', () => {
  const search = blockOf(cssSrc, '.wf-voice-picker__search');
  assert.match(search, /height:\s*32px/);
  assert.match(search, /border-radius:\s*8px/);
  assert.match(search, /padding:\s*0 10px/);
  assert.doesNotMatch(search, /height:\s*36px/);
  assert.doesNotMatch(search, /border-radius:\s*10px/);
  assert.match(dialogSrc, /Search size=\{16\}/);
  assert.doesNotMatch(dialogSrc, /Search size=\{14\}/);
});

test('#3058 四维筛选：一行四等分 + 窄态 88px 横向滚动不折行', () => {
  const filters = blockOf(cssSrc, '.wf-voice-picker__filters');
  assert.match(filters, /grid-template-columns:\s*repeat\(4,\s*minmax\(88px,\s*1fr\)\)/);
  assert.match(filters, /overflow-x:\s*auto/);
  assert.match(filters, /gap:\s*8px/);
});

test('#3058 行：min-height 48px、padding 6px 10px、名称可换行不尾截', () => {
  const row = blockOf(cssSrc, '.wf-voice-picker__row');
  assert.match(row, /min-height:\s*48px/);
  // review-20261004 medium：封顶 flex column 列表内行须 flex-shrink:0，
  // 否则长名自然高度被压回 ~48px，文字与相邻行重叠
  assert.match(row, /flex-shrink:\s*0/);
  assert.match(row, /padding:\s*6px 10px/);
  assert.match(row, /border-radius:\s*10px/);
  const name = blockOf(cssSrc, '.wf-voice-picker__row-name');
  assert.match(name, /font-size:\s*13px/);
  assert.match(name, /font-weight:\s*500/);
  // 长名字自然换行增高：不得单行 ellipsis 尾截
  assert.doesNotMatch(name, /white-space:\s*nowrap/);
  assert.doesNotMatch(name, /text-overflow:\s*ellipsis/);
  const tags = blockOf(cssSrc, '.wf-voice-picker__row-tags');
  assert.match(tags, /font-size:\s*12px/);
});

test('#3058 试听按钮：32x32、8px 圆角，播放反馈只属于按钮', () => {
  const preview = blockOf(cssSrc, '.wf-voice-picker__preview');
  assert.match(preview, /width:\s*32px/);
  assert.match(preview, /height:\s*32px/);
  assert.match(preview, /border-radius:\s*8px/);
  assert.doesNotMatch(preview, /width:\s*28px/);
  assert.doesNotMatch(preview, /border-radius:\s*50%/);
  // 试听不改选中：行高亮只跟随 --selected 修饰符，不存在 --playing 行态
  assert.doesNotMatch(cssSrc, /\.wf-voice-picker__row--playing/);
  assert.match(cssSrc, /\.wf-voice-picker__preview--playing/);
});

test('#3058 空态：紧凑反馈区 padding 24px，清除筛选按钮 32px/8px', () => {
  const empty = blockOf(cssSrc, '.wf-voice-picker__empty');
  assert.match(empty, /padding:\s*24px 0/);
  assert.match(empty, /gap:\s*12px/);
  assert.doesNotMatch(empty, /padding:\s*48px 0/);
  const clear = blockOf(cssSrc, '.wf-voice-picker__empty-clear');
  assert.match(clear, /height:\s*32px/);
  assert.match(clear, /border-radius:\s*8px/);
  assert.match(clear, /font-size:\s*13px/);
});

test('#3058 底栏：当前名称 13px/500 主信息可换行，标签 12px 次级', () => {
  const footerName = blockOf(cssSrc, '.wf-voice-picker__selected-name');
  assert.match(footerName, /font-size:\s*13px/);
  assert.match(footerName, /font-weight:\s*500/);
  // 全名不尾截：允许自然换行，不做单行 ellipsis
  assert.doesNotMatch(footerName, /white-space:\s*nowrap/);
  assert.doesNotMatch(footerName, /text-overflow:\s*ellipsis/);
  const footerLabel = blockOf(cssSrc, '.wf-voice-picker__selected-label');
  assert.match(footerLabel, /font-size:\s*12px/);
  assert.match(footerLabel, /color:\s*var\(--dsw-alias-label-secondary\)/);
});

test('#3058 字典与结构不变量：零新文案、零 badge/icon、试听不改选中', () => {
  // 逐字文案白名单：仍是这五个静态文案，无新增
  for (const copy of ['选择音色', '搜索音色...', '搜索音色', '当前音色', '未选择', '未找到匹配音色', '清除筛选', '试听', '暂停试听']) {
    assert.ok(dialogSrc.includes(copy), `缺少核定文案 ${copy}`);
  }
  // 无新增营销/装饰元素（注释不算渲染输出，按剥离注释后的代码判定）
  const dialogCode = stripComments(dialogSrc);
  assert.doesNotMatch(dialogCode, /热门|推荐|新品|高画质|极速|badge|Badge|hero|Hero|💎|✨|🔥/);
  // 试听按钮与行选择事件隔离（既有契约保留）：stopPropagation + 行按键只处理 currentTarget
  assert.match(dialogSrc, /event\.stopPropagation\(\)/);
  assert.match(dialogSrc, /event\.target !== event\.currentTarget/);
  assert.match(dialogSrc, /onSelect\(option\.value\)/);
  // Check 只跟随 value
  assert.match(dialogSrc, /option\.value === value/);
  // 样式门禁：音色块无裸色无违禁 token（注释同样剥离——「#3058」是 issue 号非颜色）
  const voiceBlock = stripComments(cssSrc.slice(cssSrc.indexOf('.wf-voice-picker-modal {')));
  assert.doesNotMatch(voiceBlock, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  assert.doesNotMatch(voiceBlock, /--omx-/);
});

test('#3058 FE-02：Escape 先菜单后弹窗，弹窗事件与画布失选隔离', () => {
  // CustomModal：Escape 改 window capture 监听并 stopPropagation——
  // 先于画布 useKeyboardShortcuts 的冒泡监听结算，宿主节点不被顺带失选。
  assert.match(modalSrc, /addEventListener\('keydown',\s*handleKeyDown,\s*true\)/);
  assert.match(modalSrc, /e\.stopPropagation\(\)/);
  // 菜单优先：存在打开的 .wf-custom-select-dropdown 时让位（菜单自己的
  // capture 监听先关菜单），弹窗本体本次不关闭
  assert.match(modalSrc, /wf-custom-select-dropdown/);
  const cancelIdx = modalSrc.indexOf('onCancel()');
  const deferIdx = modalSrc.indexOf('wf-custom-select-dropdown');
  assert.ok(deferIdx !== -1 && deferIdx < cancelIdx, '菜单让位判定必须先于 onCancel()');
  // 同一弹窗内 overlay 的 React keydown 兜底框内焦点，同样先让位菜单
  assert.match(modalSrc, /onKeyDown=/);
  // CustomSelect：菜单 Escape 用 capture + stopPropagation，关菜单不连带关弹窗
  assert.match(selectSrc, /addEventListener\('keydown',\s*handleKeyDown,\s*true\)/);
  assert.match(selectSrc, /e\.stopPropagation\(\)/);
  // 焦点恢复：宿主统一 closeVoicePicker 在微任务聚焦真实 trigger
  assert.match(configPanelSrc, /voiceTriggerRef/);
  assert.match(configPanelSrc, /queueMicrotask|Promise\.resolve\(\)\.then|requestAnimationFrame/);
  assert.match(configPanelSrc, /voiceTriggerRef\.current\?\.focus\(\)/);
});

test('#3058 FE-03：CustomSelect 菜单定位钳进视口，窄态不横向外溢', () => {
  // left 不再裸用 trigger.rect.left：必须经视口钳位（Math.min/Math.max 组合）
  const positionBlock = selectSrc.slice(
    selectSrc.indexOf('const updatePosition'),
    selectSrc.indexOf('useEffect(() => {\n    if (!open) return;'),
  );
  assert.match(positionBlock, /window\.innerWidth/);
  assert.match(positionBlock, /Math\.min\(/);
  assert.match(positionBlock, /Math\.max\(/);
  // final-review-closure medium：钳位必须按菜单实际渲染宽度（width:max-content
  // 可大于 minWidth 估宽），不再只用 minWidth 口径估算
  assert.match(positionBlock, /menuRef\.current/);
  // portal 菜单补 inline maxWidth，取既有 CSS 300px 封顶与 viewport-16 的较小值
  assert.match(selectSrc, /maxWidth/);
  assert.match(selectSrc, /Math\.min\(\s*300,\s*window\.innerWidth\s*-\s*16\s*\)/);
  // API 与语义不变：仍是 fixed portal + minWidth 基线 + placement
  assert.match(selectSrc, /position:\s*'fixed'/);
  assert.match(selectSrc, /minWidth/);
  assert.match(selectSrc, /createPortal/);
});

/** JSDOM 全局必须在 react-dom 首次加载前就位。 */
function installDom() {
  const { JSDOM } = workflowRequire('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return window;
}

const workflowRequire = createRequire(join(here, '../../../../../../..', 'package.json'));

/** 打包真实 CustomSelect.tsx；react 系列由本仓同一实例注入。 */
async function loadCustomSelect() {
  const esbuild = workflowRequire('esbuild');
  const result = await esbuild.build({
    entryPoints: [join(here, '../../../../../ui/CustomSelect.tsx')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(workflowRequire, mod, mod.exports);
  return mod.exports.CustomSelect;
}

const OPTS = [
  { value: 'a', label: 'Voice Alpha' },
  { value: 'b', label: 'Voice Beta' },
];

/**
 * final-review-closure medium 行为级回归：菜单 width:max-content 实宽（200px）
 * 大于 minWidth 口径（140px）时，left 必须按实宽钳位——修复前 390px 视口、
 * trigger.left=242 算出 left=242，200px 菜单右边到 442 越界。
 */
test('#3058 FE-03 actual：按菜单实宽钳位 left，maxWidth 保留 300 封顶且受 vw-16 限', async () => {
  const window = installDom();
  const React = workflowRequire('react');
  const { createRoot } = workflowRequire('react-dom/client');
  const CustomSelect = await loadCustomSelect();
  const { act } = React;

  // 390px 视口 + 贴右缘 trigger + 200px 实际菜单宽（复现 CLI 原文数字）
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  const realRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function rect() {
    if (this.classList?.contains('wf-custom-select-dropdown')) {
      return { x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 0, width: 200, height: 100 };
    }
    if (this.classList?.contains('wf-custom-select-trigger')) {
      return { x: 242, y: 0, top: 0, left: 242, right: 330, bottom: 30, width: 88, height: 30 };
    }
    return realRect.call(this);
  };

  const container = window.document.getElementById('root');
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(CustomSelect, {
      value: 'a',
      options: OPTS,
      popupMatchSelectWidth: true,
    }));
  });
  const trigger = container.querySelector('.wf-custom-select-trigger');
  assert.ok(trigger, 'trigger rendered');
  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  const menu = window.document.querySelector('.wf-custom-select-dropdown');
  assert.ok(menu, 'dropdown mounted via portal');

  // left 按实际 200px 菜单宽钳位：min(242, 390-8-200)=182，右缘恰 382 ≤ 390-8
  assert.equal(menu.style.left, '182px', 'left clamps by actual 200px menu width, not the 140px min estimate');
  // 既有 CSS 300px 封顶未被覆盖：min(300, 390-16)=300
  assert.equal(menu.style.maxWidth, '300px', 'maxWidth keeps the 300px cap under a wide viewport');
  assert.equal(menu.style.minWidth, '140px', 'minWidth baseline unchanged');

  await act(async () => { root.unmount() });
});
