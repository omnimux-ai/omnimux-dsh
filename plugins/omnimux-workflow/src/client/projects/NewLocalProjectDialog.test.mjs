import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const React = require('react')
const here = dirname(fileURLToPath(import.meta.url))

const SEAM = `
const React = require('react');
const Button = ({ children, className, disabled, onClick, ...rest }) => React.createElement('button', {
  ...rest, type: 'button', className, disabled, onClick,
}, children);
const IconButton = ({ children, onClick, disabled, ...rest }) => React.createElement('button', {
  ...rest, type: 'button', className: 'iconButton', onClick, disabled,
}, children);
const InputField = React.forwardRef((props, ref) => React.createElement('input', { ...props, ref }));
const ModalDialog = ({ title, children, footer }) => React.createElement('div', { role: 'dialog', 'data-title': title }, children, footer);
const icon = (name) => (props) => React.createElement('svg', { viewBox: '0 0 16 16', 'data-icon': name, ...props });
exports.Button = Button;
exports.IconButton = IconButton;
exports.InputField = InputField;
exports.ModalDialog = ModalDialog;
exports.IconCloseOutline16 = icon('close');
`

async function loadModule() {
  const result = await build({
    entryPoints: [resolve(here, 'NewLocalProjectDialog.jsx')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    jsxImportSource: 'react',
    external: ['react', 'react-dom', 'react-dom/client'],
    plugins: [{
      name: 'render-seams',
      setup(builder) {
        builder.onResolve({ filter: /^(dsh-ui-kit|@deepseek-ai\/dsh-client-ui-primitives)$/ }, () => ({ path: 'seam', namespace: 'seam' }))
        builder.onLoad({ filter: /.*/, namespace: 'seam' }, () => ({ contents: SEAM }))
        builder.onResolve({ filter: /\/api\.js$/ }, () => ({ path: 'api', namespace: 'api' }))
        builder.onLoad({ filter: /.*/, namespace: 'api' }, () => ({
          contents: 'exports.pickProjectDirectory = async () => ({ ok: true, body: { path: "/tmp/omnimux-test", paths: ["/tmp/omnimux-test"] } }); exports.browseProjectDirectory = async () => ({ ok: true, body: { path: "/tmp/omnimux-test", parent: "/tmp", entries: [{ name: "projects", path: "/tmp/omnimux-test/projects" }] } }); exports.preflightProject = async () => ({ ok: true, body: { state: "S0", action: "initialize" } });',
        }))
      },
    }],
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports)
  return mod.exports
}

async function mount(props) {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true })
  for (const [name, value] of [['window', dom.window], ['document', dom.window.document], ['navigator', dom.window.navigator]]) {
    Object.defineProperty(global, name, { value, writable: true, configurable: true })
  }
  global.IS_REACT_ACT_ENVIRONMENT = true
  const reactDomClient = require('react-dom/client')
  const { act } = require('react')
  const { NewLocalProjectDialog } = await loadModule()
  const { firstPickedDirectory } = await import('./pickDirectory.js')
  const container = document.getElementById('root')
  const root = reactDomClient.createRoot(container)
  const t = (key) => key
  await act(async () => {
    root.render(React.createElement(NewLocalProjectDialog, { t, onCancel() {}, onSubmit() {}, ...props }))
  })
  return { dom, act, container, root, firstPickedDirectory }
}

