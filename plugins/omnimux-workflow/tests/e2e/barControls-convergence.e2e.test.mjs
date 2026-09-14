/**
 * 底栏剩余控件收敛 · 端到端（真实 DOM + 生产样式表）
 *
 * 承接 barTrigger-unify.e2e.test.mjs：那一个覆盖「触发器」家族，本文件覆盖剩余四类 ——
 * 转写（ASR）节点的模型触发器、分段控件、零候选空态、段间分隔符。
 *
 * 两条独立证据链（与既有 e2e 一致）：
 *   1) 规则文本：从生产 components.css 解析规则，断言几何与状态；ASR 触发器的几何值
 *      必须与「底栏触发器共享规格」逐项相等（它是异构控件，走独立规则但不能漂移）；
 *   2) 选择器命中：把同一份 CSS 交给真实 DOM，断言元素确实被目标规则选中。
 *
 * 真实浏览器（Chromium）计算样式证据见 `.agent-reports/bar-converge-remainder/verify-report.md`。
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
const configPanelSrc = readFileSync(
  join(pluginRoot, 'src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx'),
  'utf8',
);

const BAR_HTML = `
<div class="wf-config-panel">
  <div class="wf-config-panel__bottom-bar">
    <div class="wf-config-panel__params-group">
      <button type="button" id="text-model" class="wf-model-cascade-capsule" aria-expanded="false">
        <span class="wf-model-cascade-capsule__name">DeepSeek V3</span>
      </button>
      <span id="bar-divider" class="wf-param-pill__divider" aria-hidden="true"></span>
      <div id="bar-seg" class="wf-cfg-seg" role="radiogroup">
        <button type="button" role="radio" aria-checked="true" class="wf-cfg-seg__item wf-cfg-seg__item--active">文生文</button>
        <button type="button" role="radio" aria-checked="false" class="wf-cfg-seg__item">图生文</button>
      </div>
      <button type="button" id="asr-model"
        class="wf-custom-select-trigger wf-custom-select-trigger--pill wf-param-bar__select wf-param-bar__select--model"
        aria-haspopup="listbox" aria-expanded="false" disabled>
        <span class="wf-custom-select-label">doubao-asr-bigmodel</span>
      </button>
      <div id="empty-models" class="wf-param-pill wf-param-pill--empty-models" role="status">无可用模型</div>
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

/** 剥离注释后解析规则（注释文本会污染选择器）。 */
const RULES = (() => {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const css = themeCss.replace(/\/\*[\s\S]*?\*\//g, '');
  let match = re.exec(css);
  while (match !== null) {
    out.push({ selector: match[1].replace(/\s+/g, ' ').trim(), body: match[2].replace(/\s+/g, ' ').trim() });
    match = re.exec(css);
  }
  return out;
})();

function selectorList(rule) {
  return rule.selector.split(',').map((s) => s.trim()).filter(Boolean);
}

function ruleWithSelector(selector) {
  return RULES.find((r) => selectorList(r).includes(selector));
}

/** 共享触发器组（含模型触发器的那条几何规则）。 */
const sharedRule = RULES.find(
  (r) => selectorList(r).includes('.wf-model-cascade-capsule') && /height: 32px/.test(r.body),
);

test('e2e: ASR 模型触发器并入共享组（同一份声明，不是复制）', () => {
  assert.ok(sharedRule, '必须存在底栏触发器共享几何规则');
  const asrMember = '.wf-custom-select-trigger.wf-param-bar__select--model';
  assert.ok(selectorList(sharedRule).includes(asrMember), 'ASR 成员必须直接列在共享组选择器列表中');

  // 几何五件套由这一份声明提供
  for (const decl of ['height: 32px', 'border-radius: 999px', 'padding: 0 8px 0 10px', 'font-size: 12px', 'font-weight: 500']) {
    assert.match(sharedRule.body, new RegExp(decl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `共享组缺少 ${decl}`);
  }
  for (const token of ['--dsw-alias-bg-layer-1', '--dsw-alias-border-l2']) {
    assert.ok(sharedRule.body.includes(token), `共享组必须使用共享令牌 ${token}`);
  }

  // 五态同样列在共享组的对应规则里
  const stateMembers = [
    `${asrMember}:hover:not(:disabled)`,
    `${asrMember}.wf-custom-select-trigger--open:not(:disabled)`,
    `${asrMember}:active:not(:disabled)`,
    `${asrMember}:focus-visible:not(:disabled)`,
    `${asrMember}:disabled`,
  ];
  for (const member of stateMembers) {
    assert.ok(
      RULES.some((r) => selectorList(r).includes(member)),
      `共享组五态必须包含 ASR 成员：${member}`,
    );
  }

  // ASR 专属规则只允许声明它真正独有的差异，不得重复几何或配色（防回归到"复制一份"）
  const exclusive = RULES.filter((r) => selectorList(r).length === 1 && selectorList(r)[0].startsWith(asrMember));
  assert.ok(exclusive.length > 0, '必须保留 ASR 的宽度差异规则');
  for (const rule of exclusive) {
    assert.doesNotMatch(
      rule.body,
      /height:|border-radius:|padding:|background:|font-size:|font-weight:/,
      `ASR 专属规则不得重复共享组声明：${selectorList(rule)[0]}`,
    );
  }
});

test('e2e: 展开态不得压掉键盘焦点环（层叠回归）', () => {
  // open 组不得声明 box-shadow：它会以更高特异性压掉后声明的焦点环
  const openRule = RULES.find((r) =>
    selectorList(r).includes(".wf-model-cascade-capsule[aria-expanded='true']:not(:disabled)"),
  );
  assert.ok(openRule, '必须存在 open 规则');
  assert.doesNotMatch(openRule.body, /box-shadow/, 'open 组不得声明 box-shadow（会压掉焦点环）');

  const specificity = (selector) =>
    (selector.match(/\.[A-Za-z0-9_-]+/g) || []).length +
    (selector.match(/\[[^\]]*\]/g) || []).length +
    (selector.match(/:(?!not\b)[a-z-]+(\([^)]*\))?/g) || []).length;

  const focusMember = '.wf-custom-select-trigger.wf-param-bar__select--model:focus-visible:not(:disabled)';
  const haloMember = '.wf-custom-select-trigger.wf-param-bar__select--model.wf-custom-select-trigger--open';
  const haloRule = RULES.find((r) => selectorList(r).includes(haloMember));
  assert.ok(haloRule, '必须存在 ASR 的 halo 消除规则');
  assert.match(haloRule.body, /box-shadow: none/);
  assert.ok(
    specificity(focusMember) > specificity(haloMember),
    `焦点成员特异性 ${specificity(focusMember)} 必须高于 halo 消除规则 ${specificity(haloMember)}，展开态焦点环才可见`,
  );
});

