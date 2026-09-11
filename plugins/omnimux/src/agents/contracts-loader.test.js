import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  parseContractContent,
  loadActiveContracts,
  mountContractsPrompt,
  DEFAULT_CONTRACTS_DIR,
} from './contracts-loader.js'

test('parseContractContent - standard frontmatter', () => {
  const md = `---
name: test-contract
agents: [orchestrator, video-producer]
---

# Title
Rule content here.
`
  const result = parseContractContent(md, 'fallback')
  assert.equal(result.name, 'test-contract')
  assert.deepEqual(result.agents, ['orchestrator', 'video-producer'])
  assert.equal(result.body, '# Title\nRule content here.')
})

test('parseContractContent - list style frontmatter', () => {
  const md = `---
name: list-style
agents:
  - media-agent
  - executor
---

Content
`
  const result = parseContractContent(md)
  assert.equal(result.name, 'list-style')
  assert.deepEqual(result.agents, ['media-agent', 'executor'])
  assert.equal(result.body, 'Content')
})

test('parseContractContent - no frontmatter defaults to *', () => {
  const md = '# Plain markdown'
  const result = parseContractContent(md, 'plain')
  assert.equal(result.name, 'plain')
  assert.deepEqual(result.agents, ['*'])
  assert.equal(result.body, '# Plain markdown')
})

test('loadActiveContracts - loads actual contracts in tree', () => {
  const { contracts, formatted } = loadActiveContracts({
    contractsDir: DEFAULT_CONTRACTS_DIR,
    agentName: 'orchestrator',
  })

  // orchestrator is targeted by baseline, anti-loop, semantic-judgment, timeline-discipline, batch-grouping
  assert.ok(contracts.length >= 5, `Expected >= 5 contracts, got ${contracts.length}`)
  const names = contracts.map((c) => c.name)
  assert.ok(names.includes('baseline'))
  assert.ok(names.includes('anti-loop'))
  assert.ok(names.includes('semantic-judgment'))
  assert.ok(names.includes('timeline-discipline'))
  assert.ok(names.includes('batch-grouping'))

  assert.ok(formatted.includes('## Living Agent Contracts'))
  assert.ok(formatted.includes('<contract name="baseline">'))
  assert.ok(formatted.includes('<contract name="anti-loop">'))
})

test('loadActiveContracts - filters out contracts not targeted to agent', () => {
  const { contracts } = loadActiveContracts({
    contractsDir: DEFAULT_CONTRACTS_DIR,
    agentName: 'router',
  })

  const names = contracts.map((c) => c.name)
  assert.ok(names.includes('baseline'))
  assert.ok(names.includes('anti-loop'))
  // semantic-judgment only targets [orchestrator, video-producer, executor]
  assert.ok(!names.includes('semantic-judgment'))
  // batch-grouping only targets [orchestrator, video-producer]
  assert.ok(!names.includes('batch-grouping'))
})

test('mountContractsPrompt - registers section when systemPrompt available', () => {
  const registeredSections = []
  const mockCtx = {
    systemPrompt: {
      section: (spec) => registeredSections.push(spec),
    },
  }

  const helper = mountContractsPrompt(mockCtx, {
    contractsDir: DEFAULT_CONTRACTS_DIR,
    defaultAgentName: 'video-producer',
  })

  assert.equal(registeredSections.length, 1)
  assert.equal(registeredSections[0].name, 'omnimux-contracts')
  assert.equal(registeredSections[0].order, 20)
  assert.ok(registeredSections[0].text.includes('<contract name="baseline">'))

  const executorContracts = helper.getContractsForAgent('executor')
  assert.ok(executorContracts.contracts.some((c) => c.name === 'semantic-judgment'))
})