test('firstPickedDirectory reads the first non-empty path', async () => {
  const { firstPickedDirectory, root, dom, act } = await mount({})
  try {
    assert.equal(firstPickedDirectory('/tmp/a'), '/tmp/a')
    assert.equal(firstPickedDirectory(['', '/tmp/b']), '/tmp/b')
    assert.equal(firstPickedDirectory({ paths: ['/tmp/c'] }), '/tmp/c')
    assert.equal(firstPickedDirectory({ body: { path: '/tmp/d', paths: [] } }), '/tmp/d')
    assert.equal(firstPickedDirectory({ body: { paths: [] } }), '')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})

test('empty initialPath renders drop zone, not picked card', async () => {
  const { container, root, dom, act } = await mount({ initialPath: '' })
  try {
    assert.ok(container.querySelector('[data-omnimux-new-project-drop]'))
    assert.equal(container.querySelector('[data-omnimux-new-project-picked]'), null)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})

test('initialPath renders removable folder card', async () => {
  const { container, root, dom, act } = await mount({ initialPath: '/tmp/omnimux-test/projects' })
  try {
    const picked = container.querySelector('[data-omnimux-new-project-picked]')
    assert.ok(picked)
    assert.match(picked.textContent, /projects/)
    assert.ok(container.querySelector('[data-omnimux-new-project-remove]'))
    assert.equal(container.querySelector('[data-omnimux-new-project-drop]'), null)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})

test('remove returns to drop zone; pick directory fills card', async () => {
  const submits = []
  let pickCalls = 0
  const { container, root, dom, act } = await mount({
    initialPath: '/tmp/omnimux-test/projects',
    onSubmit: (payload) => { submits.push(payload) },
    onPickDirectory: async () => {
      pickCalls += 1
      return { ok: true, body: { path: '/tmp/omnimux-test', paths: ['/tmp/omnimux-test'] } }
    },
  })
  try {
    await act(async () => container.querySelector('[data-omnimux-new-project-remove]').click())
    assert.ok(container.querySelector('[data-omnimux-new-project-drop]'))
    assert.equal(container.querySelector('[data-omnimux-new-project-picked]'), null)

    await act(async () => container.querySelector('[data-omnimux-new-project-drop]').click())
    assert.equal(pickCalls, 1)
    // 选中目录后预检是异步的：等它在测试内完成，再断言可提交与动作文案。
    await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
    const picked = container.querySelector('[data-omnimux-new-project-picked]')
    assert.ok(picked)
    assert.match(picked.textContent, /omnimux-test/)
    assert.equal(container.querySelector('[data-omnimux-new-project-browse]'), null)

    const primary = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('projects.dialog.submit'))
    assert.ok(primary)
    assert.equal(primary.disabled, false)
    await act(async () => primary.click())
    assert.equal(submits.length, 1)
    assert.equal(submits[0].title, 'projects')
    assert.equal(submits[0].mode, 'workspace', '选中目录后必须按 workspace 对齐')
    assert.equal(submits[0].workspaceDir, '/tmp/omnimux-test')
    assert.equal('projectRoot' in submits[0], false)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})

test('empty name disables submit; name-only submit omits projectRoot', async () => {
  const submits = []
  const { container, root, dom, act } = await mount({
    initialPath: '',
    initialTitle: '',
    onSubmit: (payload) => { submits.push(payload) },
  })
  try {
    const primary = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('projects.dialog.submit'))
    assert.equal(primary.disabled, true)
    const input = container.querySelector('#omnimux-new-local-project-name')
    await act(async () => {
      const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      native.set.call(input, '短剧宣传片')
      input.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    assert.equal(primary.disabled, false)
    await act(async () => primary.click())
    assert.equal(submits[0].title, '短剧宣传片')
    assert.equal(submits[0].mode, 'independent', '不选目录 = 独立项目')
    assert.equal('projectRoot' in submits[0], false)
    assert.equal('workspaceDir' in submits[0], false)
    assert.equal(container.querySelector('[data-omnimux-new-project-preflight]').getAttribute('data-omnimux-new-project-preflight'), 'independent')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})

test('preflight 中性状态与明确动作：open/rebuild/repair 不再红字', async () => {
  const cases = [
    { state: 'S1', action: 'open', label: 'projects.openProject' },
    { state: 'S3', action: 'rebuild', label: 'projects.rebuildAndOpen' },
    { state: 'S2', action: 'repair', label: 'projects.repairAndOpen' },
  ]
  for (const item of cases) {
    const submits = []
    const { container, root, dom, act } = await mount({
      initialPath: '/tmp/omnimux-test/projects',
      initialTitle: '产品运营',
      onPreflight: async () => ({ ok: true, body: { state: item.state, action: item.action, project: { title: '产品运营' } } }),
      onSubmit: async (payload) => { submits.push({ ...payload }) },
    })
    try {
      await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
      const status = container.querySelector('[data-omnimux-new-project-preflight]')
      assert.ok(status)
      assert.equal(status.getAttribute('data-preflight-state'), item.state)
      assert.equal(status.getAttribute('data-preflight-action'), item.action)
      assert.equal(status.classList.contains('omnimux-workflow-form-error'), false, '预检状态必须是中性提示，不是红字错误')
      assert.equal(container.textContent.includes('projects.existingConfirm'), false, '不得再出现「已有项目」红字确认')

      const primary = [...container.querySelectorAll('button')].find((btn) =>
        (btn.textContent || '').includes(item.label)
      )
      assert.ok(primary, `动作按钮必须使用 ${item.label}`)
      await act(async () => primary.click())
      assert.equal(submits.length, 1)
      assert.equal(submits[0].mode, 'workspace')
      assert.equal(submits[0].workspaceDir, '/tmp/omnimux-test/projects')
    } finally {
      await act(async () => root.unmount())
      dom.window.close()
    }
  }
})

test('默认独立项目：无目录时不发预检、直接提交 independent', async () => {
  const submits = []
  let preflightCalls = 0
  const { container, root, dom, act } = await mount({
    initialPath: '',
    initialTitle: '独立项目',
    onPreflight: async () => { preflightCalls += 1; return { ok: true, body: { state: 'S0', action: 'initialize' } } },
    onSubmit: (payload) => { submits.push(payload) },
  })
  try {
    assert.equal(preflightCalls, 0, '独立项目不该发起目录预检')
    const status = container.querySelector('[data-omnimux-new-project-preflight]')
    assert.equal(status.getAttribute('data-omnimux-new-project-preflight'), 'independent')
    const primary = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('projects.dialog.submit'))
    await act(async () => primary.click())
    assert.equal(submits.length, 1)
    assert.equal(submits[0].mode, 'independent')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})

test('preflight 失败：中性失败提示 + 禁用提交，不回退成独立项目', async () => {
  const { container, root, dom, act } = await mount({
    initialPath: '/tmp/omnimux-test/projects',
    initialTitle: '失败目录',
    onPreflight: async () => { throw new Error('boom') },
    onSubmit: () => {},
  })
  try {
    await act(async () => { await new Promise((done) => setTimeout(done, 20)) })
    const status = container.querySelector('[data-omnimux-new-project-preflight]')
    assert.equal(status.getAttribute('data-preflight-state'), 'failed')
    assert.match(status.textContent, /projects\.preflight\.failed/)
    assert.equal(status.classList.contains('omnimux-workflow-form-error'), false, '中性提示，不用红字')
    const primary = [...container.querySelectorAll('button')].find((btn) =>
      (btn.textContent || '').includes('projects.dialog.submit')
    )
    assert.equal(primary.disabled, true, '预检失败必须禁用提交（不得按独立项目误建）')
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})
