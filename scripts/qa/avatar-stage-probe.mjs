/**
 * @file scripts/qa/avatar-stage-probe.mjs
 * @description 数字人一级页的真实浏览器 DOM/资源探针：只报告事实，不做产品判定。
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function avatarStageProbe({ send, evidenceDir, io }) {
  const assertions = []
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate-failed')
    }
    return result.result?.value
  }

  await sleep(4000)

  const facts = await evaluate(`(async () => {
    const res = performance.getEntriesByType('resource').map((r) => r.name)
    const avatarRes = res.filter((n) => /avatar/i.test(n))
    const pluginRes = res.filter((n) => /plugin/i.test(n)).slice(0, 40)
    let manifest = null
    for (const url of ['/omnimux/plugins', '/plugins.json', '/omnimux/plugin-manifest', '/omnimux/registry']) {
      try {
        const r = await fetch(url, { credentials: 'same-origin' })
        if (!r.ok) continue
        const t = await r.text()
        manifest = { url, status: r.status, head: t.slice(0, 1200) }
        break
      } catch (e) { /* keep trying */ }
    }
    const scripts = [...document.querySelectorAll('script[src], link[href]')]
      .map((el) => el.getAttribute('src') || el.getAttribute('href'))
      .filter((u) => u && /avatar|plugin|omnimux/i.test(u))
      .slice(0, 40)
    const loaderKeys = window.__ModuleLoader__ ? Object.keys(window.__ModuleLoader__) : []
    return {
      avatarRes,
      pluginRes,
      scripts,
      loaderKeys,
      manifest,
      hasSidebarGlobal: Boolean(window.__omnimuxSidebar),
      sidebarGlobalKeys: window.__omnimuxSidebar ? Object.keys(window.__omnimuxSidebar) : [],
      resourceTotal: res.length,
    }
  })()`)

  io.writeFileSync(`${evidenceDir}/probe-facts.json`, JSON.stringify(facts, null, 2))
  assertions.push({ name: 'probe-collected', pass: true, detail: JSON.stringify(facts).slice(0, 4000) })
  return { assertions }
}
