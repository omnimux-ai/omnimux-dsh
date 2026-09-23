import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { QUICK_SHORTCUTS_CSS } from '../../src/client/composer-quick-shortcuts/styles.js';

/**
 * E2E: 输入框快捷方式移除实时参数并接入方案 B 会话模型选择器 (Issue #2626)
 *
 * 验证：
 * 1. 彻底移除相机参数摘要按钮 #paramSummaryTriggerBtn 与 MediaParamsPanel；
 * 2. 方案 B 经典会话模型选择器正确挂载于快捷方式底栏：
 *    - 默认自动推荐态：显示立体层级「模型」按钮（data-omnimux-model-picker）；
 *    - 点击打开浮层面板（sh-model-picker），包含「自动 (由 Agent 决策)」开关与视频/图像 Tab；
 *    - 点击特定模型：自动置 auto=false，锁定模型，POST /omnimux/session-model，
 *      同步 sessionStorage 并分发 omnimux:model:changed 事件，底栏更新为模型胶囊（data-omnimux-model-capsule）；
 *    - 再次打开面板点击开关恢复自动时：恢复 auto=true，清空选中模型，底栏恢复「模型」按钮；
 * 3. 跨会话切换时会话偏好正确隔离；
 * 4. 紧凑模式下自适应计算样式生效；
 * 5. 动态 Catalog 非空校验、唯一性去重、无障碍焦点管理与品牌解析。
 */

