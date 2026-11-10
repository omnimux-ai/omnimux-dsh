import { createRoot } from 'react-dom/client'
import { PublishBatchBar, shouldShowBatchBar } from '../../plugins/omnimux-publish/src/client/views/PublishViewport.jsx'
import { injectPublishStyles } from '../../plugins/omnimux-publish/src/client/styles.js'
import { zh } from '../../plugins/omnimux-publish/src/client/locales.js'

injectPublishStyles()
function t(key, vars) {
  const template = typeof zh[key] === 'string' ? zh[key] : key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all))
}
const results = []
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: String(detail ?? '') })

async function run() {
  check('未选中时批量栏隐藏', shouldShowBatchBar(false, 0) === false, 'false')
  check('选中一项即显示批量栏', shouldShowBatchBar(false, 1) === true, 'true')

  const stage = document.getElementById('stage')
  const container = document.createElement('div')
  container.className = 'qa-mount'
  stage.appendChild(container)
  const props = {
    t,
    selectedCount: 2,
    totalFiltered: 6,
    isBatchMode: false,
    onToggleAll: () => {},
    onBatchRetry: () => {},
    onBatchDeleteDrafts: () => {},
    onExitBatch: () => {},
  }
  createRoot(container).render(<PublishBatchBar {...props} />)
  await new Promise((resolve) => setTimeout(resolve, 300))
  const text = container.textContent
  check('批量栏显示已选数量', text.includes('已选 2 项'), text.slice(0, 40))
  check('批量栏有批量重试', text.includes('批量重试失败'), 'retry')
  check('批量栏有批量删除草稿', text.includes('批量删除草稿'), 'delete')
  check('批量栏有取消选择', text.includes('取消选择'), 'clear')
}

run().then(() => {
  const failed = results.filter((item) => !item.pass).length
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #4051', total: results.length, failed, assertions: results })
  document.body.appendChild(pre)
}).catch((error) => {
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #4051', total: results.length, failed: results.length + 1, assertions: results, harnessError: error && error.message ? error.message : String(error) })
  document.body.appendChild(pre)
})
