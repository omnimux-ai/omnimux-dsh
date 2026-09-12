/**
 * verify-picker-dialog — 资产库 / 产品库选择器弹窗的运行时漂移告警。
 *
 * 为什么需要它：弹窗宽度与高度放开依赖两处外部契约
 *   1) 底座 ./pickerDialogContract.js 推导出的宽度（由几何契约计算，非魔法数字）；
 *   2) primitive（@deepseek-ai/dsh-client-ui-primitives）的 `.dshUk-Dialog-body`
 *      自带 `max-height: min(56vh, 480px)`，我们放开它为 `none`。
 * 任何一处漂移（类名改名、上限变化、宽度不再匹配契约）都只会静默退回「480px 窄盒 / 双层滚动条」，
 * 因此用真机断言把漂移变成红灯。
 *
 * 用法：
 *   node scripts/verify-picker-dialog.mjs              # 默认断言
 *   OMNIMUX_CDP_PORT=9229 node scripts/verify-picker-dialog.mjs
 *   OMNIMUX_PICKER=assets node scripts/verify-picker-dialog.mjs   # 改测资产库选择器
 *
 * 前置：Dev App 已启动且渲染进程开放 CDP（默认 http://127.0.0.1:9229）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const evidenceDir = join(here, '..', 'docs', 'evidence')
const evidenceFile = join(evidenceDir, 'picker-dialog-qa-report.json')

const CDP_PORT = Number(process.env.OMNIMUX_CDP_PORT || 9229)
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`
const PICKER = process.env.OMNIMUX_PICKER === 'assets' ? 'assets' : 'product'

/** 契约推导宽度：148 + 16 + 2×264 + 16 + 48 */
const EXPECTED_WIDTH = 756
/** 视口足够高时选择器的完整高度 */
const FULL_HEIGHT = 480

const SELECTORS = PICKER === 'assets'
  ? { root: '.omx-asset-pick', chip: /资产|素材|模型|角色|场景|道具|风格/, slot: '[assets://参考]' }
  : { root: '.omx-product-pick', chip: /商品|产品|品类/, slot: '[product://对标商品]' }

async function cdpSession() {
  const targets = await (await fetch(`${CDP_BASE}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('No CDP page target found (is the Dev App window open?)')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let id = 0
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result || msg)
      pending.delete(msg.id)
    }
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('CDP websocket error')))
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      pending.set(++id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true })
    return result?.result?.value ?? null
  }
  return { send, evaluate, close: () => ws.close() }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 打开选择器弹窗：写入槽位语法后点击胶囊 */
async function openPicker({ send, evaluate }) {
  await send('Page.enable')
  await send('Page.reload')
  await sleep(2500)

  await evaluate(`(() => {
    const editor = document.querySelector('[data-composer-input="true"]') || document.querySelector('[contenteditable="true"]');
    if (!editor) return false;
    editor.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, '验证槽位 ${SELECTORS.slot}');
    return true;
  })()`)
  await sleep(700)

  const clicked = await evaluate(`(() => {
    const chips = [...document.querySelectorAll('.omx-prompt-slot-chip')];
    const chip = chips.find((c) => ${SELECTORS.chip}.test(c.textContent || '')) || chips[0];
    if (!chip) return false;
    chip.click();
    return true;
  })()`)
  await sleep(900)
  return Boolean(clicked)
}

function measureExpression() {
  return `(() => {
    const root = document.querySelector('${SELECTORS.root}');
    const dialog = document.querySelector('.dshUk-Dialog-dialog');
    const body = document.querySelector('.dshUk-Dialog-body');
    if (!root || !dialog || !body) {
      return { present: false, root: Boolean(root), dialog: Boolean(dialog), body: Boolean(body) };
    }
    const grid = document.querySelector('${SELECTORS.root}__grid');
    const columns = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : null;
    const footerButton = [...document.querySelectorAll('button')]
      .find((b) => /取消|确认/.test(b.textContent || ''));
    const dialogRect = dialog.getBoundingClientRect();
    const footerRect = footerButton ? footerButton.getBoundingClientRect() : null;
    return {
      present: true,
      rootHeight: Math.round(root.getBoundingClientRect().height),
      dialogWidth: Math.round(dialogRect.width),
      bodyMaxHeight: getComputedStyle(body).maxHeight,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      outerOverflow: Math.round(body.scrollHeight - body.clientHeight),
      gridColumns: columns,
      dialogInViewport: dialogRect.top >= 0 && dialogRect.bottom <= innerHeight,
      footerVisible: footerRect ? footerRect.bottom <= innerHeight && footerRect.top >= 0 : null,
      viewportHeight: innerHeight,
    };
  })()`
}

async function main() {
  const session = await cdpSession()
  const failures = []
  const checks = []
  const record = (name, ok, detail) => {
    checks.push({ name, ok, detail })
    if (!ok) failures.push(`${name}: ${detail}`)
    console.log(`[picker QA] ${ok ? 'PASS' : 'FAIL'} ${name} — ${detail}`)
  }

  try {
    const opened = await openPicker(session)
    record('picker opens from the slot capsule', opened, `selector=${SELECTORS.root}`)
    if (!opened) throw new Error('picker did not open; cannot measure')

    for (const viewportHeight of [900, 700]) {
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: viewportHeight,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await sleep(400)
      const m = await session.evaluate(measureExpression())
      if (!m?.present) {
        record(`viewport ${viewportHeight}: picker present`, false, JSON.stringify(m))
        continue
      }

      record(
        `viewport ${viewportHeight}: width follows the geometry contract`,
        Math.abs(m.dialogWidth - EXPECTED_WIDTH) <= 2,
        `width=${m.dialogWidth} (expected ${EXPECTED_WIDTH})`,
      )
      record(
        `viewport ${viewportHeight}: primitive body cap is lifted`,
        m.bodyMaxHeight === 'none',
        `maxHeight=${m.bodyMaxHeight}`,
      )
      record(
        `viewport ${viewportHeight}: no outer scroll region`,
        m.outerOverflow === 0,
        `overflow=${m.outerOverflow}px (client ${m.bodyClientHeight} / scroll ${m.bodyScrollHeight})`,
      )
      record(
        `viewport ${viewportHeight}: two-column grid`,
        m.gridColumns === 2,
        `columns=${m.gridColumns}`,
      )
      record(
        `viewport ${viewportHeight}: dialog and footer visible`,
        Boolean(m.dialogInViewport) && Boolean(m.footerVisible),
        `inViewport=${m.dialogInViewport} footerVisible=${m.footerVisible}`,
      )
      if (viewportHeight === 900) {
        record(
          'viewport 900: full 480px content height kept',
          m.rootHeight === FULL_HEIGHT,
          `height=${m.rootHeight} (expected ${FULL_HEIGHT})`,
        )
      }
    }

    await session.send('Emulation.clearDeviceMetricsOverride')
  } finally {
    session.close()
  }

  const report = {
    picker: PICKER,
    expectedWidth: EXPECTED_WIDTH,
    cdpPort: CDP_PORT,
    passed: failures.length === 0,
    checks,
    failures,
    checkedAt: new Date().toISOString(),
  }
  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(evidenceFile, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`[picker QA] ${report.passed ? 'PASS' : 'FAIL'}`)
  console.log(`[picker QA] evidence: ${evidenceFile}`)
  return report
}

try {
  const report = await main()
  // 显式退出：避免 WebSocket 句柄与顶层 await 让进程以 13 号退出码收场
  process.exit(report.passed ? 0 : 1)
} catch (error) {
  console.error(`[picker QA] FAIL ${error?.message || error}`)
  process.exit(2)
}
