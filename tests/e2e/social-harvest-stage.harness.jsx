/**
 * tests/e2e/social-harvest-stage.harness.jsx
 *
 * Issue #2426 任务级浏览器夹具：挂载真实的 HarvestStage 页面，
 * 以 mock fetch 驱动完整旅程并输出结构化断言：
 *   1. 平台列表渲染 9 个站点与状态徽章；
 *   2. 选中平台后渲染命令工具集；
 *   3. 点击工具行打开弹窗，表单按命令规格渲染；
 *   4. 必填校验：空关键词时执行按钮禁用；
 *   5. 执行后弹窗内回显结构化结果；
 *   6. 错误路径：HARVEST_AUTH 渲染错误码与可执行 hint；
 *   7. 登录态徽章随 whoami 应答更新。
 */
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { HarvestStage } from '../../plugins/omnimux-social-harvest/src/client/HarvestStage.jsx';
import { zh } from '../../plugins/omnimux-social-harvest/src/client/locales.js';
import { registryView } from '../../plugins/omnimux-social-harvest/src/collect/registry.js';

const t = (k) => zh[k] ?? k;

// ── mock fetch：插件 HTTP 桥的确定性替身 ─────────────────────
const FIXTURE_ITEMS = [
  { title: 'viral blender demo', author: '@kitchenfinds', plays: '42.1M', likes: '3.8M' },
  { title: 'smoothie in 15s', author: '@fitnessdaily', plays: '18.7M', likes: '1.2M' },
];

window.fetch = async (input, init) => {
  const url = String(input);
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (url.endsWith('/status')) {
    return json({
      ok: true,
      enabled: true,
      env: { installed: true, version: '1.8.8', bridgeOk: true, checkedAtMs: 1 },
      sites: registryView(),
    });
  }
  if (url.endsWith('/run')) {
    const body = JSON.parse(init?.body ?? '{}');
    if (body.command === 'whoami') {
      // tiktok 已登录，其余未登录
      return body.site === 'tiktok'
        ? json({ ok: true, items: [{ username: 'me' }], rawCount: 1 })
        : json({ ok: false, error: { code: 'HARVEST_AUTH', message: `${body.site} 登录态无效或已过期`, hint: '先在浏览器登录' } }, 401);
    }
    if (body.command === 'login') return json({ ok: true, site: body.site });
    if (body.command === 'explore') {
      // 错误路径夹具：强制 AUTH 失败
      return json({ ok: false, error: { code: 'HARVEST_AUTH', message: 'TikTok 登录态无效或已过期', hint: '先在浏览器登录 TikTok，再用「去登录」重新连接后重试' } }, 401);
    }
    return json({ ok: true, site: body.site, command: body.command, items: FIXTURE_ITEMS, rawCount: 2, warnings: [], fetchedAtMs: 1 });
  }
  return json({ ok: false, error: 'not found' }, 404);
};

// ── 驱动与断言 ────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function QARoot() {
  const ref = useRef(null);
  useEffect(() => {
    (async () => {
      const assertions = [];
      const check = (name, pass, detail) => assertions.push({ name, pass: Boolean(pass), detail });
      const $ = (sel) => ref.current.querySelector(sel);
      const $$ = (sel) => [...ref.current.querySelectorAll(sel)];

      await sleep(500); // 等 status 拉取与首渲染

      // 1. 平台列表
      const siteRows = $$('.sh-site');
      check('平台列表渲染 10 个站点', siteRows.length === 10, `actual=${siteRows.length}`);
      check('Google Flow 平台卡片在列', siteRows.some((r) => r.textContent.includes('Google Flow')));
      check('Pinterest 免登录徽章', siteRows.some((r) => r.textContent.includes('免登录')));
      check('环境就绪胶囊', $('.sh-env')?.classList.contains('ok'));

      // 2. whoami 徽章（tiktok 已连接）
      await sleep(500);
      const tiktokRow = siteRows.find((r) => r.textContent.includes('TikTok'));
      check('TikTok 徽章已连接', tiktokRow?.textContent.includes('已连接'), tiktokRow?.textContent);

      // 3. 命令工具集
      const cmdRows = $$('.sh-cmd');
      check('TikTok 工具集渲染', cmdRows.length === 6, `actual=${cmdRows.length}`);

      // 4. 点击 search 打开弹窗 + 表单规格渲染
      const searchRow = cmdRows.find((r) => r.querySelector('.sh-cmd-name')?.textContent === 'search');
      searchRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(400);
      const dialog = document.querySelector('[role="dialog"]');
      check('点击工具行弹窗打开', Boolean(dialog));
      const keywordInput = dialog?.querySelector('input');
      check('表单含关键词输入框', Boolean(keywordInput));
      check('弹窗标题含站点与命令', dialog?.textContent.includes('TikTok · search'), dialog?.textContent?.slice(0, 60));

      // 5. 必填校验：空关键词禁用执行
      const runBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '执行');
      check('空关键词时执行禁用', runBtn?.disabled === true);

      // 填关键词 → 执行 → 结果回显
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(keywordInput, 'portable blender');
      keywordInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(150);
      check('填写后执行解锁', runBtn.disabled === false);
      runBtn.click();
      await sleep(600);
      const resultRows = document.querySelectorAll('.sh-mr-row');
      check('弹窗内回显 2 条结果', resultRows.length === 2, `actual=${resultRows.length}`);
      check('结果含标题与指标', document.querySelector('.sh-mr-t')?.textContent.includes('viral blender'));

      // 6. 关闭弹窗 → explore 错误路径
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '取消')?.click();
      await sleep(400);
      const exploreRow = $$('.sh-cmd').find((r) => r.querySelector('.sh-cmd-name')?.textContent === 'explore');
      exploreRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await sleep(300);
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '执行')?.click();
      await sleep(500);
      const errBox = document.querySelector('.sh-merr');
      check('AUTH 错误码展示', errBox?.textContent.includes('HARVEST_AUTH'), errBox?.textContent);
      check('错误 hint 可执行', errBox?.textContent.includes('先在浏览器登录'));

      const failed = assertions.filter((a) => !a.pass);
      const pre = document.createElement('pre');
      pre.id = 'qa-report';
      pre.textContent = JSON.stringify({
        task: 'Issue #2426',
        total: assertions.length,
        failed: failed.length,
        assertions,
      });
      document.body.appendChild(pre);
    })();
  }, []);
  return (
    <div ref={ref} style={{ height: '100vh' }}>
      <HarvestStage t={t} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<QARoot />);
