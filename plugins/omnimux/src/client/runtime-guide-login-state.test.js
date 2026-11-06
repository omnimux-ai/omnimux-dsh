import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'RuntimeGuideGate.jsx'), 'utf8')

describe('first-run guide login state', () => {
  it('ships the signed-in continue label in both languages', () => {
    assert.equal(zh['runtime.officialContinueLogged'], '继续（已登录）')
    assert.equal(en['runtime.officialContinueLogged'], 'Continue (signed in)')
  })

  it('reads the auth gate and continues without re-opening login', () => {
    assert.match(source, /__omnimuxAuth/)
    assert.match(source, /isLoggedIn/)
    assert.match(source, /loggedIn \? t\('runtime\.officialContinueLogged'\) : t\('runtime\.officialCta'\)/)
    assert.match(source, /loggedIn \? \(\) => \{ void finish\('official'\) \} : startOfficial/)
  })
})
