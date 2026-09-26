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
          contents: 'exports.pickProjectDirectory = async () => ({ ok: true, body: { path: "/Users/x/Desktop", paths: ["/Users/x/Desktop"] } }); exports.browseProjectDirectory = async () => ({ ok: true, body: { path: "/Users/x/Desktop", parent: "/Users/x", entries: [{ name: "projects", path: "/Users/x/Desktop/projects" }] } });',
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
  const { container, root, dom, act } = await mount({ initialPath: '/Users/x/Desktop/projects' })
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
    initialPath: '/Users/x/Desktop/projects',
    onSubmit: (payload) => { submits.push(payload) },
    onPickDirectory: async () => {
      pickCalls += 1
      return { ok: true, body: { path: '/Users/x/Desktop', paths: ['/Users/x/Desktop'] } }
    },
  })
  try {
    await act(async () => container.querySelector('[data-omnimux-new-project-remove]').click())
    assert.ok(container.querySelector('[data-omnimux-new-project-drop]'))
    assert.equal(container.querySelector('[data-omnimux-new-project-picked]'), null)

    await act(async () => container.querySelector('[data-omnimux-new-project-drop]').click())
    assert.equal(pickCalls, 1)
    const picked = container.querySelector('[data-omnimux-new-project-picked]')
    assert.ok(picked)
    assert.match(picked.textContent, /Desktop/)
    assert.equal(container.querySelector('[data-omnimux-new-project-browse]'), null)

    const primary = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('projects.dialog.submit'))
    assert.ok(primary)
    assert.equal(primary.disabled, false)
    await act(async () => primary.click())
    assert.equal(submits.length, 1)
    assert.equal(submits[0].title, 'projects')
    assert.equal(submits[0].projectRoot, '/Users/x/Desktop')
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
    assert.equal('projectRoot' in submits[0], false)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
  }
})
