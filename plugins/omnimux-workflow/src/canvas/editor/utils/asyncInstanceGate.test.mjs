import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAsyncInstanceGate } from './asyncInstanceGate.ts';

test('tickets cannot cross instances or survive cancellation', () => {
  const a = createAsyncInstanceGate(), b = createAsyncInstanceGate();
  const ticket = a.capture();
  assert.equal(a.isCurrent(ticket), true);
  assert.equal(b.isCurrent(ticket), false);
  a.invalidate();
  assert.equal(a.isCurrent(ticket), false);
  assert.equal(a.isCurrent(a.capture()), true);
});

test('retired callbacks cannot acquire valid tickets; reactivation does not revive old work', () => {
  const gate = createAsyncInstanceGate();
  const ticket = gate.capture();
  gate.deactivate();
  assert.equal(gate.isCurrent(gate.capture()), false);
  gate.activate();
  assert.equal(gate.isCurrent(ticket), false);
  assert.equal(gate.isCurrent(gate.capture()), true);
});
