import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { candidatePaths, locateBrowser } from './chrome-locator.js'

describe('chrome locator · candidate paths', () => {
  it('honours an explicit override before anything else', () => {
    const paths = candidatePaths({ OMNIMUX_CHROME_PATH: '/custom/chrome' }, 'darwin')
    assert.equal(paths[0], '/custom/chrome')
  })

  it('accepts the other override variables too', () => {
    assert.equal(candidatePaths({ CHROME_PATH: '/a/chrome' }, 'linux')[0], '/a/chrome')
    assert.equal(candidatePaths({ CHROME_BIN: '/b/chrome' }, 'linux')[0], '/b/chrome')
  })

  it('lists the macOS application bundles, Chrome first', () => {
    const paths = candidatePaths({}, 'darwin')
    assert.equal(paths[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    assert.ok(paths.includes('/Applications/Chromium.app/Contents/MacOS/Chromium'))
    assert.ok(paths.includes('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'))
  })

  it('lists the Linux absolute paths and the PATH commands', () => {
    const paths = candidatePaths({ PATH: '/usr/local/bin:/usr/bin' }, 'linux')
    assert.ok(paths.includes('/usr/bin/google-chrome'))
    assert.ok(paths.includes('/snap/bin/chromium'))
    assert.ok(paths.includes('/usr/local/bin/google-chrome'))
    assert.ok(paths.includes('/usr/bin/chromium'))
  })

  it('lists the Windows install locations from the environment roots', () => {
    const paths = candidatePaths({
      PROGRAMFILES: 'C:\\Program Files',
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
    }, 'win32')
    assert.ok(paths.some((row) => row.endsWith('chrome.exe')))
    assert.ok(paths.some((row) => row.includes('msedge.exe')))
  })

  it('never repeats a candidate and never throws on a hostile environment', () => {
    const paths = candidatePaths({ PATH: ':/usr/bin::/usr/bin' }, 'linux')
    assert.equal(new Set(paths).size, paths.length)
    assert.deepEqual(candidatePaths({}, 'freebsd').length >= 0, true)
  })
})

describe('chrome locator · probing', () => {
  it('answers the first candidate that really is a file', () => {
    const wanted = candidatePaths({}, 'darwin')[1]
    const found = locateBrowser({}, { platform: 'darwin', isFile: (path) => path === wanted })
    assert.equal(found, wanted)
  })

  it('answers null when the host has no browser at all', () => {
    assert.equal(locateBrowser({}, { platform: 'darwin', isFile: () => false }), null)
    assert.equal(locateBrowser({ PATH: '' }, { platform: 'linux', isFile: () => false }), null)
  })

  it('skips a candidate whose probe throws instead of failing the whole search', () => {
    let seen = 0
    const found = locateBrowser({}, {
      platform: 'darwin',
      isFile: (path) => {
        seen += 1
        if (seen === 1) throw new Error('EACCES')
        return path.endsWith('Chromium')
      },
    })
    assert.match(found, /Chromium$/)
  })
})