test('e2e: 分段控件容器与内块统一为胶囊（底栏与浮层同一份声明）', () => {
  const doc = loadBarDocument();
  const container = RULES.find((r) => selectorList(r).includes('.wf-cfg-seg') && /height: 32px/.test(r.body));
  assert.ok(container, '必须存在分段控件容器规则');
  assert.ok(selectorList(container).includes('.wf-video-seg'), '视频门面选择器必须共用同一份声明');
  assert.match(container.body, /border-radius: 999px/);
  assert.match(container.body, /padding: 2px/);
  // 令牌带画布 fallback：宿主令牌缺失时也不丢底色与描边
  assert.match(container.body, /var\(--dsw-alias-border-l2, var\(--wb-border\)\)/);
  assert.match(container.body, /var\(--dsw-alias-bg-layer-1, var\(--wb-surface-raised\)\)/);

  const item = RULES.find((r) => selectorList(r).includes('.wf-cfg-seg__item') && /height: 26px/.test(r.body));
  assert.ok(item, '必须存在分段控件内块规则');
  assert.match(item.body, /border-radius: 999px/);

  // DOM 侧：容器与内块都真实命中
  assert.ok(doc.getElementById('bar-seg').matches('.wf-cfg-seg, .wf-video-seg'), '分段容器必须命中容器规则');
  assert.ok(
    doc.querySelector('.wf-cfg-seg__item--active').matches('.wf-cfg-seg__item, .wf-video-seg__item'),
    '分段内块必须命中内块规则',
  );
});

test('e2e: 零候选空态与触发器同几何，且不再使用内联业务样式', () => {
  // 双类选择器：基类 .wf-param-pill 位于源码更后，同特异性会按顺序压掉本规则的 color
  const empty = ruleWithSelector('.wf-param-pill.wf-param-pill--empty-models');
  assert.ok(empty, '空态规则必须用双类提高特异性（否则 color 会被基类按顺序覆盖）');
  assert.match(empty.body, /height: 32px/);
  assert.match(empty.body, /border-radius: 999px/);
  assert.match(empty.body, /var\(--dsw-alias-bg-layer-1, var\(--wb-surface-raised\)\)/);
  assert.match(empty.body, /var\(--dsw-alias-label-secondary, var\(--wb-text-secondary\)\)/);

  // 源码绑定：组件必须仍在输出该类名，否则上面的 CSS 会静默变成死规则
  assert.match(configPanelSrc, /wf-param-pill--empty-models/, '空态类名必须仍由组件输出');

  // 源码侧：空态元素不再带内联业务样式（锚点必须存在，否则断言会空过）
  const start = configPanelSrc.indexOf('data-testid="wf-model-empty"');
  const end = configPanelSrc.indexOf('panel.reason.catalog_unavailable');
  assert.ok(start !== -1 && end > start, '空态代码块锚点必须存在且顺序正确');
  const block = configPanelSrc.slice(start, end);
  assert.doesNotMatch(block, /style=\{\{/, '空态提示不得再使用内联业务样式');

  const doc = loadBarDocument();
  assert.ok(doc.getElementById('empty-models').matches('.wf-param-pill--empty-models'), '空态元素必须命中其规则');
});

test('e2e: 段间分隔改为语义化竖线，底栏不再出现字符分隔节点', () => {
  const divider = ruleWithSelector('.wf-param-pill__divider');
  assert.ok(divider, '必须存在分隔符规则');
  assert.match(divider.body, /display: block/, '竖线必须显式块化，不依赖父级 flex 上下文');
  assert.match(divider.body, /width: 1px/);
  assert.match(divider.body, /height: 12px/);
  assert.match(divider.body, /background: var\(--dsw-alias-border-l2/);
  assert.doesNotMatch(divider.body, /font-size/, '分隔符不得再依赖字号撑开（那是字符节点的做法）');

  // 源码绑定 + 分隔节点不再携带字符内容
  assert.match(configPanelSrc, /wf-param-pill__divider/, '分隔符类名必须仍由组件输出');
  assert.doesNotMatch(configPanelSrc, /wf-param-pill__divider"\s*>/, '分隔节点不得再包含字符内容');
  assert.match(configPanelSrc, /wf-param-pill__divider" aria-hidden="true"/, '分隔节点必须为装饰性空节点');

  const doc = loadBarDocument();
  const el = doc.getElementById('bar-divider');
  assert.ok(el.matches('.wf-param-pill__divider'), '分隔元素必须命中其规则');
  assert.equal(el.textContent.trim(), '', '分隔元素不得携带文本');
});
