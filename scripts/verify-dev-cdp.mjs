#!/usr/bin/env node
/**
 * verify-dev-cdp — Drive the real Dev App Electron renderer over CDP and
 * assert computed styles, so agents can accept UI in the actual desktop
 * window instead of only the web-side host port.
 *
 * Prereq:
 *   - Dev App must be running with `--remote-debugging-port=9229`
 *     (desktop-fork #33: Dev-only CDP port, default 9229, overridable via
 *     OMNIMUX_DEV_CDP_PORT).
 *
 * How to run:
 *   node scripts/verify-dev-cdp.mjs                             # default asserts
 *   OMNIMUX_CDP_PORT=9229 node scripts/verify-dev-cdp.mjs       # custom port
 *   OMNIMUX_CDP_SELECTOR=.wf-panel-shell__card node scripts/verify-dev-cdp.mjs
 *
 * Output: prints PASS/FAIL and writes docs/evidence/live-cdp-qa-report.json.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const CDP_PORT = process.env.OMNIMUX_CDP_PORT || process.env.OMNIMUX_DEV_CDP_PORT || '9229';
const TARGET_PORT = process.env.OMNIMUX_PORT || '45120';
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

// Selector + the computed props to assert. Extend via env for ad-hoc probes.
const TARGET_SELECTOR = process.env.OMNIMUX_CDP_SELECTOR || '.wf-panel-shell__card';
const ASSERT_PADDING_TOP = process.env.OMNIMUX_CDP_PADDING_TOP || '12px';

const evidenceDir = join(REPO_ROOT, 'docs', 'evidence');
const evidenceFile = join(evidenceDir, 'live-cdp-qa-report.json');

/**
 * Minimal CDP client over the global Node WebSocket (Node >= 22).
 */
async function cdpEvaluate(expression, returnByValue = true) {
  const targets = await (await fetch(`${CDP_BASE}/json/list`)).json();
  // Prefer the page target that talks to our host port; fall back to any page.
  const page =
    targets.find((t) => t.type === 'page' && t.url.includes(`:${TARGET_PORT}`)) ||
    targets.find((t) => t.type === 'page');
  if (!page) throw new Error('No CDP page target found (is the Dev App window open?)');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result || m);
      pending.delete(m.id);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', (e) => reject(new Error(e.message || 'CDP ws error')));
  });
  await send('Runtime.enable');
  const result = await send('Runtime.evaluate', { expression, returnByValue });
  ws.close();
  return result?.result?.value ?? null;
}

