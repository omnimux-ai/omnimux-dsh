import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const here = dirname(fileURLToPath(import.meta.url))

test('folder glass has unique clips, one cover per card and unchanged actions', async () => {
  const result = await build({
    entryPoints: [resolve(here, 'ProjectFolderCard.jsx')], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react'],
    plugins: [{ name: 'render-seams', setup(builder) {
      builder.onResolve({ filter: /^(dsh-ui-kit|@deepseek-ai\/dsh-client-ui-primitives)$/ }, args => ({ path: args.path, namespace: 'seam' }))
      builder.onLoad({ filter: /.*/, namespace: 'seam' }, () => ({ contents: `const React=require('react'); exports.Button=exports.IconButton=({children,...props})=>React.createElement('button',props,children); exports.IconEditOutline16=exports.IconTrashOutline16=()=>null;` }))
      builder.onResolve({ filter: /ProjectCover\.jsx$/ }, () => ({ path: 'cover', namespace: 'cover' }))
      builder.onLoad({ filter: /.*/, namespace: 'cover' }, () => ({ contents: `const React=require('react');exports.ProjectCover=()=>React.createElement('i',{'data-cover-probe':'one'});` }))
    } }],
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports)
  const { ProjectFolderCard } = mod.exports
  const props = { onOpen() {}, onRename() {}, onDelete() {}, t: key => key }
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    ...['empty', 'image', 'video'].map((kind, id) => React.createElement(ProjectFolderCard, { ...props, key: id, project: { id, title: kind, cover: { kind } } }))))
  const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(match => match[1])
  assert.equal(new Set(ids).size, 3)
  for (const id of ids) assert.ok(html.includes(`stroke="url(#${id})"`))
  assert.equal((html.match(/--stage-pocket-mask:/g) || []).length, 3)
  assert.ok(html.includes('data:image/svg+xml,'))
  assert.ok(!html.includes('clip-path:'))
  const svg = decodeURIComponent(html.match(/data:image\/svg\+xml,([^&]+)&quot;/)[1])
  assert.ok(svg.includes('viewBox="0 0 516 378"'))
  assert.ok(svg.includes('fill="white"'))
  assert.ok(!svg.includes('<rect'))
  assert.equal((html.match(/data-cover-probe="one"/g) || []).length, 3)
  assert.equal((html.match(/omnimux-folder-sheet--rear/g) || []).length, 3)
  assert.equal((html.match(/omnimux-folder-sheet--front/g) || []).length, 3)
  assert.equal((html.match(/aria-haspopup="menu"/g) || []).length, 3)
})
