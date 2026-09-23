import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Explicitly invoke from ego-browser nodejs on the task-private, onboarded page.
 * Caller owns task.finish() and private environment cleanup in finally.
 * This subset does not claim attachment-return or provider-level zero requests.
 */
export async function runSkillPanelCreate({ page, origin, evidenceDir }) {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(new URL(await page.url()).origin, origin);
  const result = { phase: 'test', required: ['exact-search', 'close-cancels-install'], cases: [], missing: ['attachment-return', 'session-switch-cancellation', 'provider-zero-requests', 'double-click'], passed: false };
  const record = async (name, fn) => {
    try { await fn(); result.cases.push({ name, passed: true }); }
    catch (error) { result.cases.push({ name, passed: false, error: error.message }); }
  };
  try {
    await page.evaluate(() => { if (window.__qaFetch) window.fetch = window.__qaFetch; });
    await record('exact-search', async () => {
      await page.click('button[aria-label="Skill"]');
      await page.fill('input[placeholder="Search skills"]', 'animated-storymode');
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"][aria-label="Skill"] [role="option"]').length === 1, undefined, { timeout: 10000 });
      const text = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Skill"] [role="option"]')?.textContent);
      assert.match(text, /Animated Storymode/);
      await page.screenshot({ path: join(evidenceDir, 'formal-search.png') });
      await page.keyboard.press('Escape');
    });
    await record('close-cancels-install', async () => {
      await page.keyboard.press('Escape');
      const before = await page.evaluate(() => ({ sid: localStorage.getItem('dsh.sessions.current'), draft: document.querySelector('[contenteditable="true"]')?.textContent }));
      await page.evaluate(() => {
        window.__coverageOriginalFetch = window.fetch;
        window.__coverageProbe = { installs: 0, completed: 0, creates: 0 };
        window.fetch = async (...args) => {
          const url = String(args[0]?.url || args[0]);
          let body; try { body = JSON.parse(args[1]?.body); } catch {}
          if (url.endsWith('/api/session/create')) window.__coverageProbe.creates++;
          if (url.endsWith('/omnimux-market') && body?.method === 'install') {
            window.__coverageProbe.installs++;
            await new Promise(resolve => { window.__coverageRelease = resolve; });
            try { return await window.__coverageOriginalFetch(...args); }
            finally { window.__coverageProbe.completed++; }
          }
          return window.__coverageOriginalFetch(...args);
        };
      });
      try {
        await page.click('button[aria-label="Skill"]');
        await page.click('text="+ Create"');
        await page.waitForFunction(() => window.__coverageProbe.installs === 1);
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__coverageRelease());
        await page.waitForFunction(() => window.__coverageProbe.completed === 1, undefined, { timeout: 15000 });
        const after = await page.evaluate(() => ({ sid: localStorage.getItem('dsh.sessions.current'), draft: document.querySelector('[contenteditable="true"]')?.textContent, probe: window.__coverageProbe }));
        assert.equal(after.sid, before.sid);
        assert.equal(after.draft, before.draft);
        assert.equal(after.probe.creates, 0);
        await page.screenshot({ path: join(evidenceDir, 'formal-close-cancel.png') });
      } finally {
        await page.evaluate(() => { window.__coverageRelease?.(); if (window.__coverageOriginalFetch) window.fetch = window.__coverageOriginalFetch; });
      }
    });
  } finally {
    result.completed = result.cases.map(item => item.name);
    result.executedPassed = result.cases.length === result.required.length && result.cases.every(item => item.passed);
    result.passed = result.executedPassed && result.missing.length === 0;
    await writeFile(join(evidenceDir, 'formal-e2e-result.json'), JSON.stringify(result, null, 2));
  }
  return result;
}
