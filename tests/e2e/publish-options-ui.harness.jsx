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
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitFor(fn, timeoutMs = 4000) {
  const started = Date.now()
  for (;;) {
    const value = fn()
    if (value) return value
    if (Date.now() - started > timeoutMs) return value
    await tick(60)
  }
}
const results = []
function check(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: String(detail ?? '') })
}
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
const triggerOf = (container) => container.querySelector('.omnimux-publish-settings button[aria-haspopup="listbox"]')
async function openMenu(trigger) {
  trigger.click()
  await tick(150)
  return [...document.querySelectorAll('[role="menuitem"], [role="option"]')]
}

async function run() {
  const onlySelf = { privacy_level_options: ['SELF_ONLY'], comment_disabled: false, duet_disabled: false, stitch_disabled: false }
  const publicOk = { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], comment_disabled: true, duet_disabled: false, stitch_disabled: false }

  const unaudited = mountDraft({ record: baseRecord, media }, onlySelf)
  const trigger1 = await waitFor(() => triggerOf(unaudited.container))
  await tick(150)
  check('隐私级别使用下拉触发器', Boolean(trigger1) && trigger1.tagName === 'BUTTON', trigger1 ? trigger1.tagName : 'missing')
  check('未审计显示仅自己可见', Boolean(trigger1) && trigger1.textContent.includes(t('form.options.privacy.SELF_ONLY')), trigger1 ? trigger1.textContent.trim() : 'missing')
  const menu1 = await openMenu(trigger1)
  check('下拉展开后只有一项可用', menu1.length === 1, `items=${menu1.length}`)
  trigger1.click()
  await tick(100)
  unaudited.root.unmount()

  const audited = mountDraft({ record: baseRecord, media }, publicOk)
  const trigger2 = await waitFor(() => triggerOf(audited.container))
  await tick(150)
  const menu2 = await openMenu(trigger2)
  check('已审计下拉有多个选项', menu2.length === 2, `items=${menu2.length}`)
  const publicItem = menu2.find((item) => item.textContent.includes(t('form.options.privacy.PUBLIC_TO_EVERYONE')))
  check('下拉包含公开选项', Boolean(publicItem), publicItem ? publicItem.textContent.trim() : 'missing')
  if (publicItem) publicItem.click()
  await tick(150)
  check('选中后触发器回显公开', trigger2.textContent.includes(t('form.options.privacy.PUBLIC_TO_EVERYONE')), trigger2.textContent.trim())

  const saveButton = [...audited.container.querySelectorAll('button')].find((button) => button.textContent.trim() === t('form.saveDraft'))
  if (saveButton) saveButton.click()
  await waitFor(() => qa.drafts.length > 0)
  const saved = qa.drafts[qa.drafts.length - 1]
  check('草稿隐私级别为公开', Boolean(saved && saved.settings && saved.settings.tiktok_options.privacy_level === 'PUBLIC_TO_EVERYONE'), saved?.settings?.tiktok_options?.privacy_level || 'none')

  const chipButtons = [...audited.container.querySelectorAll('.omnimux-publish-setting-chips button')]
  check('互动项改为胶囊按钮', chipButtons.filter((button) => button.hasAttribute('aria-pressed')).length >= 3, `chips=${chipButtons.length}`)
  const commentChip = chipButtons.find((button) => button.textContent.trim() === t('form.options.comment'))
  check('账号侧禁用的互动项置灰', Boolean(commentChip && commentChip.disabled === true), commentChip ? `disabled=${commentChip.disabled}` : 'missing')
  check('禁用项有说明文案', audited.container.textContent.includes(t('form.options.comment.disabled')), 'checked')

  const commercialChip = chipButtons.find((button) => button.textContent.trim() === t('form.options.commercial.off'))
  check('商业内容胶囊存在', Boolean(commercialChip), commercialChip ? 'ok' : 'missing')
  if (commercialChip) {
    commercialChip.click()
    await tick(150)
  }
  const subChips = [...audited.container.querySelectorAll('.omnimux-publish-setting-sub button')]
  check('商业内容展开品牌与音乐选项', subChips.length === 3, `sub=${subChips.length}`)
  check('缺品牌时给出合并提示', /商业内容需要选择/.test(audited.container.textContent), 'checked')

  await tick(400)
}

run().then(() => {
  const failed = results.filter((item) => !item.pass).length
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #3973', total: results.length, failed, assertions: results })
  document.body.appendChild(pre)
}).catch((error) => {
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #3973', total: results.length, failed: results.length + 1, assertions: results, harnessError: error && error.message ? error.message : String(error) })
  document.body.appendChild(pre)
})
