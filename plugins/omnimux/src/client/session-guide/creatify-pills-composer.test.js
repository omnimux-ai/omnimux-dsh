import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

global.IS_REACT_ACT_ENVIRONMENT = true;

const output = await build({
  entryPoints: [new URL('./CreatifyPillsBar.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports
);
const { CreatifyPillsBar, resolveLocale, isValidLanguageCode } = module.exports;

function setupDom(html = '<!DOCTYPE html><html lang="zh"><body><div id="root"></div></body></html>') {
  const dom = new JSDOM(html);
  dom.window.IS_REACT_ACT_ENVIRONMENT = true;
  global.window = dom.window;
  global.document = dom.window.document;
  global.MutationObserver = dom.window.MutationObserver;
  global.CustomEvent = dom.window.CustomEvent;
  return dom;
}

test('CreatifyPillsBar: 中文环境下渲染 4 个中文大胶囊按键', async () => {
  setupDom('<!DOCTYPE html><html lang="zh"><body><div id="root"></div></body></html>');

  const container = document.getElementById('root');
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }));
  });

  const buttons = document.querySelectorAll('.omnimux-pill-btn');
  assert.equal(buttons.length, 4, '必须严格且仅渲染 4 个核心大胶囊按钮');
  assert.match(buttons[0].textContent, /技能/);
  assert.match(buttons[1].textContent, /视频广告/);
  assert.match(buttons[2].textContent, /图片广告/);
  assert.match(buttons[3].textContent, /竞争对手研究/);

  await act(async () => {
    root.unmount();
  });
});

test('CreatifyPillsBar: 英文环境下渲染 4 个英文大胶囊按键', async () => {
  setupDom('<!DOCTYPE html><html lang="en"><body><div id="root"></div></body></html>');

  const container = document.getElementById('root');
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'en' }));
  });

  const buttons = document.querySelectorAll('.omnimux-pill-btn');
  assert.equal(buttons.length, 4);
  assert.match(buttons[0].textContent, /Skills/);
  assert.match(buttons[1].textContent, /Video ads/);
  assert.match(buttons[2].textContent, /Image ads/);
  assert.match(buttons[3].textContent, /Competitor research/);

  await act(async () => {
    root.unmount();
  });
});

test('CreatifyPillsBar: 中文环境下点击子菜单项，注入的是中文提示词 promptZh', async () => {
  setupDom('<!DOCTYPE html><html lang="zh"><body><div id="root"></div></body></html>');

  const container = document.getElementById('root');
  const root = createRoot(container);
  let injected = '';

  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, {
      locale: 'zh',
      onApplyPrompt: (prompt) => { injected = prompt; }
    }));
  });

  // 1. 测试 Video ads 中文点击与提示词
  const videoBtn = document.querySelectorAll('.omnimux-pill-btn')[1];
  await act(async () => {
    videoBtn.click();
  });

  const header = document.querySelector('.omnimux-subprompt-popover header');
  assert.match(header.textContent, /视频广告推荐提示词/);

  const videoOptions = document.querySelectorAll('.omnimux-subprompt-popover > div');
  assert.equal(videoOptions.length, 7, 'Video ads 必须呈现专属 7 项子菜单');
  assert.match(videoOptions[0].textContent, /使用 AI 数字人为您的网站制作视频广告/);

  await act(async () => {
    videoOptions[0].click();
  });
  assert.equal(injected, '使用 AI 数字人为我的网站制作视频广告：', '中文环境下必须注入中文 promptZh');

  // 2. 测试 Image ads 中文点击与 Shopify 提示词
  const imageBtn = document.querySelectorAll('.omnimux-pill-btn')[2];
  await act(async () => {
    imageBtn.click();
  });

  const imgHeader = document.querySelector('.omnimux-subprompt-popover header');
  assert.match(imgHeader.textContent, /图片广告推荐提示词/);

  const imageOptions = document.querySelectorAll('.omnimux-subprompt-popover > div');
  assert.equal(imageOptions.length, 6, 'Image ads 必须呈现专属 6 项子菜单');
  assert.match(imageOptions[4].textContent, /为您的 Shopify 店铺制作商品图片/);

  await act(async () => {
    imageOptions[4].click();
  });
  assert.equal(injected, '为我的 Shopify 店铺制作商品图片与横幅广告：', 'Shopify 项中文环境下必须注入对应的中文提示词');

  // 3. 测试 Competitor 中文点击与提示词
  const compBtn = document.querySelectorAll('.omnimux-pill-btn')[3];
  await act(async () => {
    compBtn.click();
  });

  const compHeader = document.querySelector('.omnimux-subprompt-popover header');
  assert.match(compHeader.textContent, /竞争对手研究推荐/);

  const compOptions = document.querySelectorAll('.omnimux-subprompt-popover > div');
  assert.equal(compOptions.length, 5, 'Competitor 必须呈现 5 项子菜单');
  assert.match(compOptions[0].textContent, /查看竞争对手正在投放哪些广告/);

  await act(async () => {
    compOptions[0].click();
  });
  assert.equal(injected, '查看竞争对手正在投放哪些广告：', '竞争对手第一项必须注入对应的中文提示词');

  await act(async () => {
    root.unmount();
  });
});

