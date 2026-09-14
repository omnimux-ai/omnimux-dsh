/**
 * 底栏触发器统一 · 端到端（真实 DOM + 生产样式表）
 *
 * 两条互相独立的证据链：
 *   1) 规则文本：从生产 `components.css` 解析出每条规则的选择器与声明体，断言几何与五态契约；
 *   2) 选择器命中：把同一份 CSS 交给真实 DOM（jsdom 的 CSS 选择器引擎），断言底栏里的
 *      每个触发器元素确实被共享组命中 —— 防止规则存在但类名对不上。
 *
 * 真实 Chromium 计算样式证据（几何、hover、:active、焦点环、disabled 实测值）见
 * `.agent-reports/bar-trigger-unify/verify-report.md`；本文件是其可回归的 DOM 级复现。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '../..');
const themeCss = readFileSync(join(pluginRoot, 'src/canvas/theme/components.css'), 'utf8');
const cfgSummarySrc = readFileSync(
  join(pluginRoot, 'src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/CfgSummaryBar.tsx'),
  'utf8',
);

const SHARED_TRIGGERS = [
  '.wf-model-cascade-capsule',
  '.wf-voice-trigger',
  '.wf-cfg-summary-bar',
  '.wf-video-trigger-bar',
];

/** 与生产门面同构的底栏 DOM。 */
const BAR_HTML = `
<div class="wf-config-panel">
  <div class="wf-config-panel__bottom-bar">
    <div class="wf-config-panel__params-group">
      <button type="button" id="model" class="wf-model-cascade-capsule" aria-haspopup="menu" aria-expanded="false">
        <span class="wf-model-cascade-capsule__name">Seedance 2.0</span>
        <span class="wf-model-cascade-capsule__badge"><span>5</span></span>
        <svg class="wf-model-cascade-capsule__chevron" width="14" height="14"></svg>
      </button>
      <button type="button" id="voice" class="wf-voice-trigger">
        <span class="wf-voice-trigger__label">默认音色</span>
      </button>
      <button type="button" id="asr-model"
        class="wf-custom-select-trigger wf-custom-select-trigger--pill wf-param-bar__select wf-param-bar__select--model"
        aria-haspopup="listbox" aria-expanded="false">
        <span class="wf-custom-select-label">doubao-asr-bigmodel</span>
      </button>
      <button type="button" id="asr-model-open"
        class="wf-custom-select-trigger wf-custom-select-trigger--pill wf-custom-select-trigger--open wf-param-bar__select wf-param-bar__select--model"
        aria-haspopup="listbox" aria-expanded="true">
        <span class="wf-custom-select-label">doubao-asr-bigmodel</span>
      </button>
      <button type="button" id="asr-model-disabled"
        class="wf-custom-select-trigger wf-custom-select-trigger--pill wf-custom-select-trigger--disabled wf-param-bar__select wf-param-bar__select--model"
        aria-haspopup="listbox" disabled>
        <span class="wf-custom-select-label">doubao-asr-bigmodel</span>
      </button>
      <button type="button" id="params" class="wf-cfg-summary-bar wf-video-trigger-bar" aria-expanded="false">
        <span class="wf-cfg-summary-bar__slot wf-video-trigger-bar__slot">16:9</span>
      </button>
      <button type="button" id="model-open" class="wf-model-cascade-capsule" aria-expanded="true">
        <span class="wf-model-cascade-capsule__name">Seedance 2.0</span>
      </button>
      <button type="button" id="params-open" class="wf-cfg-summary-bar wf-cfg-summary-bar--open wf-video-trigger-bar wf-video-trigger-bar--open" aria-expanded="true">
        <span class="wf-cfg-summary-bar__slot wf-video-trigger-bar__slot">16:9</span>
      </button>
      <button type="button" id="model-disabled" class="wf-model-cascade-capsule" disabled>
        <span class="wf-model-cascade-capsule__name">Seedance 2.0</span>
      </button>
    </div>
  </div>
</div>`;

