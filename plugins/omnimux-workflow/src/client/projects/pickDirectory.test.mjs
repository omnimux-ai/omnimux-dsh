import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { extractFolderName, firstPickedDirectory } from './pickDirectory.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('firstPickedDirectory', () => {
  it('reads the first non-empty path from common picker envelopes', () => {
    assert.equal(firstPickedDirectory('/tmp/a'), '/tmp/a')
    assert.equal(firstPickedDirectory(['', '/tmp/b']), '/tmp/b')
    assert.equal(firstPickedDirectory({ paths: ['/tmp/c'] }), '/tmp/c')
    assert.equal(firstPickedDirectory({ body: { path: '/tmp/d', paths: [] } }), '/tmp/d')
    assert.equal(firstPickedDirectory({ body: { paths: [] } }), '')
    assert.equal(firstPickedDirectory(null), '')
  })
})

describe('extractFolderName', () => {
  it('uses the last path segment', () => {
    assert.equal(extractFolderName('/Users/x/Desktop/projects'), 'projects')
    assert.equal(extractFolderName('/Users/x/Desktop/projects/'), 'projects')
    assert.equal(extractFolderName(''), '')
  })
})

describe('create-project dialog source contracts', () => {
  const dialogSrc = readFileSync(join(here, 'NewLocalProjectDialog.jsx'), 'utf8')
  const librarySrc = readFileSync(join(here, 'ProjectLibraryPage.jsx'), 'utf8')
  const canvasSrc = readFileSync(join(here, 'CanvasTab.jsx'), 'utf8')
  const localesSrc = readFileSync(join(here, '../locales.js'), 'utf8')

  it('keeps initialPath state and empty/picked folder cards', () => {
    assert.match(dialogSrc, /initialPath\s*=\s*''/)
    assert.match(dialogSrc, /const\s*\[path,\s*setPath\]\s*=\s*useState\s*\(\s*initialPath/)
    assert.match(dialogSrc, /extractFolderName\s*\(\s*initialPath\s*\)/)
    assert.match(dialogSrc, /data-omnimux-new-project-drop/)
    assert.match(dialogSrc, /data-omnimux-new-project-picked/)
    assert.match(dialogSrc, /data-omnimux-new-project-remove/)
    assert.match(dialogSrc, /data-omnimux-new-project-browse/)
    assert.match(dialogSrc, /browseProjectDirectory/)
    assert.doesNotMatch(dialogSrc, /pickProjectDirectory/)
  })

  it('library create dialog does not prefill the current workspace path', () => {
    assert.match(librarySrc, /initialPath=""/)
    assert.doesNotMatch(librarySrc, /resolveCurrentCwd/)
  })

  it('canvas unprojected dialog still prefills the session workspace', () => {
    assert.match(
      canvasSrc,
      /<NewLocalProjectDialog[\s\S]*?initialPath=\{\s*sessionBinding\?\.workspaceDir\s*\|\|\s*''\s*\}/,
    )
  })

  it('uses create-project copy for title, source folder, add and remove', () => {
    assert.match(localesSrc, /'projects\.dialog\.title': '创建项目'/)
    assert.match(localesSrc, /'projects\.dialog\.pathLabel': '源文件夹'/)
    assert.match(localesSrc, /'projects\.dialog\.addFolder': '在此电脑上添加文件夹'/)
    assert.match(localesSrc, /'projects\.dialog\.add': '添加'/)
    assert.match(localesSrc, /'projects\.dialog\.removeFolder': '移除文件夹'/)
    assert.match(localesSrc, /'projects\.dialog\.chooseHere': '选择此文件夹'/)
  })
})
