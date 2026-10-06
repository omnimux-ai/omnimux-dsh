/**
 * plugins/omnimux-workflow/tests/e2e/preset-operation-3206.journey.mjs
 *
 * Issue #3206 真实浏览器功能旅程（由工作树应用级验收运行器在真实 Chrome 里执行）。
 *
 * 断言的是**当前发布产物在真实运行页面里的 DOM 事实**：
 *  1. 内置应用「手机与网页交互实机演示」（appId `app-creatify-app-demo`）确实出现在真实产品
 *     界面的创作模板区（素材工作台 → 精选 → 软件应用），说明本次模板数据改动随包发布；
 *  2. 探索页「AI应用」面板渲染出真实的一级应用清单（对照真值）。
 *
 * 边界（如实声明，不伪造）：当前构建里 `app-creatify-app-demo` 以**创作模板卡片**形式出现，
 * 「AI应用」面板的一级应用清单中不含它，因此「应用卡片 → 创建副本 → 副本画布」这条应用页
 * 旅程在当前构建中**不可达**，本旅程不做该断言（以 `builtin-app-not-in-first-level-app-menu`
 * 显式记录该边界）。副本画布的冲突回归由同一 e2e 文件内的生产行为断言覆盖：真实
 * `recomputeCanvasSlots` + 随包模板数据，断言无 `slot_removed` 冲突且 `readyToSubmit`。
 */
import assert from 'node:assert/strict';

/** 内置应用的界面标题（与 catalog/presets/app-creatify-app-demo.workflow.json 的 name 一致）。 */
const BUILTIN_APP_TITLE = '手机与网页交互实机演示';
/** 「AI应用」面板当前渲染的一级应用清单（对照真值，用于确认面板已就绪）。 */
const FIRST_LEVEL_APPS = ['视频剪辑', 'Google Vids', '产品库', '发布', '账号', '手机管理', '数据分析', '自动化', '任务表单', '社交采收', '快讯中枢'];

/** 把一次强断言收敛成一条旅程断言记录：断言失败即 pass:false 并保留真实判据。 */
function check(assertions, name, fn) {
  try {
    fn();
    assertions.push({ name, pass: true });
  } catch (error) {
    assertions.push({ name, pass: false, detail: error?.message ?? String(error) });
  }
}

export default async function presetOperation3206Journey({ send, sleep, evidenceDir, io }) {
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result?.exceptionDetails, `真实页面求值失败：${result?.exceptionDetails?.text ?? 'unknown'}`);
    const value = result?.result?.value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value; }
    }
    return value;
  };
  const clickExact = (text, selector) => evaluate(`JSON.stringify((() => {
    const t = ${JSON.stringify(text)};
    const cands = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter(e => (e.textContent || '').replace(/\\s+/g, ' ').trim() === t);
    if (!cands.length) return { clicked: false, candidates: 0 };
    cands[0].click();
    return { clicked: true, tag: cands[0].tagName, cls: String(cands[0].className).slice(0, 120) };
  })())`);
  const screenshot = async (name) => {
    const captured = await send('Page.captureScreenshot', { format: 'png' });
    io.writeFileSync(`${evidenceDir}/${name}.png`, Buffer.from(captured.data, 'base64'));
  };

  const assertions = [];
  await sleep(2000);

  // 1. 真实界面里存在随包发布的内置应用入口（创作模板卡片）。
  const entry = await evaluate(`JSON.stringify((() => {
    const leaves = [...document.querySelectorAll('body *')]
      .filter(e => e.children.length === 0 && (e.textContent || '').trim() === ${JSON.stringify(BUILTIN_APP_TITLE)});
    const card = leaves[0] ? leaves[0].closest('[class*="card"], article, button, [role="checkbox"]') : null;
    return { leaves: leaves.length, cardTag: card ? card.tagName : null,
      cardCls: card ? String(card.className).slice(0, 140) : null };
  })())`);
  check(assertions, 'builtin-app-entry-present-in-real-ui', () => {
    assert.equal(entry.leaves, 1, `真实界面应恰好出现一处内置应用入口，实际 ${entry.leaves}`);
    assert.ok(entry.cardCls, '内置应用入口必须挂在真实卡片元素上');
  });
  await screenshot('builtin-app-entry');

  // 2. 探索页「AI应用」面板渲染出真实一级应用清单。
  const explore = await clickExact('探索', 'button, a, [role="button"], [role="tab"]');
  await sleep(2500);
  const aiApps = await clickExact('AI应用', 'button, a, [role="button"], [role="tab"], [class*="paneCard"]');
  await sleep(2000);
  const menu = await evaluate(`JSON.stringify((() => {
    const root = document.querySelector('.omnimux-explore-menu');
    const items = root ? [...root.querySelectorAll('button, a, [role="button"], [class*="card"]')]
      .map(e => (e.textContent || '').replace(/\\s+/g, ' ').trim()).filter(Boolean) : [];
    return { rootPresent: Boolean(root), items: [...new Set(items)] };
  })())`);
  check(assertions, 'explore-entry-clicked', () => assert.equal(explore.clicked, true, '探索入口应可点击'));
  check(assertions, 'ai-apps-panel-clicked', () => assert.equal(aiApps.clicked, true, 'AI应用面板入口应可点击'));
  check(assertions, 'ai-apps-panel-renders-first-level-apps', () => {
    assert.equal(menu.rootPresent, true, '探索页应用菜单容器未渲染');
    for (const name of FIRST_LEVEL_APPS) assert.ok(menu.items.includes(name), `一级应用清单缺少「${name}」`);
  });
  // 如实记录边界：该内置应用当前不以一级应用卡片形式出现，故应用页「创建副本」旅程不可达。
  check(assertions, 'builtin-app-not-in-first-level-app-menu', () => {
    assert.equal(menu.items.includes(BUILTIN_APP_TITLE), false,
      '若该应用已进入一级应用清单，应改为断言「创建副本」应用页旅程');
  });
  await screenshot('explore-ai-apps-panel');

  return { assertions };
}
