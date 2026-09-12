import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { INSPIRATION_TOOL_NAMES, apply } from './index.js'

describe('inspiration tools registration', () => {
  it('registers every name in INSPIRATION_TOOL_NAMES, including update, delete and favorite', () => {
    const registered = []
    const mockCtx = {
      tools: {
        register(t) {
          registered.push(t)
        },
      },
    }

    apply(mockCtx)

    const names = registered.map((t) => t.name)
    assert.deepEqual(names, INSPIRATION_TOOL_NAMES)
    assert.ok(names.includes('inspiration_update'))
    assert.ok(names.includes('inspiration_delete'))
    assert.ok(names.includes('inspiration_favorite'))
  })

  it('inspiration_search, inspiration_update, inspiration_favorite, inspiration_delete lifecycle', async () => {
    const registered = {}
    const mockCtx = {
      tools: {
        register(t) {
          registered[t.name] = t
        },
      },
    }

    apply(mockCtx)

    const searchTool = registered.inspiration_search
    assert.ok(searchTool)

    const result = await searchTool.execute({ query: '' })
    assert.ok(Array.isArray(result.inspirations))

    // Test inspiration_delete confirm guard
    const deleteTool = registered.inspiration_delete
    assert.ok(deleteTool)
    await assert.rejects(
      async () => deleteTool.execute({ id: 'insp_dummy', confirm: false }),
      { message: /confirm must be explicitly true/ }
    )
  })
})
