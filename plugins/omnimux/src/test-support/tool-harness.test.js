import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTestToolContext, assertToolContract } from './tool-harness.js'

describe('OmniMux Unified Tool Harness', () => {
  it('passes for a valid tool definition matching DSH contract', () => {
    const validTool = {
      name: 'test_tool',
      description: 'A valid test tool',
      parameters: { type: 'object', properties: {} },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async () => ({ ok: true }),
    }

    assert.doesNotThrow(() => assertToolContract(validTool))

    const { tools, ctx } = createTestToolContext()
    ctx.tools.register(validTool)
    assert.equal(tools.has('test_tool'), true)
  })

  it('rejects tool missing output object with TypeError', () => {
    const brokenTool = {
      name: 'broken_tool',
      description: 'Missing output',
      parameters: { type: 'object' },
      execute: async () => {},
    }

    assert.throws(
      () => assertToolContract(brokenTool),
      /tool "broken_tool" must declare output \{ schema, render, presentationMeta\? \}/,
    )

    const { ctx } = createTestToolContext()
    assert.throws(
      () => ctx.tools.register(brokenTool),
      /tool "broken_tool" must declare output \{ schema, render, presentationMeta\? \}/,
    )
  })

  it('rejects tool missing output.render function', () => {
    const invalidRenderTool = {
      name: 'invalid_render',
      description: 'output without render',
      parameters: { type: 'object' },
      output: { schema: { type: 'object' } },
      execute: async () => {},
    }

    assert.throws(
      () => assertToolContract(invalidRenderTool),
      /tool "invalid_render" must declare output \{ schema, render, presentationMeta\? \}/,
    )
  })

  it('rejects tool missing name, description, parameters, or execute', () => {
    assert.throws(() => assertToolContract({}), /tool must declare a non-empty name/)
    assert.throws(
      () => assertToolContract({ name: 't', parameters: {}, output: { render: () => {} } }),
      /must declare a non-empty description/,
    )
    assert.throws(
      () => assertToolContract({ name: 't', description: 'd', output: { render: () => {} } }),
      /must declare parameters/,
    )
    assert.throws(
      () => assertToolContract({ name: 't', description: 'd', parameters: {}, output: { render: () => {} } }),
      /must declare execute\(\)/,
    )
  })
})
