import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CHAT_MODEL_IDS } from './catalog.js'
import { getContractIndex, resolveModelId } from '../catalog/contract/index.js'

const patchPath = join(dirname(fileURLToPath(import.meta.url)), '../../cordis.patch.yml')
const contractIndex = getContractIndex()

/**
 * Split the llm-pi-ai model list into per-id blocks so a missing
 * `reasoningEfforts.max` fails on that id instead of on the file as a whole.
 * @param {string} text
 */
function modelBlocks(text) {
  const start = text.indexOf('\n- id: llm-pi-ai\n')
  assert.notEqual(start, -1, 'cordis.patch.yml has no llm-pi-ai row')
  const modelsAt = text.indexOf('\n        models:\n', start)
  assert.notEqual(modelsAt, -1, 'llm-pi-ai row has no models list')
  const slice = text.slice(modelsAt)
  const parts = slice.split(/\n          - id: /).slice(1)
  return parts.map((part) => {
    const nl = part.indexOf('\n')
    const id = (nl === -1 ? part : part.slice(0, nl)).trim()
    return { id, body: part }
  })
}

describe('omnimux patch reasoning offer', () => {
  const text = readFileSync(patchPath, 'utf8')
  const blocks = modelBlocks(text)
  // A patch row may carry a declared alias of its contract model (wire 归一);
  // key by the resolved canonical id so an aliased row still counts once.
  const byCanonicalId = new Map()
  for (const row of blocks) {
    const canonical = resolveModelId(contractIndex, row.id)
    assert.ok(canonical, `cordis.patch.yml model ${row.id} is neither a contract model nor a declared alias`)
    assert.equal(byCanonicalId.has(canonical), false, `cordis.patch.yml declares ${canonical} twice`)
    byCanonicalId.set(canonical, row.body)
  }

  it('sets the omnimux route default to max', () => {
    assert.match(text, /\n        reasoning: max\n/)
  })

  it('declares reasoningEfforts.max on every chat-directory model', () => {
    for (const id of CHAT_MODEL_IDS) {
      const body = byCanonicalId.get(id)
      assert.ok(body, `patch is missing chat-directory model ${id}`)
      assert.match(body, /reasoningEfforts:\n/, `${id} has no reasoningEfforts`)
      assert.match(body, /^\s+max: (max|xhigh)$/m, `${id} does not offer max`)
    }
  })

  it('maps every declared UI max to a legal wire value after the single-model alignment', () => {
    // 2026-10-21 #3527：唯一需要 max→xhigh 折中的 gpt-5.5 已从路由声明移除；
    // 现役 gemini 直接声明 max: max，且不再保留任何 xhigh 折中。
    for (const row of blocks) {
      assert.match(row.body, /^\s+max: (max|xhigh)$/m, `${row.id} does not declare a legal max mapping`)
    }
    assert.match(byCanonicalId.get('gemini-3.8-flash') ?? '', /^\s+max: max$/m)
    assert.doesNotMatch(text, /max: xhigh/)
  })

  it('declares no Off mapping now that no listed model can disable thinking', () => {
    // gpt-5.6-sol / deepseek-v4-* 已不在路由声明里；唯一现役 gemini 不提供 Off。
    assert.doesNotMatch(text, /'off':/)
    assert.doesNotMatch(byCanonicalId.get('gemini-3.8-flash') ?? '', /'off':/, 'gemini must not offer Off')
  })
})
