import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'
import { ASSETS_CSS } from './styles.js'
import { resolveArtifactSource, getSourceBadgeText } from './generations-helpers.js'

const here = dirname(fileURLToPath(import.meta.url))
const stageJsx = readFileSync(join(here, 'AssetsStage.jsx'), 'utf8')
const generationsViewJsx = readFileSync(join(here, 'GenerationsView.jsx'), 'utf8')
const routesJs = readFileSync(join(here, '..', 'http-routes.js'), 'utf8')

describe('Generations tab integration into Assets Stage', () => {
  it('declares 4 first-level tabs including generations in AssetsFilterBar', () => {
    assert.match(stageJsx, /\{ id: 'local', label: t\('source\.local'\) \}/)
    assert.match(stageJsx, /\{ id: 'cloud', label: t\('source\.cloud'\) \}/)
    assert.match(stageJsx, /\{ id: 'product', label: t\('source\.product'\) \|\| '产品库' \}/)
    assert.match(stageJsx, /\{ id: 'generations', label: t\('source\.generations'\) \|\| '生成的' \}/)
  })

  it('contains valid i18n locales for generations in both zh and en', () => {
    assert.equal(zh['source.generations'], '生成的')
    assert.equal(en['source.generations'], 'Generations')
    assert.equal(zh['generations.source.all'], '全部来源')
    assert.equal(en['generations.source.all'], 'All Sources')
    assert.equal(zh['generations.source.agent'], '智能体')
    assert.equal(en['generations.source.agent'], 'Agent')
    assert.equal(zh['generations.source.image'], '图像生成')
    assert.equal(en['generations.source.image'], 'Image Gen')
    assert.equal(zh['generations.source.canvas'], '画布')
    assert.equal(en['generations.source.canvas'], 'Canvas')
  })

  it('switches action row and hides product creation menu when sourceTab is generations', () => {
    assert.match(stageJsx, /if \(sourceTab === 'generations'\) \{\s*return null\s*\}/)
  })

  it('mounts GenerationsCategoryNav in sticky rail when sourceTab is generations', () => {
    assert.match(stageJsx, /\{sourceTab === 'generations' \? \(\s*<GenerationsCategoryNav\b/)
  })

  it('mounts GenerationsView under AssetsBody when sourceTab is generations', () => {
    assert.match(stageJsx, /if \(sourceTab === 'generations'\) \{\s*return \(\s*<div className="omnimux-assets-body">\s*<div className="omnimux-assets-main">\s*<GenerationsView/)
  })

  it('resolves artifact source categories accurately', () => {
    assert.equal(resolveArtifactSource({ source: { agent: 'omnimux_image_submit' } }), 'image')
    assert.equal(resolveArtifactSource({ source: { agent: 'image_generate' } }), 'image')
    assert.equal(resolveArtifactSource({ source: { channel: 'image' } }), 'image')
    assert.equal(resolveArtifactSource({ source: { channel: 'canvas' } }), 'canvas')
    assert.equal(resolveArtifactSource({ source: { run_id: 'canvas_node_123' } }), 'canvas')
    assert.equal(resolveArtifactSource({ source: { agent: 'my_writer_agent' } }), 'agent')
    assert.equal(resolveArtifactSource({ source: {} }), 'agent')
  })

  it('maps source badge texts accurately', () => {
    const fakeT = (k) => zh[k] || ''
    assert.equal(getSourceBadgeText('canvas', fakeT), '画布')
    assert.equal(getSourceBadgeText('image', fakeT), '图像生成')
    assert.equal(getSourceBadgeText('agent', fakeT), '智能体')
  })

  it('declares artifact stream preview route in http-routes.js', () => {
    assert.match(routesJs, /path === '\/omnimux\/assets\/artifacts\/preview'/)
  })

  it('injects generations styles into ASSETS_CSS without raw hex or broken template escapes', () => {
    assert.match(ASSETS_CSS, /\.omnimux-generations-container/)
    assert.match(ASSETS_CSS, /\.omnimux-generation-card/)
    assert.match(ASSETS_CSS, /\.omnimux-generation-badge/)
  })
})
