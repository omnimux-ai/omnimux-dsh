import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const sourcePath = join(here, 'InspirationInlineImportDialog.jsx')
const source = readFileSync(sourcePath, 'utf8')

describe('InspirationInlineImportDialog — smart link analysis & button gate contract', () => {
  it('defines classifying state and classify request tracking ref', () => {
    assert.ok(source.includes('const [classifying, setClassifying] = useState(false)'), 'must define classifying state')
    assert.ok(source.includes('const classifyReqRef = useRef(0)'), 'must track active classification request id to prevent races')
  })

  it('enforces that submit button is disabled unless URL is non-empty, analysis settled, and classified as content or account', () => {
    assert.ok(source.includes('const isClassifiedValid = Boolean('), 'must compute classified validity')
    assert.ok(source.includes("classified.kind === 'content' || classified.kind === 'account'"), 'must check for supported kinds')
    assert.ok(source.includes('const canSubmit = !loading && !classifying && isClassifiedValid'), 'canSubmit must require !loading, !classifying, and valid classification')
    assert.ok(source.includes('disabled={!canSubmit}'), 'primary submit button must bind disabled to !canSubmit')
  })

  it('immediately resets classification verdict and enters analyzing state on url change', () => {
    assert.ok(source.includes('setClassifying(true)'), 'must set classifying to true while analyzing')
    assert.ok(source.includes('setClassified(null)'), 'must invalidate old classification on input modification')
  })

  it('renders localized analyzing message when classifying is active', () => {
    assert.ok(source.includes('{classifying ? ('), 'must conditionally render analyzing state in UI')
    assert.ok(source.includes("t('add.analyzingUrl')"), 'must use localized analyzing message')
  })

  it('keeps localized dictionary entries aligned for both zh and en', () => {
    const localesPath = join(here, 'locales.js')
    const localesSource = readFileSync(localesPath, 'utf8')
    assert.ok(localesSource.includes("'add.analyzingUrl': '正在分析并校验链接，请稍候…'"), 'zh locale dictionary must include add.analyzingUrl')
    assert.ok(localesSource.includes("'add.analyzingUrl': 'Analyzing and verifying URL, please wait…'"), 'en locale dictionary must include add.analyzingUrl')
  })
})
