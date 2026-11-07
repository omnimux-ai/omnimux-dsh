/**
 * 浏览器预演：图文发布前图片格式校验（Issue #3957）。
 * 直接挂载真实 Composer，用 api.js 替身驱动三条交互。
 */
import { createRoot } from 'react-dom/client'
import { Composer } from '../../plugins/omnimux-publish/src/client/Composer/index.jsx'
import { injectPublishStyles } from '../../plugins/omnimux-publish/src/client/styles.js'
import { zh } from '../../plugins/omnimux-publish/src/client/locales.js'

injectPublishStyles()

const qa = (window.__qa = window.__qa || { uploads: [], accounts: [] })

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

function mount(props) {
  const container = document.createElement('div')
  container.className = 'qa-mount'
  document.getElementById('stage').appendChild(container)
  const root = createRoot(container)
  root.render(<Composer t={t} onBack={() => {}} onSubmitted={() => {}} onSaved={() => {}} {...props} />)
  return { container, root }
}

function pickFiles(container, files) {
  const input = container.querySelector('input[type=file]')
  if (!input) throw new Error('file input missing')
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const jpegBytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 255, 217])

const results = []
function check(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: String(detail ?? '') })
}

async function openImageComposer() {
  const handle = mount({})
  await waitFor(() => handle.container.querySelector('.omnimux-publish-type-page'))
  const cards = [...handle.container.querySelectorAll('button')]
  const imageCard = cards.find((button) => button.textContent.includes('图文'))
  if (!imageCard) throw new Error('image type card missing')
  imageCard.click()
  await waitFor(() => handle.container.querySelector('.omnimux-publish-form'))
  return handle
}

async function run() {
  // 1) 新图文草稿：选择 PNG → 不上传、给提示
  qa.uploads = []
  const png = await openImageComposer()
  const pngFile = new File([pngBytes], 'sample.png', { type: 'image/png' })
  pickFiles(png.container, [pngFile])
  await tick(250)
  const alertText = (png.container.querySelector('[role=alert]') || {}).textContent || ''
  check('PNG 被拦截且未上传', qa.uploads.length === 0, `uploads=${qa.uploads.length}`)
  check('PNG 提示包含格式要求', /JPEG\/WebP/.test(alertText), alertText.slice(0, 60))
  check('PNG 未进入素材列表', png.container.querySelectorAll('.omnimux-publish-media-item').length === 0, 'media=0')

  // 2) 同一表单里选择 JPEG → 正常上传
  const jpegFile = new File([jpegBytes], 'sample.jpg', { type: 'image/jpeg' })
  pickFiles(png.container, [jpegFile])
  await waitFor(() => png.container.querySelectorAll('.omnimux-publish-media-item').length > 0)
  check('JPEG 正常上传', qa.uploads.length === 1 && qa.uploads[0].type === 'image/jpeg', JSON.stringify(qa.uploads))
  check('JPEG 进入素材列表', png.container.querySelectorAll('.omnimux-publish-media-item').length === 1, 'media=1')
  png.root.unmount()

  // 3) 历史草稿全 JPEG → 不标记、可提交
  qa.draft = {
    record: { id: 'draft-jpg', type: 'image', title: '历史草稿', description: '', topics: [], account_ids: [] },
    media: [{ id: 'm-jpg', kind: 'image', filename: 'legacy.jpg', content_type: 'image/jpeg' }],
  }
  const draftJpg = mount({ draftId: 'draft-jpg' })
  await waitFor(() => draftJpg.container.querySelector('.omnimux-publish-media-item'))
  await tick(120)
  const jpgSubmit = [...draftJpg.container.querySelectorAll('button')].find((button) => button.textContent.trim() === t('form.submit'))
  check('草稿 JPEG 无格式标记', draftJpg.container.querySelectorAll('.omnimux-publish-media-badge').length === 0, 'badge=0')
  check('草稿 JPEG 可提交', Boolean(jpgSubmit) && jpgSubmit.disabled === false, jpgSubmit ? `disabled=${jpgSubmit.disabled}` : 'submit missing')
  draftJpg.root.unmount()

  // 4) 历史草稿含 PNG → 标记并禁用提交（截图停在此状态）
  qa.draft = {
    record: { id: 'draft-png', type: 'image', title: '历史草稿', description: '', topics: [], account_ids: [] },
    media: [{ id: 'm-png', kind: 'image', filename: 'legacy.png', content_type: 'image/png' }],
  }
  const draftPng = mount({ draftId: 'draft-png' })
  await waitFor(() => draftPng.container.querySelector('.omnimux-publish-media-badge'))
  const badge = draftPng.container.querySelector('.omnimux-publish-media-badge')
  const submit = [...draftPng.container.querySelectorAll('button')].find((button) => button.textContent.trim() === t('form.submit'))
  check('草稿 PNG 显示格式标记', Boolean(badge) && /格式不支持/.test(badge.textContent), badge ? badge.textContent : 'missing')
  check('草稿 PNG 禁用提交', Boolean(submit) && submit.disabled === true, submit ? `disabled=${submit.disabled}` : 'submit missing')
  await tick(2500)
}

run()
  .then(() => {
    const failed = results.filter((item) => !item.pass).length
    const pre = document.createElement('pre')
    pre.id = 'qa-report'
    pre.textContent = JSON.stringify({ task: 'Issue #3957', total: results.length, failed, assertions: results })
    document.body.appendChild(pre)
  })
  .catch((error) => {
    const pre = document.createElement('pre')
    pre.id = 'qa-report'
    pre.textContent = JSON.stringify({
      task: 'Issue #3957',
      total: results.length,
      failed: results.length + 1,
      assertions: results,
      harnessError: error && error.message ? error.message : String(error),
    })
    document.body.appendChild(pre)
  })
