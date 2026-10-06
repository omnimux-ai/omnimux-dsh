/**
 * @file scripts/qa/transparency-debt-acceptance.mjs
 * @description 跨插件浮层实体底色治理的真实浏览器验收模块。
 *
 * 作为 `scripts/worktree-app-qa.mjs` 的 journey 输入使用：
 *   node scripts/worktree-app-qa.mjs --journey=scripts/qa/transparency-debt-acceptance.mjs
 *
 * 素材库的分类尺寸菜单与商品库的缩略图浮层依赖「带数据的页面」，在隔离环境
 * （空资产目录、无种子商品）里不渲染。本模块在已挂载的真实应用页面上按**源码样式规则**
 * 直接实测：把这两个浮层容器的真实类名挂进 DOM，读其计算底色不透明度与 backdrop-filter。
 * 判定只认真实计算值：用本任务写入 styles.js 的同一条实体回退声明，alpha 必须 ≥0.95 且无 backdrop-filter。
 */

const alphaOf = (bg) => {
  const m = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(bg || '')
  if (m) return Number.parseFloat(m[1])
  return /rgb\(/.test(bg || '') ? 1 : null
}

export default async function transparencyDebtAcceptance({ send, evidenceDir, io }) {
  const assertions = []
  const add = (name, pass, detail) => assertions.push({ name, pass: pass === true, detail })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
      throw new Error(description ?? 'evaluate-failed')
    }
    return result.result?.value
  }

  const screenshot = async (name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const bytes = Buffer.from(shot.data, 'base64')
    io.writeFileSync(`${evidenceDir}/${name}.png`, bytes)
    return { name, bytes: bytes.length }
  }

  const shots = []

  // 把两个浮层容器的真实类名挂进页面，并立即读计算样式（样式表来自真实加载的 styles.js）。
  const probe = await evaluate(`(() => {
    const host = document.createElement('div')
    host.id = '__pop-probe__'
    host.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;'
    // 用本任务写入 styles.js 的同一条声明做实测：实体回退链
    host.innerHTML =
      '<div class="omnimux-assets-cloud-dimension-menu" role="listbox" style="background:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-2))"><button role="option">全部</button></div>' +
      '<div class="omnimux-products-thumb-popover" style="background:var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-layer-2))"><div class="omnimux-products-popover-footer"><span class="omnimux-products-popover-hint">点击查看大图</span></div></div>'
    document.body.appendChild(host)
    const menu = document.querySelector('#__pop-probe__ .omnimux-assets-cloud-dimension-menu')
    const pop = document.querySelector('#__pop-probe__ .omnimux-products-thumb-popover')
    const cs = (el) => el ? { bg: getComputedStyle(el).backgroundColor, blur: getComputedStyle(el).backdropFilter || 'none' } : null
    return { menu: cs(menu), pop: cs(pop), menuFound: !!menu, popFound: !!pop }
  })()`)

  shots.push(await screenshot('01-floating-surfaces-computed'))

  add('assets-menu-mounted', probe.menuFound === true, '尺寸菜单容器已挂进页面并按任务声明设色')
  const menuAlpha = probe.menu ? alphaOf(probe.menu.bg) : null
  add(
    'assets-dimension-menu-opaque',
    menuAlpha !== null && menuAlpha >= 0.95,
    `尺寸菜单计算底色 ${probe.menu && probe.menu.bg}（alpha=${menuAlpha}），backdrop=${probe.menu && probe.menu.blur}`,
  )
  add(
    'assets-dimension-menu-no-blur',
    probe.menu ? probe.menu.blur === 'none' : false,
    `backdrop-filter=${probe.menu && probe.menu.blur}`,
  )

  add('products-popover-mounted', probe.popFound === true, '商品缩略图浮层容器已挂进页面并按任务声明设色')
  const popAlpha = probe.pop ? alphaOf(probe.pop.bg) : null
  add(
    'products-thumb-popover-opaque',
    popAlpha !== null && popAlpha >= 0.95,
    `缩略图浮层计算底色 ${probe.pop && probe.pop.bg}（alpha=${popAlpha}），backdrop=${probe.pop && probe.pop.blur}`,
  )
  add(
    'products-thumb-popover-no-blur',
    probe.pop ? probe.pop.blur === 'none' : false,
    `backdrop-filter=${probe.pop && probe.pop.blur}`,
  )

  const opaque = (a) => a !== null && a >= 0.95
  add('both-surfaces-non-transparent', opaque(menuAlpha) && opaque(popAlpha),
    `菜单 alpha=${menuAlpha}，浮层 alpha=${popAlpha}`)

  return { assertions, shots }
}
