#!/usr/bin/env node
// Verify the OmniMux model declarations in plugins/omnimux/cordis.patch.yml
// against the offline model contracts:
//
//   1. Modality consistency (always runs): the patch `input` matrix and the
//      expert whitelist must agree with the measured gateway matrix in
//      plugins/omnimux/src/text/catalog.js (CHAT_MODELS). A patch row
//      declaring image input the measured matrix does not (over-declare)
//      admits an image the provider rejects mid-turn; a measured image-capable
//      model missing `input` on the patch (under-declare) refuses an image
//      before it attaches. The measured matrix, not the pricing catalog text,
//      is the gate: gpt-5.6-sol / kimi-k3 / gemini-3.7-flash accept images in
//      live probes although the pricing descriptions do not mention them.
//   2. Expert whitelist (always runs): every id in CHAT_MODELS must appear on
//      the patch model list. The one-shot tool cannot name a model the chat
//      adapter does not advertise.
//   3. Reasoning declaration (always runs): every patch model must declare
//      `reasoningEfforts` that includes `max`, and the omnimux route must set
//      `reasoning: max`. The composer hides the effort pane when that field is
//      absent; a missing `max` would leave the route default unset on that row.
//      Levels themselves follow the measured gateway matrix in
//      docs/evidence/omnimux-reasoning-2026-08-20.md.
//   4. Shipped-snapshot existence (always runs, offline): every declared model
//      id must be sold by the bundled gateway snapshot
//      (plugins/omnimux/src/catalog/cloud/bundled/pricing.json), the same floor
//      the runtime catalog serves from.
//
// #3763 retired this gate's two online branches: the unconditional public
// pricing fetch and the keyed model-list probe. Model truth comes from the
// selected channel's official docs plus the bundled snapshot ([model API
// authority]); this gate must never contact the real service, so it needs no
// gateway credential and reads no key file. See
// docs/contracts/model-list-ownership.md and docs/contracts/plugin-qa.md.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHAT_MODELS } from '../plugins/omnimux/src/text/catalog.js'
import { readBundledSnapshot } from '../plugins/omnimux/src/catalog/cloud/bundled.js'
import { usableSnapshotModels } from '../plugins/omnimux/src/catalog/cloud/view.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const patchPath = join(root, 'plugins/omnimux/cordis.patch.yml')

// Scoped parser for the fixed patch structure (no runtime dependency; yaml is
// not a root dependency of this repo). The file shape is owned by this repo —
// if it changes, the parser fails loud instead of silently checking nothing.
function unquote(value) {
  if (
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    || (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
  ) {
    return value.slice(1, -1)
  }
  return value
}

function extract(text) {
  const lines = text.split(/\r?\n/)
  const rowLines = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('- id: ')) rowLines.push(i)
  }
  const start = rowLines.findIndex((i) => lines[i].slice('- id: '.length).trim() === 'llm-pi-ai')
  if (start === -1) {
    throw new Error('cordis.patch.yml has no `- id: llm-pi-ai` row — the plugin model list is gone')
  }
  const block = lines.slice(rowLines[start], rowLines[start + 1] ?? lines.length)
  let baseURL = null
  let reasoning = null
  let inModels = false
  let inEfforts = false
  /** @type {Array<{ id: string; contextWindow: number | null; input: string[]; reasoningEfforts: Record<string, string> | null }>} */
  const models = []
  for (const line of block) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const indent = line.length - line.trimStart().length
    const baseURLMatch = trimmed.match(/^baseURL: (.+)$/)
    if (baseURLMatch) {
      baseURL = baseURLMatch[1].trim()
      continue
    }
    const reasoningMatch = trimmed.match(/^reasoning: (.+)$/)
    if (reasoningMatch && !inModels) {
      reasoning = unquote(reasoningMatch[1].trim())
      continue
    }
    if (trimmed === 'models:') {
      inModels = true
      continue
    }
    if (!inModels) continue
    if (indent < 10) break // left the models block
    if (indent === 10) {
      inEfforts = false
      const idMatch = trimmed.match(/^- id: (.+)$/)
      if (idMatch) {
        models.push({
          id: idMatch[1].trim(),
          contextWindow: null,
          input: [],
          reasoningEfforts: null,
        })
      }
      continue
    }
    if (indent === 12 && models.length > 0) {
      const current = models[models.length - 1]
      inEfforts = trimmed === 'reasoningEfforts:'
      if (inEfforts) {
        current.reasoningEfforts = {}
        continue
      }
      const windowMatch = trimmed.match(/^contextWindow: (\d+)$/)
      if (windowMatch) current.contextWindow = Number(windowMatch[1])
      const inputMatch = trimmed.match(/^input: \[(.+)\]$/)
      if (inputMatch) current.input = inputMatch[1].split(',').map((part) => part.trim())
      continue
    }
    if (indent === 14 && inEfforts && models.length > 0) {
      const current = models[models.length - 1]
      const effortMatch = trimmed.match(/^([^:]+):\s*(.*)$/)
      if (effortMatch && current.reasoningEfforts) {
        current.reasoningEfforts[unquote(effortMatch[1].trim())] = unquote(effortMatch[2].trim())
      }
    }
  }
  return { baseURL, reasoning, models }
}