function loadBarDocument() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${BAR_HTML}</body></html>`);
  const style = dom.window.document.createElement('style');
  style.textContent = themeCss;
  dom.window.document.head.appendChild(style);
  return dom.window.document;
}

/** 把 CSS 文本解析为 { selector, body } 列表（选择器归一化为单行）。 */
function parseRules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match = re.exec(css);
  while (match !== null) {
    out.push({
      selector: match[1].replace(/\s+/g, ' ').trim(),
      body: match[2].replace(/\s+/g, ' ').trim(),
    });
    match = re.exec(css);
  }
  return out;
}

const RULES = parseRules(themeCss.replace(/\/\*[\s\S]*?\*\//g, ''));

/** 选择器列表（去空白）。 */
function selectorList(rule) {
  return rule.selector
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 剥掉交互伪类与状态属性，得到可静态匹配的类选择器（状态本身由上面的断言覆盖）。 */
function baseSelector(selector) {
  return selector
    .replace(/:(hover|active|focus-visible|focus|disabled)(\([^)]*\))?/g, '')
    .replace(/:not\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();
}

/** 共享几何规则：显式覆盖四个触发器（避免命中同为 32px 圆形的发送按钮）。 */
const sharedRule = RULES.find((r) => selectorList(r).includes('.wf-model-cascade-capsule') && /height: 32px/.test(r.body));
const SHARED_SELECTOR = sharedRule ? selectorList(sharedRule).join(', ') : '';

/** 精确按选择器查找一条规则（避免 `:not(:disabled)` 被 `:disabled` 子串误命中）。 */
function ruleWithSelector(selector) {
  return RULES.find((r) => selectorList(r).includes(selector));
}

test('e2e: 三个底栏触发器由同一份共享几何规则命中（非各自手写）', () => {
  assert.ok(sharedRule, '必须存在覆盖模型触发器的共享几何规则');
  // 共享组可容纳异构成员（转写节点的 CustomSelect 以并列选择器加入），故断言「至少包含」而非
  // 「恰好等于」；成员集合的完整约束由 barControls-convergence.e2e.test.mjs 承担。
  for (const cls of SHARED_TRIGGERS) {
    assert.ok(selectorList(sharedRule).includes(cls), `共享几何规则必须覆盖 ${cls}`);
  }

  // 几何与排版契约
  assert.match(sharedRule.body, /height: 32px/);
  assert.match(sharedRule.body, /border-radius: 999px/);
  assert.match(sharedRule.body, /padding: 0 8px 0 10px/);
  assert.match(sharedRule.body, /font-size: 12px/);
  assert.match(sharedRule.body, /border: 1px solid var\(--dsw-alias-border-l2/);
  assert.match(sharedRule.body, /background: var\(--dsw-alias-bg-layer-1/);
  assert.match(sharedRule.body, /transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease/);

  // 类名必须在真实 DOM 中命中（选择器引擎判定，不是字符串包含）
  const doc = loadBarDocument();
  for (const id of ['model', 'voice', 'params']) {
    const el = doc.getElementById(id);
    assert.ok(el, `底栏必须渲染 ${id} 触发器`);
    assert.ok(el.matches(SHARED_SELECTOR), `#${id} 必须被共享几何规则命中`);
  }
});