test('CreatifyPillsBar: 英文环境下点击子菜单项，注入的是英文提示词 promptEn', async () => {
  setupDom('<!DOCTYPE html><html lang="en"><body><div id="root"></div></body></html>');

  const container = document.getElementById('root');
  const root = createRoot(container);
  let injected = '';

  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, {
      locale: 'en',
      onApplyPrompt: (prompt) => { injected = prompt; }
    }));
  });

  // 1. 测试 Video ads 英文点击与提示词
  const videoBtn = document.querySelectorAll('.omnimux-pill-btn')[1];
  await act(async () => {
    videoBtn.click();
  });

  const header = document.querySelector('.omnimux-subprompt-popover header');
  assert.match(header.textContent, /Video Ads Prompts/);

  const videoOptions = document.querySelectorAll('.omnimux-subprompt-popover > div');
  assert.match(videoOptions[0].textContent, /Create a video ad with an AI avatar for your website/);

  await act(async () => {
    videoOptions[0].click();
  });
  assert.equal(injected, 'Create a video ad with an AI avatar for ', '英文环境下必须注入英文 promptEn');

  // 2. 测试 Image ads 英文点击与 Shopify 提示词
  const imageBtn = document.querySelectorAll('.omnimux-pill-btn')[2];
  await act(async () => {
    imageBtn.click();
  });

  const imgHeader = document.querySelector('.omnimux-subprompt-popover header');
  assert.match(imgHeader.textContent, /Image Ads Prompts/);

  const imageOptions = document.querySelectorAll('.omnimux-subprompt-popover > div');
  assert.match(imageOptions[4].textContent, /Create product images for your Shopify store/);

  await act(async () => {
    imageOptions[4].click();
  });
  assert.equal(injected, 'Create product images and banner ads for my Shopify store: ', 'Shopify 项英文环境下必须注入英文提示词');

  // 3. 测试 Competitor 英文点击与提示词
  const compBtn = document.querySelectorAll('.omnimux-pill-btn')[3];
  await act(async () => {
    compBtn.click();
  });

  const compHeader = document.querySelector('.omnimux-subprompt-popover header');
  assert.match(compHeader.textContent, /Competitor Research/);

  const compOptions = document.querySelectorAll('.omnimux-subprompt-popover > div');
  assert.match(compOptions[0].textContent, /Show me what ads my competitors are running/);

  await act(async () => {
    compOptions[0].click();
  });
  assert.equal(injected, 'Show me what ads my competitors are running for ', '竞争对手第一项英文环境下必须注入英文提示词');

  await act(async () => {
    root.unmount();
  });
});

test('CreatifyPillsBar: 多语言自适应切换（通过修改 document.documentElement.lang 或 props 切换）', async () => {
  const dom = setupDom('<!DOCTYPE html><html lang="zh"><body><div id="root"></div></body></html>');

  const container = document.getElementById('root');
  const root = createRoot(container);
  let injected = '';

  // 1. 初始化不传 locale，自适应探测 html lang="zh"
  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, {
      onApplyPrompt: (prompt) => { injected = prompt; }
    }));
  });

  let buttons = document.querySelectorAll('.omnimux-pill-btn');
  assert.match(buttons[0].textContent, /技能/);
  assert.match(buttons[1].textContent, /视频广告/);

  // 2. 通过修改 document.documentElement.lang 由 zh -> en（MutationObserver 感知）
  await act(async () => {
    document.documentElement.setAttribute('lang', 'en');
    await new Promise((r) => setTimeout(r, 25));
  });

  buttons = document.querySelectorAll('.omnimux-pill-btn');
  assert.match(buttons[0].textContent, /Skills/, 'HTML lang 改变为 en 后，胶囊按键应自适应切换为英文');
  assert.match(buttons[1].textContent, /Video ads/);

  // 点击展开并验证注入提示词为英文
  await act(async () => {
    buttons[1].click();
  });
  let videoOptions = document.querySelectorAll('.omnimux-subprompt-popover > div');
  await act(async () => {
    videoOptions[0].click();
  });
  assert.equal(injected, 'Create a video ad with an AI avatar for ', '自适应切换到英文后注入提示词为英文');

  // 3. 通过 window 自定义事件 omnimux:locale-change 切换回 zh
  await act(async () => {
    window.dispatchEvent(new dom.window.CustomEvent('omnimux:locale-change', { detail: { locale: 'zh' } }));
    await new Promise((r) => setTimeout(r, 25));
  });

  buttons = document.querySelectorAll('.omnimux-pill-btn');
  assert.match(buttons[0].textContent, /技能/, '事件触发切换后胶囊按键应恢复为中文');
  assert.equal(document.documentElement.lang, 'en', '全局 DOM document.documentElement.lang 绝不被子组件修改');

  // 4. 通过 props.locale 显式切换
  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, {
      locale: 'en',
      onApplyPrompt: (prompt) => { injected = prompt; }
    }));
  });

  buttons = document.querySelectorAll('.omnimux-pill-btn');
  assert.match(buttons[0].textContent, /Skills/, '通过 props.locale="en" 应切换为英文');

  await act(async () => {
    root.unmount();
  });
});