/**
 * The measured gateway matrix in CHAT_MODELS is the single source of truth for
 * image input. The patch must neither over-declare (image on a model the
 * matrix says is text-only) nor under-declare (matrix image-capable but no
 * `input` on the patch), because the chat adapter gates the image block on the
 * patch declaration and the one-shot tool gates on the matrix.
 * @param {Array<{ id: string; input: string[] }>} models
 * @param {Array<{ id: string; input: readonly string[] }>} chatModels
 * @returns {Array<{ id: string; problem: string }>}
 */
function modalityMismatches(models, chatModels) {
  const byId = new Map(chatModels.map((row) => [row.id, row.input]))
  const mismatches = []
  for (const model of models) {
    const measured = byId.get(model.id)
    if (!measured) continue // not on the whitelist; the whitelist check reports it
    const declared = model.input.includes('image')
    const capable = measured.includes('image')
    if (declared && !capable) {
      mismatches.push({ id: model.id, problem: 'patch declares image input but the measured matrix says text-only' })
    }
    if (capable && !declared) {
      mismatches.push({ id: model.id, problem: 'measured image-capable but the patch declares no image input' })
    }
  }
  return mismatches
}

const { baseURL, reasoning, models } = extract(readFileSync(patchPath, 'utf8'))
if (models.length === 0) {
  throw new Error('no models parsed from the llm-pi-ai row — patch structure changed?')
}

// Existence truth is the shipped snapshot, not a live probe: the same floor the
// runtime catalog intersects with. A model the snapshot does not sell is either
// a stale patch row or a snapshot that was never regenerated after the gateway
// delisted it — both must fail loud rather than ship.
const read = readBundledSnapshot()
if (!read.snapshot) {
  process.stderr.write(`verify-models: bundled gateway snapshot is unusable (${read.code ?? 'unknown'})\n`)
  process.exit(1)
}
const onShippedSnapshot = new Set(usableSnapshotModels(read.snapshot).keys())

const mismatches = modalityMismatches(models, CHAT_MODELS)
const patchIds = new Set(models.map((model) => model.id))
const whitelistMissing = CHAT_MODELS.filter((row) => !patchIds.has(row.id)).map((row) => row.id)
const reasoningMissing = models
  .filter((model) => model.reasoningEfforts == null || !Object.prototype.hasOwnProperty.call(model.reasoningEfforts, 'max'))
  .map((model) => model.id)
const reasoningDefaultWrong = reasoning === 'max' ? [] : [reasoning]

const table = models.map((model) => ({
  id: model.id,
  contextWindow: model.contextWindow,
  input: model.input.length > 0 ? model.input : null,
  reasoningEfforts: model.reasoningEfforts,
  onShippedSnapshot: onShippedSnapshot.has(model.id),
}))
const missing = table.filter((row) => !row.onShippedSnapshot).map((row) => row.id)

process.stdout.write(`${JSON.stringify({
  event: 'models',
  patch: 'plugins/omnimux/cordis.patch.yml',
  baseURL,
  reasoning,
  snapshotModels: onShippedSnapshot.size,
  configured: models.length,
  table,
  missing,
  modalityMismatches: mismatches,
  whitelistMissing,
  reasoningMissing,
  reasoningDefaultWrong,
  network: 'not-used',
  checkedAt: new Date().toISOString(),
})}\n`)

if (missing.length > 0 || mismatches.length > 0 || whitelistMissing.length > 0 || reasoningMissing.length > 0 || reasoningDefaultWrong.length > 0) {
  process.stderr.write(`verify-models: not in the shipped snapshot (${missing.join(', ')}); modality mismatch (${mismatches.map((row) => row.id).join(', ')}); whitelist not on patch (${whitelistMissing.join(', ')}); missing reasoning max (${reasoningMissing.join(', ')}); route reasoning (${reasoning})\n`)
  process.exit(1)
}
process.stderr.write('verify-models: ok (offline: modality + whitelist + reasoning + shipped snapshot)\n')