async function main() {
  const stage = process.argv[2] || 'all';
  console.log(`[CDP QA] Connecting Dev App renderer via ${CDP_BASE} (host port ${TARGET_PORT}, stage: ${stage})`);

  // 1) Probe the panel; if absent, drive the minimal canvas path (创作 → 画布 → 选中节点).
  let state = await cdpEvaluate(`(() => {
    const el = document.querySelector('${TARGET_SELECTOR}');
    if (el) return { present: true };
    return { present: false };
  })()`);

  if (!state?.present) {
    await cdpEvaluate(`(() => { const b=document.querySelector('button[aria-label="创作"]'); if(b) b.click(); return true; })()`);
    await new Promise((r) => setTimeout(r, 900));
    await cdpEvaluate(`(() => { const t=[...document.querySelectorAll('[class*="tab"]')].find(x=>/画布工作区/.test(x.innerText||'')); if(t) t.click(); return true; })()`);
    await new Promise((r) => setTimeout(r, 900));
    await cdpEvaluate(`(() => { const n=[...document.querySelectorAll('.react-flow__node-material')].find(x=>/视频|图片|文本/.test(x.innerText||'') && !/失败|offline/.test(x.innerText||''))||document.querySelector('.react-flow__node-material'); if(n){n.click(); return true;} return false; })()`);
    await new Promise((r) => setTimeout(r, 900));
  }

  // Probe video node mode selection if present
  let videoModeReport = null;
  try {
    const videoCheck = await cdpEvaluate(`(() => {
      const videoNode = [...document.querySelectorAll('.react-flow__node-material')].find(n => n.innerText.includes('视频') || n.innerText.includes('Seedance'));
      if (!videoNode) return null;
      videoNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const tb = document.querySelector('.wf-video-trigger-bar');
      if (!tb) return { hasVideoNode: true, hasTriggerBar: false };
      tb.click();
      const popover = document.querySelector('.wf-video-param-popover');
      const modeSec = popover ? popover.querySelector('[data-testid="wf-operation-mode-section"]') : null;
      const modes = modeSec ? Array.from(modeSec.querySelectorAll('button')).map(b => b.innerText.trim()) : [];
      return {
        hasVideoNode: true,
        hasTriggerBar: true,
        showMode: tb.dataset.showMode === 'true',
        triggerBarText: tb.innerText.trim(),
        popoverOpen: Boolean(popover),
        hasModeSection: Boolean(modeSec),
        modes
      };
    })()`);
    videoModeReport = videoCheck;
  } catch (e) {
    // optional stage probe
  }

  const measure = await cdpEvaluate(`(() => {
    const el = document.querySelector('${TARGET_SELECTOR}');
    const cs = (e) => e ? getComputedStyle(e) : null;
    const matches = [];
    if (el) {
      for (const sheet of document.styleSheets) {
        let rules; try { rules = sheet.cssRules; } catch { continue; }
        for (const r of rules || []) {
          try {
            if (r.selectorText && el.matches(r.selectorText) && r.style && r.style.padding && r.style.paddingTop) {
              matches.push({ sel: r.selectorText, padding: r.style.padding, paddingTop: r.style.paddingTop, important: r.style.getPropertyPriority('padding-top') });
            }
          } catch { /* cross-origin */ }
        }
      }
    }
    return {
      url: location.href,
      present: !!el,
      padding: cs(el)?.padding,
      paddingTop: cs(el)?.paddingTop,
      matchingPaddingRules: matches,
      addTopRelCard: el ? (() => { const add=document.querySelector('.wf-config-panel__add-ref-btn'); return add?Math.round(add.getBoundingClientRect().top - el.getBoundingClientRect().top):null; })() : null,
    };
  })()`);

  let ok =
    measure?.present &&
    measure.paddingTop === ASSERT_PADDING_TOP &&
    !measure.matchingPaddingRules?.some((r) => r.important === 'important' && r.paddingTop !== ASSERT_PADDING_TOP);

  if (stage === 'video-mode' && videoModeReport?.hasVideoNode) {
    ok = Boolean(videoModeReport.hasModeSection && videoModeReport.modes.length >= 2);
  }

  const report = {
    timestamp: new Date().toISOString(),
    cdpPort: Number(CDP_PORT),
    targetPort: Number(TARGET_PORT),
    stage,
    url: measure?.url ?? null,
    selector: TARGET_SELECTOR,
    expected: { paddingTop: ASSERT_PADDING_TOP },
    measured: {
      present: measure?.present ?? false,
      padding: measure?.padding ?? null,
      paddingTop: measure?.paddingTop ?? null,
      matchingPaddingRules: measure?.matchingPaddingRules ?? [],
      addTopRelCard: measure?.addTopRelCard ?? null,
    },
    videoMode: videoModeReport,
    result: ok ? 'PASS' : 'FAIL',
  };

  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(evidenceFile, JSON.stringify(report, null, 2));
  console.log(`[CDP QA] ${report.result}`);
  console.log(`[CDP QA] selector=${TARGET_SELECTOR} paddingTop=${report.measured.paddingTop} (expected ${ASSERT_PADDING_TOP})`);
  console.log(`[CDP QA] evidence: ${evidenceFile}`);

  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(`[CDP QA] BLOCKED: ${err.message}`);
  console.error('[CDP QA] Ensure Dev App is running with --remote-debugging-port and the desktop-fork #33 CDP feature.');
  process.exit(2);
});