test('CreatifyPillsBar: 技能弹窗在中文和英文环境下完整支持搜索占位符、操作按钮与真实数据（65+ 项）', async () => {
  // 1. 中文环境下
  setupDom('<!DOCTYPE html><html lang="zh"><body><div id="root-zh"></div></body></html>');

  const containerZh = document.getElementById('root-zh');
  const rootZh = createRoot(containerZh);

  await act(async () => {
    rootZh.render(React.createElement(CreatifyPillsBar, { locale: 'zh' }));
  });

  const skillsBtnZh = document.querySelectorAll('.omnimux-pill-btn')[0];
  await act(async () => {
    skillsBtnZh.click();
  });

  const skillsPopoverZh = document.querySelector('.omnimux-skills-popover');
  assert.ok(skillsPopoverZh, '中文技能面板必须展开');
  assert.ok(!skillsPopoverZh.querySelector('button[aria-label*="关闭"], button[aria-label*="Close"]'), '严禁包含关闭按钮');

  const searchInputZh = skillsPopoverZh.querySelector('input');
  assert.equal(searchInputZh.getAttribute('placeholder'), '搜索技能...', '中文下搜索框占位符正确');
  assert.match(skillsPopoverZh.textContent, /浏览全部/);
  assert.match(skillsPopoverZh.textContent, /浏览全部技能/);

  // 验证真实技能数量 65+
  const skillItemsZh = skillsPopoverZh.querySelectorAll('.skills-list-box > div, div[style*="cursor: pointer"]');
  assert.ok(skillItemsZh.length >= 60, `技能列表数据必须来自技能市场（当前实测项数: ${skillItemsZh.length}）`);

  await act(async () => {
    rootZh.unmount();
  });

  // 2. 英文环境下
  setupDom('<!DOCTYPE html><html lang="en"><body><div id="root-en"></div></body></html>');

  const containerEn = document.getElementById('root-en');
  const rootEn = createRoot(containerEn);

  await act(async () => {
    rootEn.render(React.createElement(CreatifyPillsBar, { locale: 'en' }));
  });

  const skillsBtnEn = document.querySelectorAll('.omnimux-pill-btn')[0];
  await act(async () => {
    skillsBtnEn.click();
  });

  const skillsPopoverEn = document.querySelector('.omnimux-skills-popover');
  assert.ok(skillsPopoverEn, '英文技能面板必须展开');
  const searchInputEn = skillsPopoverEn.querySelector('input');
  assert.equal(searchInputEn.getAttribute('placeholder'), 'Search skills', '英文下搜索框占位符正确');
  assert.match(skillsPopoverEn.textContent, /Browse all/);
  assert.match(skillsPopoverEn.textContent, /Browse all skills/);

  await act(async () => {
    rootEn.unmount();
  });
});