const output = await build({
  entryPoints: [new URL('../../src/client/composer-quick-shortcuts/ComposerQuickShortcuts.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  mod,
  mod.exports,
);
const { ComposerQuickShortcuts, ComposerQuickShortcutControls } = mod.exports;

const modelPickerOutput = await build({
  entryPoints: [new URL('../../src/client/composer-quick-shortcuts/ModelPicker.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
});
const modelPickerMod = { exports: {} };
new Function('require', 'module', 'exports', modelPickerOutput.outputFiles[0].text)(
  createRequire(import.meta.url),
  modelPickerMod,
  modelPickerMod.exports,
);
const { resolveModelBrand, publishSessionModel } = modelPickerMod.exports;

const LABELS = {
  'quickShortcuts.clone': '复刻爆款视频',
  'quickShortcuts.breakdown': '拆解爆款视频',
  'quickShortcuts.selling': '一键创作带货视频',
  'quickShortcuts.reverse': '反推视频提示词',
};

async function mount(options = {}) {
  const sessionId = options.sessionId || 'e2e-session-2626';
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head></head><body>'
    + '<div data-composer-card><div id="editor" data-composer-input="true" contenteditable="true"></div><div id="inline-seat"></div></div>'
    + '<div id="host"></div></body></html>',
    { url: 'http://localhost/' },
  );

  // 注入完整样式表，使 JSDOM 下 getComputedStyle 能解析真实 CSS 规则
  const styleEl = dom.window.document.createElement('style');
  styleEl.textContent = QUICK_SHORTCUTS_CSS;
  dom.window.document.head.appendChild(styleEl);

  global.window = dom.window;
  global.document = dom.window.document;
  global.CustomEvent = dom.window.CustomEvent;
  global.sessionStorage = dom.window.sessionStorage;
  global.IS_REACT_ACT_ENVIRONMENT = true;

  const fetchCalls = [];
  global.fetch = async (url, fetchOptions = {}) => {
    fetchCalls.push({ url, options: fetchOptions });
    if (typeof options.fetchHandler === 'function') {
      return options.fetchHandler(url, fetchOptions);
    }
    if (url === '/omnimux/model-catalog') {
      return {
        ok: true,
        json: async () => ({
          video: [
            { id: 'seedance-2-0', name: 'Dreamina Seedance 2.0', subtitle: '更精准的参考，更真实，高达4K', pro: true },
            { id: 'wan-3.0', name: 'Wan 3.0', subtitle: '通义万相电影级视效与长镜头生成', pro: false },
          ],
          image: [
            { id: 'seedream-5-0-pro', name: 'Seedream 5.0 Pro', subtitle: '更精确、更可控的编辑', pro: true },
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({ success: true }) };
  };

  let draft = '';
  const writes = [];
  dom.window.__omnimuxComposerActions = {
    setDraft: (text) => { draft = String(text ?? ''); writes.push(draft); return true; },
    getDraft: () => draft,
  };
  dom.window.__omnimuxSkillLibrary = { resolvePresetSkill: (slug) => ({ slug, title: slug }) };

  const container = document.getElementById('host');
  const root = createRoot(container);
  const session = { id: sessionId, blank: true };

  await act(async () => {
    const props = {
      t: (key, fallback) => LABELS[key] || fallback || key,
      sessionId,
      session,
      useSession: (selector) => selector(session),
      useConversation: (selector) => selector({ activeTargets: new Set() }),
    };
    root.render(React.createElement(React.Fragment, null,
      React.createElement(ComposerQuickShortcuts, props),
      createPortal(React.createElement(ComposerQuickShortcutControls, props), document.getElementById('inline-seat')),
    ));
  });

  const click = async (id) => {
    const button = document.querySelector(`[data-omx-quick-shortcut="${id}"]`);
    assert.ok(button, `找不到快捷方式 ${id}`);
    await act(async () => {
      button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
  };

  return { dom, root, click, writes, getDraft: () => draft, sessionId, fetchCalls };
}

describe('方案 B 会话模型选择器 E2E (Issue #2626)', () => {
  it('AC-1: 激活复刻爆款视频时，底栏不再展示任何相机参数按钮 (#paramSummaryTriggerBtn)', async () => {
    const env = await mount({ sessionId: 'session-ac1' });
    try {
      await env.click('clone');
      assert.equal(document.querySelector('#paramSummaryTriggerBtn'), null, '底栏快捷方式严禁出现相机参数摘要按钮');
      assert.equal(document.querySelector('.omx-params-panel'), null, '底栏快捷方式严禁出现相机生成参数面板');
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-2 & AC-3: 接入方案 B 模型选择器：默认显示立体「模型」按钮，点击弹出浮层面板', async () => {
    const env = await mount({ sessionId: 'session-ac2' });
    try {
      await env.click('clone');

      const trigger = document.querySelector('[data-composer-card] [data-omnimux-model-picker]');
      assert.ok(trigger, '底栏必须挂载方案 B 模型选择器触发按钮');
      assert.equal(trigger.getAttribute('aria-label'), '模型');
      assert.match(trigger.textContent, /模型/);
      assert.ok(trigger.querySelector('svg'), '必须渲染立体层级图标');

      // 点击打开面板
      await act(async () => {
        trigger.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      const panel = document.querySelector('.sh-model-picker');
      assert.ok(panel, '点击后必须渲染浮层面板');
      assert.equal(panel.getAttribute('role'), 'dialog');

      // 顶部自动开关
      const autoSwitch = panel.querySelector('.sh-model-switch');
      assert.ok(autoSwitch, '面板顶部必须包含自动决策开关');
      assert.equal(autoSwitch.getAttribute('aria-checked'), 'true', '默认状态自动开关必须开启');
      assert.match(panel.querySelector('.sh-model-auto-label').textContent, /自动/);

      // 模态 Tab
      const tabs = panel.querySelectorAll('[role="tab"]');
      assert.equal(tabs.length, 2, '必须有视频和图像两个模态 Tab');
      assert.match(tabs[0].textContent, /视频/);
      assert.match(tabs[1].textContent, /图像/);
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-4: 点击具体模型时，锁定该模型，更新胶囊，置 auto 为 false，同步中枢与事件', async () => {
    const env = await mount({ sessionId: 'session-ac4' });
    try {
      let eventFired = null;
      env.dom.window.addEventListener('omnimux:model:changed', (e) => {
        eventFired = e.detail;
      });

      await env.click('clone');

      const trigger = document.querySelector('[data-composer-card] [data-omnimux-model-picker]');
      await act(async () => {
        trigger.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      const rows = document.querySelectorAll('.sh-model-row');
      assert.ok(rows.length > 0, '模型列表必须呈现模型卡片');

      // 点击第一个模型卡片
      await act(async () => {
        rows[0].dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      // 面板自动收起
      assert.equal(document.querySelector('.sh-model-picker'), null, '选中模型后浮层面板应自动收起');

      // 底栏更新为模型胶囊
      const capsule = document.querySelector('[data-composer-card] [data-omnimux-model-capsule]');
      assert.ok(capsule, '手动锁定后底栏必须显示选中的模型胶囊');
      assert.ok(capsule.querySelector('.sh-model-brand-icon'), '胶囊必须带有品牌图标');
      assert.ok(capsule.querySelector('.sh-model-capsule-name'), '胶囊必须带有模型名称');

      // 检查事件分发
      assert.ok(eventFired, '必须分发 omnimux:model:changed 事件');
      assert.equal(eventFired.auto, false, '手动选中模型后 auto 必须为 false');
      assert.ok(eventFired.selectedModel, '必须带上选中的模型对象');

      // 检查 sessionStorage
      const saved = JSON.parse(env.dom.window.sessionStorage.getItem(`omnimux:model:${env.sessionId}`));
      assert.equal(saved.auto, false);
      assert.equal(saved.selectedModel.id, eventFired.selectedModel.id);

      // 检查向中枢发送了同步请求
      const sessionPost = env.fetchCalls.find(
        (c) => c.url === '/omnimux/session-model' && c.options?.method === 'POST',
      );
      assert.ok(sessionPost, '必须向 /omnimux/session-model 同步模型锁定状态');
      const body = JSON.parse(sessionPost.options.body);
      assert.equal(body.auto, false);
      assert.equal(body.sessionId, env.sessionId);
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-5: 重新打开面板开启「自动」开关时，恢复自动决策态，底栏胶囊恢复「模型」按钮', async () => {
    const env = await mount({ sessionId: 'session-ac5' });
    try {
      await env.click('clone');

      // 先手动选一个模型
      let trigger = document.querySelector('[data-composer-card] [data-omnimux-model-picker]');
      await act(async () => {
        trigger.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });
      const rows = document.querySelectorAll('.sh-model-row');
      await act(async () => {
        rows[0].dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      // 此时是胶囊
      const capsule = document.querySelector('[data-composer-card] [data-omnimux-model-capsule]');
      assert.ok(capsule);

      // 再次点击胶囊打开面板
      await act(async () => {
        capsule.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      const panel = document.querySelector('.sh-model-picker');
      assert.ok(panel);
      const autoSwitch = panel.querySelector('.sh-model-switch');
      assert.equal(autoSwitch.getAttribute('aria-checked'), 'false', '手动模式下面板打开时开关为关闭态');

      // 点击自动开关
      await act(async () => {
        autoSwitch.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      // 恢复自动决策：底栏胶囊恢复为「模型」按钮
      assert.ok(document.querySelector('[data-composer-card] [data-omnimux-model-picker]'));
      assert.equal(document.querySelector('[data-composer-card] [data-omnimux-model-capsule]'), null);

      // 检查 sessionStorage
      const saved = JSON.parse(env.dom.window.sessionStorage.getItem(`omnimux:model:${env.sessionId}`));
      assert.equal(saved.auto, true);
      assert.equal(saved.selectedModel, null);
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-6: 模态 Tab 切换正常工作', async () => {
    const env = await mount({ sessionId: 'session-ac6' });
    try {
      await env.click('clone');
      const trigger = document.querySelector('[data-composer-card] [data-omnimux-model-picker]');
      await act(async () => {
        trigger.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      const panel = document.querySelector('.sh-model-picker');
      const tabs = panel.querySelectorAll('[role="tab"]');
      const videoTab = tabs[0];
      const imageTab = tabs[1];

      assert.ok(videoTab.classList.contains('active'));

      // 点击图像 Tab
      await act(async () => {
        imageTab.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      assert.ok(imageTab.classList.contains('active'));
      assert.match(panel.querySelector('.sh-model-section-title').textContent, /图像/);
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-7: 浮层面板结构完备，无多余滚动或折行类，卡片具备品牌图标与单选钮', async () => {
    const env = await mount({ sessionId: 'session-ac7' });
    try {
      await env.click('clone');
      const trigger = document.querySelector('[data-composer-card] [data-omnimux-model-picker]');
      await act(async () => {
        trigger.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      const panel = document.querySelector('.sh-model-picker');
      assert.ok(panel);
      assert.ok(panel.querySelector('.sh-model-list'), '必须包含单列模型列表');

      const rows = panel.querySelectorAll('.sh-model-row');
      assert.ok(rows.length > 0);
      for (const row of rows) {
        assert.ok(row.querySelector('.sh-model-icon-box'), '每行必须包含品牌图标盒子');
        assert.ok(row.querySelector('.sh-model-name'), '每行必须包含模型名称');
        assert.ok(row.querySelector('.sh-model-row-desc'), '每行必须包含特性描述');
        assert.ok(row.querySelector('.sh-model-radio'), '每行必须包含单选指示器');
      }
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-8: 兼容 composer-compact 内联紧凑模式属性与类名挂载', async () => {
    const env = await mount({ sessionId: 'session-ac8' });
    try {
      await env.click('clone');
      const card = document.querySelector('[data-composer-card]');
      assert.ok(card);

      const controls = card.querySelector('[data-omx-quick-shortcut-controls]');
      assert.ok(controls, '必须暴露 data-omx-quick-shortcut-controls 供紧凑计算定位');

      const trigger = card.querySelector('.sh-picker-trigger');
      assert.ok(trigger);
      const label = trigger.querySelector('.sh-picker-trigger-label');
      assert.ok(label);
      assert.ok(trigger.querySelector('svg'));

      // 验证在 full 密度下，标签正常显示
      card.setAttribute('data-omnimux-inline-density', 'full');
      assert.equal(env.dom.window.getComputedStyle(label).display, 'inline');

      // 验证在 icon 密度下，触发器具备紧凑收缩，标签隐藏，宽度收窄为 28px
      card.setAttribute('data-omnimux-inline-density', 'icon');
      assert.equal(env.dom.window.getComputedStyle(label).display, 'none');
      assert.equal(env.dom.window.getComputedStyle(trigger).width, '28px');

      // 验证选中模型后胶囊在 icon 密度下的表现
      await act(async () => {
        trigger.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });
      const panel = document.querySelector('.sh-model-picker');
      const rows = panel.querySelectorAll('.sh-model-row');
      await act(async () => {
        rows[0].dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      const capsule = card.querySelector('.sh-model-capsule-btn');
      assert.ok(capsule);
      const capsuleName = capsule.querySelector('.sh-model-capsule-name');
      assert.ok(capsuleName);

      // icon 密度下胶囊名称隐藏，胶囊本身收缩为 28px 图标
      assert.equal(env.dom.window.getComputedStyle(capsuleName).display, 'none');
      assert.equal(env.dom.window.getComputedStyle(capsule).width, '28px');
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-9: Catalog 动态数据严格校验与 ID 唯一性去重（过滤非法空 ID 与重复 ID）', async () => {
    const env = await mount({
      sessionId: 'session-ac9',
      fetchHandler: async (url) => {
        if (url === '/omnimux/model-catalog') {
          return {
            ok: true,
            json: async () => ({
              video: [
                { id: 'valid-model-1', name: '有效模型 1' },
                { id: '', name: '空 ID 模型应当被过滤' },
                { id: '   ', name: '纯空格 ID 模型应当被过滤' },
                { id: 'valid-model-1', name: '重复 ID 模型应当被去重' },
                { id: null, name: 'null ID 模型应当被过滤' },
                { id: 'valid-model-2', name: '有效模型 2' },
              ],
              image: [],
            }),
          };
        }
        return { ok: true, json: async () => ({ success: true }) };
      },
    });

    try {
      await env.click('clone');
      const trigger = document.querySelector('[data-composer-card] [data-omnimux-model-picker]');
      await act(async () => {
        trigger.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      const panel = document.querySelector('.sh-model-picker');
      assert.ok(panel);
      const rows = panel.querySelectorAll('.sh-model-row');
      // 只有 valid-model-1 与 valid-model-2 应该被渲染
      assert.equal(rows.length, 2, '非法或重复 ID 必须被过滤与去重，仅保留 2 个有效模型');
      assert.equal(rows[0].querySelector('.sh-model-name').textContent, '有效模型 1');
      assert.equal(rows[1].querySelector('.sh-model-name').textContent, '有效模型 2');
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-10: 无障碍焦点管理与 Focus Trap：展开自动聚焦首个元素，Esc 键恢复焦点', async () => {
    const env = await mount({ sessionId: 'session-ac10' });
    try {
      await env.click('clone');
      const trigger = document.querySelector('[data-composer-card] [data-omnimux-model-picker]');

      // 展开前 trigger 可获得焦点
      trigger.focus();
      assert.equal(document.activeElement, trigger);

      // 点击展开
      await act(async () => {
        trigger.dispatchEvent(new env.dom.window.MouseEvent('click', { bubbles: true }));
      });

      const panel = document.querySelector('.sh-model-picker');
      assert.ok(panel);

      // 等待宏任务焦点移动
      await new Promise((r) => setTimeout(r, 10));

      const firstFocusable = panel.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
      assert.ok(firstFocusable);
      assert.equal(document.activeElement, firstFocusable, '展开时必须将焦点移入首个可聚焦元素（如自动开关）');

      // 按 Esc 键关闭
      await act(async () => {
        document.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      // 验证面板关闭
      assert.equal(document.querySelector('.sh-model-picker'), null, '按 Esc 后面板必须关闭');
      // 验证焦点恢复至 trigger
      assert.equal(document.activeElement, trigger, '按 Esc 关闭后焦点必须恢复至触发按钮 anchorRef');
    } finally {
      await act(async () => env.root.unmount());
    }
  });

  it('AC-11: resolveModelBrand 品牌解析准确性：seedream 正确返回 seedream，避免过度匹配', () => {
    assert.equal(resolveModelBrand('seedream'), 'seedream', 'BRAND_SVGS 中直接存在的品牌必须优先直通返回');
    assert.equal(resolveModelBrand('seedream-5-0-pro'), 'seedream', 'seedream 系列必须解析为 seedream 品牌');
    assert.equal(resolveModelBrand('seedance-2-0'), 'bytedance', 'seedance 系列必须解析为 bytedance 品牌');
    assert.equal(resolveModelBrand('nanobanana-2'), 'nanobanana');
    assert.equal(resolveModelBrand('gpt-4o'), 'openai');
    assert.equal(resolveModelBrand('minimax-h3'), 'minimax');
  });

  it('AC-12: 已锁定模型如果从 Catalog 中下架，自动回退为自动推荐模式', async () => {
    const env = await mount({
      sessionId: 'session-ac12',
      fetchHandler: async (url) => {
        if (url === '/omnimux/model-catalog') {
          return {
            ok: true,
            json: async () => ({
              video: [
                { id: 'new-model-available', name: '新上线模型' },
              ],
              image: [],
            }),
          };
        }
        return { ok: true, json: async () => ({ success: true }) };
      },
    });

    try {
      // 预先写入已锁定的旧模型
      env.dom.window.sessionStorage.setItem('omnimux:model:session-ac12', JSON.stringify({
        auto: false,
        selectedModel: { id: 'old-deprecated-model', name: '已下架旧模型' },
      }));

      await env.click('clone');

      // 触发一次 catalog 更新事件通知
      await act(async () => {
        env.dom.window.dispatchEvent(new env.dom.window.CustomEvent('omnimux:model-catalog-updated'));
      });

      // 等待状态同步
      await new Promise((r) => setTimeout(r, 20));

      // 断言已自动重置为自动推荐态，胶囊消失，恢复立体模型触发按钮
      const trigger = document.querySelector('[data-composer-card] [data-omnimux-model-picker]');
      assert.ok(trigger, '下架后必须恢复为默认立体模型选择按钮');
      const capsule = document.querySelector('[data-composer-card] [data-omnimux-model-capsule]');
      assert.equal(capsule, null, '下架后胶囊必须消失');

      const saved = JSON.parse(env.dom.window.sessionStorage.getItem('omnimux:model:session-ac12'));
      assert.equal(saved.auto, true, '下架后存储状态自动置 auto=true');
      assert.equal(saved.selectedModel, null, '下架后存储状态 selectedModel 清空');
    } finally {
      await act(async () => env.root.unmount());
    }
  });
});
