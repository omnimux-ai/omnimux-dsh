import { executeBatchDeleteDrafts } from '../../plugins/omnimux-publish/src/client/feed-helpers.js'

const results = []
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: String(detail ?? '') })

async function run() {
  const originalFetch = globalThis.fetch
  try {
    // 1) stale id + valid draft: only the draft is deleted, count reflects it
    let calls = []
    globalThis.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body))
      return new Response(JSON.stringify({ id: 'draft_1', deleted: true }), { status: 200 })
    }
    let toast = ''
    await executeBatchDeleteDrafts([{ id: 'draft_1', status: 'draft' }], new Set(['ghost', 'draft_1']), (m) => { toast = m }, () => {})
    check('失效选中被跳过', calls.length === 1 && calls[0].draft_id === 'draft_1', JSON.stringify(calls))
    check('提示实际删除数量', toast === '已删除 1 条草稿', toast)

    // 2) no draft targets: explain instead of "deleted 0"
    calls = []
    toast = ''
    globalThis.fetch = async () => { calls.push(1); return new Response('{}', { status: 200 }) }
    await executeBatchDeleteDrafts([{ id: 'sub_2', status: 'submitted' }], new Set(['ghost', 'sub_2']), (m) => { toast = m }, () => {})
    check('无可删草稿时不发请求', calls.length === 0, `calls=${calls.length}`)
    check('无可删草稿时给出明确提示', toast === '所选记录中没有可删除的草稿，请重新选择', toast)

    // 3) delete failure surfaces reason
    calls = []
    toast = ''
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'record-not-draft' }), { status: 409 })
    await executeBatchDeleteDrafts([{ id: 'draft_9', status: 'draft' }], new Set(['draft_9']), (m) => { toast = m }, () => {})
    check('失败时提示原因', toast.includes('1 条失败') && toast.includes('record-not-draft'), toast)
  } finally {
    globalThis.fetch = originalFetch
  }
}

run().then(() => {
  const failed = results.filter((r) => !r.pass).length
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #4056', total: results.length, failed, assertions: results }, null, 2)
  document.body.appendChild(pre)
}).catch((error) => {
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #4056', error: String(error) })
  document.body.appendChild(pre)
})