test('resolveLocale: 统一纯函数严格遵循 a -> b -> c -> d 优先级解析语言', () => {
  // 1. 优先级 a：t('locale') 返回有效字符串时最优先
  const dom = setupDom('<!DOCTYPE html><html lang="zh"><body></body></html>');
  assert.equal(
    resolveLocale('zh', (k) => (k === 'locale' ? 'en' : k)),
    'en',
    'a 优先：t("locale") 返回 "en" 时应覆盖 document lang 与 locale prop'
  );

  // 2. 优先级 a：t('guide.locale') 返回有效字符串时生效
  assert.equal(
    resolveLocale('zh', (k) => (k === 'guide.locale' ? 'en' : (k === 'locale' ? 'locale' : k))),
    'en',
    'a 优先：t("guide.locale") 返回 "en" 时生效'
  );

  // 3. 优先级 a 返回 key 本身或无效时回退到 b
  assert.equal(
    resolveLocale('zh', (k) => k),
    'zh',
    'a 无效时回退到 b：读取 document.documentElement.lang="zh"'
  );

  // 4. 优先级 b：document.documentElement.lang 生效
  document.documentElement.lang = 'en';
  assert.equal(
    resolveLocale(undefined, null),
    'en',
    'b 优先：无有效 t 时，优先读取 document.documentElement.lang'
  );

  // 5. 优先级 c：显式传入非空 locale prop
  document.documentElement.lang = '';
  assert.equal(
    resolveLocale('en', null),
    'en',
    'c 生效：无 t 且 document.lang 为空时，使用显式传入的 locale prop'
  );

  // 6. 优先级 d：兜底回退为 zh
  assert.equal(
    resolveLocale(undefined, null),
    'zh',
    'd 兜底：所有条件均为空时，兜底回退为 "zh"'
  );
  assert.equal(
    resolveLocale('', () => ''),
    'zh',
    'd 兜底：t 返回空字符串且 prop 为空时，兜底回退为 "zh"'
  );
});

test('isValidLanguageCode: 严格校验语言代码有效性（标准小函数）', () => {
  // 合法格式
  assert.equal(isValidLanguageCode('zh'), true);
  assert.equal(isValidLanguageCode('en'), true);
  assert.equal(isValidLanguageCode('zh-CN'), true);
  assert.equal(isValidLanguageCode('en-US'), true);
  assert.equal(isValidLanguageCode('zh-Hans'), true);
  assert.equal(isValidLanguageCode('ja'), true);
  assert.equal(isValidLanguageCode('fr'), true);

  // 非法格式、未命中 key、带命名空间与异常数据
  assert.equal(isValidLanguageCode('locale'), false, '未命中 key "locale" 长度不为 2，应被判定为非法');
  assert.equal(isValidLanguageCode('guide.locale'), false, '未命中 key "guide.locale" 应被判定为非法');
  assert.equal(isValidLanguageCode('common:locale'), false, '带命名空间的 key 应被判定为非法');
  assert.equal(isValidLanguageCode('unknown'), false, '未知长字符串非法');
  assert.equal(isValidLanguageCode(''), false, '空字符串非法');
  assert.equal(isValidLanguageCode('   '), false, '空白字符串非法');
  assert.equal(isValidLanguageCode(null), false, 'null 非法');
  assert.equal(isValidLanguageCode(undefined), false, 'undefined 非法');
  assert.equal(isValidLanguageCode(123), false, '数字非法');
  assert.equal(isValidLanguageCode(true), false, '布尔值非法');
});

test('resolveLocale: 严格过滤非法字符串、未命中 key 与命名空间 key', () => {
  setupDom('<!DOCTYPE html><html lang="zh"><body></body></html>');

  // t('locale') 未命中返回 'locale' 或 'guide.locale'，不能作为语言代码
  assert.equal(
    resolveLocale('zh', (k) => k),
    'zh',
    '未命中返回 key 本身时应被过滤，回退到 document lang'
  );

  // t 返回未知长字符串
  assert.equal(
    resolveLocale('zh', () => 'unknown_locale_string'),
    'zh',
    't 返回非法字符串时应被过滤，回退到 document lang'
  );

  // props 传入非法字符串
  document.documentElement.lang = '';
  assert.equal(
    resolveLocale('some-invalid-locale-key', null),
    'zh',
    'props 传入非法语言代码时应被过滤，最终兜底到 zh'
  );
});

test('CreatifyPillsBar: 严格保持局部子组件单向只读，绝不污染 document.documentElement.lang', async () => {
  setupDom('<!DOCTYPE html><html lang="zh"><body><div id="root"></div></body></html>');

  const container = document.getElementById('root');
  const root = createRoot(container);

  // 1. 即使显式传入 locale='en'，绝不修改全局 document.documentElement.lang
  await act(async () => {
    root.render(React.createElement(CreatifyPillsBar, { locale: 'en' }));
  });

  assert.equal(document.documentElement.lang, 'zh', '挂载 locale="en" 后，全局 DOM lang 必须保持原有 "zh"，绝不被篡改');

  // 2. 外部触发自定义事件切换语言，全局 DOM lang 依然保持不变
  await act(async () => {
    window.dispatchEvent(new window.CustomEvent('omnimux:locale-change', { detail: { locale: 'en' } }));
    await new Promise((r) => setTimeout(r, 20));
  });

  assert.equal(document.documentElement.lang, 'zh', '自定义事件派发后，全局 DOM lang 必须保持不变，无回环写入风险');

  await act(async () => {
    root.unmount();
  });
});
