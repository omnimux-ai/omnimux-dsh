import { createRoot } from 'react-dom/client'
import { Composer } from '../../plugins/omnimux-publish/src/client/Composer/index.jsx'
import { injectPublishStyles } from '../../plugins/omnimux-publish/src/client/styles.js'
import { zh } from '../../plugins/omnimux-publish/src/client/locales.js'

injectPublishStyles()
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
const check = (name, pass, detail) => results.push({ name, pass: Boolean(pass), detail: String(detail ?? '') })

const container = document.createElement('div')
container.className = 'qa-mount'
document.getElementById('stage').appendChild(container)
const root = createRoot(container)
root.render(<Composer t={t} onBack={() => {}} onSubmitted={() => {}} onSaved={() => {}} />)

async function run() {
  await waitFor(() => container.querySelector('.omnimux-publish-type-page'))
  const imageCard = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('图文'))
  imageCard.click()
  await waitFor(() => container.querySelector('.omnimux-publish-editor-pane'))
  await tick(300)

  check('创建页有编辑区', Boolean(container.querySelector('.omnimux-publish-editor-pane')), 'editor')
  check('创建页有预览区', Boolean(container.querySelector('.omnimux-publish-preview')), 'preview')
  check('底部有操作栏', Boolean(container.querySelector('.omnimux-publish-actionbar')), 'actionbar')

  const accountBox = await waitFor(() => container.querySelector('.omnimux-publish-accounts-row input[type=checkbox]'))
  if (accountBox && !accountBox.checked) accountBox.click()
  await tick(300)
  const titleInput = container.querySelector('.omnimux-publish-editor-pane input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(titleInput, 'Postiz 风格预览测试')
  titleInput.dispatchEvent(new Event('input', { bubbles: true }))
  const area = container.querySelector('.omnimux-publish-editor-pane textarea')
  const areaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  areaSetter.call(area, '这是正文内容，应该同步出现在右侧预览卡片。')
  area.dispatchEvent(new Event('input', { bubbles: true }))
  await tick(300)

  check('预览同步标题', container.querySelector('.omnimux-publish-preview').textContent.includes('Postiz 风格预览测试'), 'title')
  check('预览同步正文', container.querySelector('.omnimux-publish-preview').textContent.includes('这是正文内容'), 'body')
  check('预览显示账号名', container.querySelector('.omnimux-publish-preview').textContent.includes('OmniMux Creator'), 'account')

  const head = container.querySelector('.omnimux-publish-settings-head')
  check('设置区默认展开', Boolean(container.querySelector('.omnimux-publish-settings-body')), 'open')
  head.click()
  await tick(200)
  check('点击设置头可收起', !container.querySelector('.omnimux-publish-settings-body'), 'closed')
  head.click()
  await tick(200)
  check('再次点击可展开', Boolean(container.querySelector('.omnimux-publish-settings-body')), 'reopen')

  const actionbar = container.querySelector('.omnimux-publish-actionbar')
  check('操作栏有保存草稿', [...actionbar.querySelectorAll('button')].some((b) => b.textContent.trim() === t('form.saveDraft')), 'save')
  check('操作栏有确认发布', [...actionbar.querySelectorAll('button')].some((b) => b.textContent.trim() === t('form.submit')), 'publish')

  await tick(800)
  const failed = results.filter((item) => !item.pass).length
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #3990', total: results.length, failed, assertions: results })
  document.body.appendChild(pre)

}
run().then(() => {
  const failed = results.filter((item) => !item.pass).length
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #3990', total: results.length, failed, assertions: results })
  document.body.appendChild(pre)
}).catch((error) => {
  const pre = document.createElement('pre')
  pre.id = 'qa-report'
  pre.textContent = JSON.stringify({ task: 'Issue #3990', total: results.length, failed: results.length + 1, assertions: results, harnessError: error && error.message ? error.message : String(error) })
  document.body.appendChild(pre)
})
