import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/**
 * Stylesheets (including CSS modules imported by dsh-ui-kit) carry no element
 * order information, so they resolve to an empty module instead of being
 * bundled — esbuild otherwise demands an emit path for CSS outputs.
 */
const cssStubPlugin = {
  name: 'analytics-stage-css-stub',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({ contents: 'module.exports = {}', loader: 'js' }))
  },
}

/**
 * Renders the real AnalyticsStage through react-dom/server. The stage imports
 * dsh-ui-kit and every analytics chart, so the module graph is bundled for Node
 * first — this keeps the assertion on the shipped JSX order rather than on a
 * hand-maintained fixture.
 */
async function renderStageMarkup() {
  const built = await esbuild.build({
    plugins: [cssStubPlugin],
    stdin: {
      contents: `
        import React from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { AnalyticsStage } from './AnalyticsStage.jsx'
        export function render(t) {
          return renderToStaticMarkup(React.createElement(AnalyticsStage, { t, visible: true }))
        }
      `,
      resolveDir: here,
      loader: 'jsx',
      sourcefile: 'analytics-stage-ssr-entry.jsx',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    // Styling and fonts are irrelevant to the rendered element order; the
    // header/divider/tab/filter markup is produced by the JSX under test.
    loader: {
      '.css': 'empty',
      '.woff': 'empty',
      '.woff2': 'empty',
      '.ttf': 'empty',
      '.eot': 'empty',
      '.svg': 'empty',
      '.png': 'empty',
      '.jpg': 'empty',
      '.gif': 'empty',
    },
  })
  const moduleObj = { exports: {} }
  const fn = new Function('require', 'module', 'exports', built.outputFiles[0].text)
  fn(require, moduleObj, moduleObj.exports)
  return moduleObj.exports.render((key) => zh[key] ?? key)
}

const html = await renderStageMarkup()

const indexOfPageHeaderTitle = html.indexOf('<h1')
const indexOfDivider = html.indexOf('role="separator"')
const indexOfActionRow = html.indexOf('omnimux-analytics-stage-action-row')
const indexOfFilterBar = html.indexOf('omnimux-analytics-stage-filter')

describe('analytics stage header divider placement', () => {
  it('renders exactly one horizontal divider in the stage', () => {
    const dividers = html.match(/role="separator"/g) ?? []
    assert.equal(dividers.length, 1)
  })

  it('places the divider between the page header and the tab row', () => {
    assert.notEqual(indexOfPageHeaderTitle, -1)
    assert.notEqual(indexOfDivider, -1)
    assert.notEqual(indexOfActionRow, -1)
    assert.ok(
      indexOfPageHeaderTitle < indexOfDivider,
      'divider must render after the PageHeader title',
    )
    assert.ok(
      indexOfDivider < indexOfActionRow,
      'divider must render before the tab row (ActionNavRow)',
    )
  })

  it('leaves no divider between the tab row and the filter bar', () => {
    const betweenTabRowAndFilterBar = html.slice(indexOfActionRow, indexOfFilterBar)
    assert.notEqual(indexOfFilterBar, -1)
    assert.ok(indexOfActionRow < indexOfFilterBar)
    assert.equal(
      betweenTabRowAndFilterBar.includes('role="separator"'),
      false,
      'the tab row must no longer carry a divider below it',
    )
  })
})
