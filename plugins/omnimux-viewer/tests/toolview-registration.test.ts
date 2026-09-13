/**
 * Slot ranks: the one thing keeping a key clash from taking the client half down.
 *
 * `tool.call.toolview` throws on a second entry for the same key at the same
 * rank, and the throw rolls back the whole `apply()` — the `display_file` card
 * disappears with the offender.
 */

import { deepEqual, equal, ok } from 'node:assert/strict'
import { test } from 'node:test'
import { DISPLAY_TOOL, READ_IMAGE_TOOL } from '../src/contract.ts'
import {
  READ_IMAGE_FALLBACK_PRIORITY,
  TOOLVIEW_REGISTRATIONS,
} from '../src/client/registration.ts'

test('every rendered key once, and never two at the same rank', () => {
  const cells = new Set<string>()
  for (const { key, priority } of TOOLVIEW_REGISTRATIONS) {
    const cell = `${key}@${priority ?? 0}`
    ok(!cells.has(cell), `a second ${cell} would throw and take the client half down`)
    cells.add(cell)
  }
  deepEqual(
    TOOLVIEW_REGISTRATIONS.map(registration => registration.key).sort(),
    [DISPLAY_TOOL, READ_IMAGE_TOOL].sort(),
  )
})

test('display_file is owned here; read_image yields to the shipped row', () => {
  const display = TOOLVIEW_REGISTRATIONS.find(registration => registration.key === DISPLAY_TOOL)
  const readImage = TOOLVIEW_REGISTRATIONS.find(registration => registration.key === READ_IMAGE_TOOL)
  equal(display?.priority, undefined, 'rank 0: this plugin owns display_file')
  equal(readImage?.priority, READ_IMAGE_FALLBACK_PRIORITY)
  ok(READ_IMAGE_FALLBACK_PRIORITY > 0, 'rank 0 belongs to the harness row, which renders first')
})