test('e2e: 五态契约齐备，且每条状态规则都指向真实存在的元素', () => {
  const doc = loadBarDocument();

  const hover = ruleWithSelector('.wf-model-cascade-capsule:hover:not(:disabled)');
  assert.ok(hover, '必须存在 hover 规则');
  assert.match(hover.body, /background: var\(--dsw-alias-interactive-bg-hover/);
  assert.match(hover.body, /border-color: var\(--dsw-alias-border-l3/);

  const open = ruleWithSelector(".wf-model-cascade-capsule[aria-expanded='true']:not(:disabled)");
  assert.ok(open, '展开态必须有一条以 aria-expanded 驱动的规则');
  assert.match(open.body, /border-color: var\(--dsw-alias-brand-primary\)/);
  assert.ok(
    selectorList(open).includes('.wf-video-trigger-bar.wf-video-trigger-bar--open:not(:disabled)'),
    '展开态必须同时覆盖参数摘要条',
  );

  const active = ruleWithSelector('.wf-model-cascade-capsule:active:not(:disabled)');
  assert.ok(active, '必须存在按压规则');
  assert.match(active.body, /transform: scale\(0\.96\)/);

  const focus = ruleWithSelector('.wf-model-cascade-capsule:focus-visible');
  assert.ok(focus, '必须存在键盘焦点规则');
  assert.match(focus.body, /box-shadow: 0 0 0 2px/);
  assert.match(focus.body, /color-mix\(in srgb, var\(--dsw-alias-brand-primary\) 45%, transparent\)/);

  const disabled = ruleWithSelector('.wf-model-cascade-capsule:disabled');
  assert.ok(disabled, '必须存在禁用规则');
  assert.match(disabled.body, /opacity: 0\.35/);
  assert.match(disabled.body, /cursor: not-allowed/);

  // 每条状态规则的基础选择器都必须在 DOM 中真实存在（防止规则指向已改名的类）
  for (const rule of [hover, open, active, focus, disabled]) {
    for (const selector of selectorList(rule)) {
      const base = baseSelector(selector);
      assert.ok(base, `无法从 ${selector} 得到基础选择器`);
      assert.ok(doc.querySelector(base), `状态规则的基础选择器 ${base} 必须命中真实元素`);
    }
  }
});

test('e2e: 展开态与禁用态可被选择器引擎命中（模型触发器不再缺反馈）', () => {
  const doc = loadBarDocument();

  assert.ok(
    doc.getElementById('model-open').matches(".wf-model-cascade-capsule[aria-expanded='true']"),
    'aria-expanded=true 的模型触发器必须命中展开态规则',
  );
  assert.ok(
    doc.getElementById('params-open').matches('.wf-video-trigger-bar--open'),
    '--open 的参数摘要条必须命中展开态规则',
  );
  assert.ok(
    doc.getElementById('model-disabled').matches('.wf-model-cascade-capsule:disabled'),
    '禁用态模型触发器必须命中禁用规则',
  );
});

test('e2e: 模型触发器内层元素齐备，chevron 与共享组图标同阶', () => {
  const doc = loadBarDocument();
  const model = doc.getElementById('model');

  for (const cls of ['__name', '__badge', '__chevron']) {
    assert.ok(model.querySelector(`.wf-model-cascade-capsule${cls}`), `模型触发器必须渲染 ${cls} 内层元素`);
  }
  assert.equal(model.querySelector('.wf-model-cascade-capsule__chevron').getAttribute('width'), '14', 'chevron 必须为 14px');

  assert.match(themeCss, /\.wf-model-cascade-capsule__name \{\s*font-weight: 600;/);
  assert.match(themeCss, /\.wf-model-cascade-capsule__chevron \{/);
  assert.match(themeCss, /\.wf-model-cascade-capsule\[aria-expanded='true'\] \.wf-model-cascade-capsule__chevron \{\s*transform: rotate\(180deg\)/);
});

test('e2e: 任何 CfgSummaryBar 门面都进入共享组（跨模态覆盖）', () => {
  // 组件根类名固定存在，图片 / 视频门面通过 className 追加别名，不会脱离共享组
  assert.match(cfgSummarySrc, /'wf-cfg-summary-bar'/, 'CfgSummaryBar 根类名必须固定存在');
  assert.match(cfgSummarySrc, /className \?\? ''/, '门面追加类名不能替换根类名');

  const doc = loadBarDocument();
  assert.ok(
    doc.getElementById('params').matches(SHARED_SELECTOR),
    '参数摘要条（CfgSummaryBar 门面）必须被共享几何规则命中',
  );
});

test('e2e: 同栏不再并存两种圆角语言（红线回归）', () => {
  const doc = loadBarDocument();

  // 底栏内所有触发器元素必须都命中共享几何规则 —— 没有任何一个保留 8px 方角
  const bar = doc.querySelector('.wf-config-panel__params-group');
  const triggers = [...bar.querySelectorAll('button')];
  assert.ok(triggers.length >= 3, '底栏必须至少渲染三个触发器');
  for (const el of triggers) {
    assert.ok(el.matches(SHARED_SELECTOR), `${el.id || el.className} 必须进入共享触发器组`);
  }

  // 三个触发器各自的专属规则里不得再出现 8px 方角
  const exclusive = RULES.filter((r) => selectorList(r).length === 1 && SHARED_TRIGGERS.includes(selectorList(r)[0]));
  for (const rule of exclusive) {
    assert.doesNotMatch(rule.body, /border-radius: 8px/, `${selectorList(rule)[0]} 不得保留方角圆角`);
  }
});

test('e2e: 展开态特异性不低于 hover，指针停留时品牌描边不被覆盖', () => {
  // 点开触发器后指针必然仍停在它上面，hover 会持续命中；
  // open 规则若特异性不足，展开态品牌描边会被 hover 描边盖掉。
  const specificity = (selector) =>
    (selector.match(/\.[A-Za-z0-9_-]+/g) || []).length +
    (selector.match(/\[[^\]]*\]/g) || []).length +
    (selector.match(/:(?!not\b)[a-z-]+(\([^)]*\))?/g) || []).length;

  const indexOfRule = (selector) => RULES.findIndex((r) => selectorList(r).includes(selector));

  const pairs = [
    ['.wf-model-cascade-capsule:hover:not(:disabled)', ".wf-model-cascade-capsule[aria-expanded='true']:not(:disabled)"],
    ['.wf-cfg-summary-bar:hover:not(:disabled)', '.wf-cfg-summary-bar.wf-cfg-summary-bar--open:not(:disabled)'],
    ['.wf-video-trigger-bar:hover:not(:disabled)', '.wf-video-trigger-bar.wf-video-trigger-bar--open:not(:disabled)'],
  ];

  for (const [hoverSelector, openSelector] of pairs) {
    const hoverIndex = indexOfRule(hoverSelector);
    const openIndex = indexOfRule(openSelector);
    assert.ok(hoverIndex >= 0, `必须存在 hover 规则 ${hoverSelector}`);
    assert.ok(openIndex >= 0, `必须存在 open 规则 ${openSelector}`);
    assert.ok(
      specificity(openSelector) >= specificity(hoverSelector),
      `open 规则特异性 ${specificity(openSelector)} 必须不低于 hover ${specificity(hoverSelector)}：${openSelector}`,
    );
    assert.ok(openIndex > hoverIndex, `open 规则必须在 hover 规则之后声明：${openSelector}`);
  }

  // DOM 侧：展开元素必须真实命中 open 规则
  const doc = loadBarDocument();
  assert.ok(
    doc.getElementById('model-open').matches(".wf-model-cascade-capsule[aria-expanded='true']:not(:disabled)"),
    '展开中的模型触发器必须命中 open 规则',
  );
  assert.ok(
    doc.getElementById('params-open').matches('.wf-cfg-summary-bar.wf-cfg-summary-bar--open:not(:disabled)'),
    '展开中的参数摘要条必须命中 open 规则',
  );
});
