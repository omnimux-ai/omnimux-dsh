import { createRoot } from 'react-dom/client'
import { PublishBatchBar, countSelectedByKind } from '../../plugins/omnimux-publish/src/client/views/PublishViewport.jsx'
import { injectPublishStyles } from '../../plugins/omnimux-publish/src/client/styles.js'
import { zh } from '../../plugins/omnimux-publish/src/client/locales.js'

injectPublishStyles()
const t = (key, vars) => {
  const template = typeof zh[key] === 'string' ? zh[key] : key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all))
}
async function main() {
  const results = []
  const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: String(detail ?? '') })
  const records = [
    { id: 'd1', status: 'draft', subtasks: [] },
    { id: 's1', status: 'submitted', subtasks: [{ status: 'failed' }] },
    { id: 's2', status: 'submitted', subtasks: [{ status: 'published' }] },
  ]
  const counts = countSelectedByKind(records, new Set(['d1', 's1', 's2']))
  check('统计草稿与失败记录', counts.draftCount === 1 && counts.failedCount === 1, JSON.stringify(counts))

  const stage = document.getElementById('stage')
  function mountBar(props) {
    const el = document.createElement('div')
    el.className = 'qa-mount'
    stage.appendChild(el)
    createRoot(el).render(<PublishBatchBar t={t} totalFiltered={3} isBatchMode={false} onToggleAll={() => {}} onBatchRetry={() => {}} onBatchDeleteDrafts={() => {}} onExitBatch={() => {}} {...props} />)
    return el
  }
  const draftBar = mountBar({ selectedCount: 1, draftCount: 1, failedCount: 0 })
  await new Promise((r) => setTimeout(r, 200))
  check('草稿选择显示删除草稿', draftBar.textContent.includes('批量删除草稿') && !draftBar.textContent.includes('批量重试失败'), draftBar.textContent)
  const failedBar = mountBar({ selectedCount: 1, draftCount: 0, failedCount: 1 })
  await new Promise((r) => setTimeout(r, 200))
  check('失败选择显示批量重试', failedBar.textContent.includes('批量重试失败') && !failedBar.textContent.includes('批量删除草稿'), failedBar.textContent)
  const noneBar = mountBar({ selectedCount: 1, draftCount: 0, failedCount: 0 })
  await new Promise((r) => setTimeout(r, 200))
  check('无可操作时给说明', noneBar.textContent.includes('所选记录暂无可批量操作'), noneBar.textContent)

  const toast = document.createElement('div')
  toast.className = 'omnimux-publish-toast'
  toast.textContent = '已删除 2 条草稿'
  document.body.appendChild(toast)
  await new Promise((r) => setTimeout(r, 300))

  const failed = results.filter((r) => !r.pass).length
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #4058', total: results.length, failed, assertions: results })
  document.body.appendChild(pre)

}
main().catch((error) => {
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #4058', error: String(error) })
  document.body.appendChild(pre)
})
