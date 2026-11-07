import { createRoot } from 'react-dom/client'
import { Composer } from '../../plugins/omnimux-publish/src/client/Composer/index.jsx'
import { injectPublishStyles } from '../../plugins/omnimux-publish/src/client/styles.js'
import { zh } from '../../plugins/omnimux-publish/src/client/locales.js'

injectPublishStyles()
const qa = (window.__qa = window.__qa || { uploads: [], accounts: [], drafts: [] })
function t(key, vars) {
  const template = typeof zh[key] === 'string' ? zh[key] : key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all))
}
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, timeoutMs = 4000) {
  const started = Date.now()
  for (;;) {
    const value = fn()
    if (value) return value
    if (Date.now() - started > timeoutMs) return value
    await tick(40)
  }
}
const results = []
function check(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: String(detail ?? '') })
}
const accounts = [
  { id: 'acc-1', platform: 'tiktok', username: 'qa', display_name: 'QA Account', status: 'active', provider: 'tiktok_direct', agent_usable: true },
]
function mountDraft(draft, creator) {
  qa.creatorInfo = creator
  qa.draft = draft
  const container = document.createElement('div')
  container.className = 'qa-mount'
  document.getElementById('stage').appendChild(container)
  const root = createRoot(container)
  root.render(<Composer t={t} draftId={draft.record.id} onBack={() => {}} onSubmitted={() => {}} onSaved={() => {}} />)
  return { container, root }
}
const baseRecord = { id: 'draft-1', type: 'image', title: '标题', description: '', topics: [], account_ids: ['acc-1'] }
const media = [{ id: 'm1', kind: 'image', filename: 'a.jpg', content_type: 'image/jpeg' }]

async function run() {
  const onlySelf = { privacy_level_options: ['SELF_ONLY'], comment_disabled: false, duet_disabled: false, stitch_disabled: false }
  const publicOk = { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], comment_disabled: true, duet_disabled: false, stitch_disabled: false }

  const unaudited = mountDraft({ record: baseRecord, media }, onlySelf)
  const select1 = await waitFor(() => unaudited.container.querySelector('.omnimux-publish-select'))
  await tick(200)
  check('未审计只显示一个隐私级别', select1 && select1.options.length === 1, select1 ? `${select1.options.length}` : 'missing')
  check('未审计默认 SELF_ONLY', select1 && select1.value === 'SELF_ONLY', select1 ? select1.value : 'missing')
  unaudited.root.unmount()

  const audited = mountDraft({ record: baseRecord, media }, publicOk)
  const select2 = await waitFor(() => audited.container.querySelector('.omnimux-publish-select'))
  await tick(200)
  check('已审计显示多个隐私级别', select2 && select2.options.length === 2, select2 ? `${select2.options.length}` : 'missing')
  if (select2) {
    select2.value = 'PUBLIC_TO_EVERYONE'
    select2.dispatchEvent(new Event('change', { bubbles: true }))
  }
  await tick(120)
  const saveButton = [...audited.container.querySelectorAll('button')].find((button) => button.textContent.trim() === t('form.saveDraft'))
  check('保存草稿按钮存在', Boolean(saveButton), saveButton ? 'ok' : 'missing')
  if (saveButton) saveButton.click()
  await waitFor(() => qa.drafts.length > 0)
  const saved = qa.drafts[qa.drafts.length - 1]
  check('草稿携带 tiktok_options', Boolean(saved && saved.settings && saved.settings.tiktok_options), JSON.stringify(saved && saved.settings))
  check('草稿隐私级别为公开', Boolean(saved && saved.settings && saved.settings.tiktok_options.privacy_level === 'PUBLIC_TO_EVERYONE'), saved?.settings?.tiktok_options?.privacy_level || 'none')

  const toggles = [...audited.container.querySelectorAll('.omnimux-publish-option-check input[type=checkbox]')]
  const commentToggle = toggles[0]
  check('账号侧禁用的互动开关被禁用', Boolean(commentToggle && commentToggle.disabled === true), commentToggle ? `disabled=${commentToggle.disabled}` : 'missing')

  const commercialToggle = toggles[3]
  if (commercialToggle) {
    commercialToggle.click()
    await tick(120)
  }
  const radios = [...audited.container.querySelectorAll('input[type=radio]')]
  check('勾选商业内容后出现品牌选项', radios.length === 2, `radios=${radios.length}`)
  check('缺品牌时提示选择商业类型', /商业内容需要选择/.test(audited.container.textContent), 'checked')

  await tick(300)
}

run().then(() => {
  const failed = results.filter((item) => !item.pass).length
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #3969', total: results.length, failed, assertions: results })
  document.body.appendChild(pre)
}).catch((error) => {
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #3969', total: results.length, failed: results.length + 1, assertions: results, harnessError: error && error.message ? error.message : String(error) })
  document.body.appendChild(pre)
})
