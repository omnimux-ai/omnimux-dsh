/**
 * Codec dispatch + malformed input tests: every bad input must come back as a
 * readable error, never as an empty-but-successful document and never as an
 * uncaught exception.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  detectComfyWorkflowFormat,
  parseComfyWorkflow,
  parseComfyWorkflowValue,
  stringifyComfyWorkflow,
} from './codec.ts';

test('malformed JSON text returns an invalid-json error instead of throwing', () => {
  const result = parseComfyWorkflow('{ this is not json');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'invalid-json');
    assert.equal(typeof result.error.message, 'string');
    assert.ok(result.error.message.length > 0);
  }
});

test('empty text and non-string input return an invalid-json error', () => {
  const empty = parseComfyWorkflow('');
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error.code, 'invalid-json');

  const wrongType = parseComfyWorkflow(undefined);
  assert.equal(wrongType.ok, false);
  if (!wrongType.ok) assert.equal(wrongType.error.code, 'invalid-json');
});

test('a non-object root (array / null / number) returns an invalid-root error', () => {
  for (const text of ['[]', 'null', '42', '"workflow"']) {
    const result = parseComfyWorkflow(text);
    assert.equal(result.ok, false, `expected ${text} to fail`);
    if (!result.ok) assert.equal(result.error.code, 'invalid-root');
  }
});

test('version dispatch: 0.4 -> v0.4, 1 -> v1, structural fallback when version is absent', () => {
  assert.equal(detectComfyWorkflowFormat({ version: 0.4 }), 'v0.4');
  assert.equal(detectComfyWorkflowFormat({ version: 1 }), 'v1');
  assert.equal(detectComfyWorkflowFormat({ state: {} }), 'v1');
  assert.equal(detectComfyWorkflowFormat({ last_node_id: 0, nodes: [] }), 'v0.4');
  assert.equal(detectComfyWorkflowFormat({ version: 2 }), null);
  assert.equal(detectComfyWorkflowFormat([]), null);
});

test('an unsupported version is reported, never guessed', () => {
  const result = parseComfyWorkflow(JSON.stringify({ version: 2, nodes: [], links: [] }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'unsupported-version');
    assert.equal(result.error.path, 'version');
  }
});

test('a document without any version marker is reported as unsupported-version', () => {
  const result = parseComfyWorkflow(JSON.stringify({ hello: 'world' }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'unsupported-version');
});

test('parseComfyWorkflowValue accepts an already-decoded object', () => {
  const value = { version: 0.4, last_node_id: 0, last_link_id: 0, nodes: [], links: [], groups: [], config: {}, extra: {} };
  const result = parseComfyWorkflowValue(value);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.format, 'v0.4');
  assert.equal(result.document.nodes.length, 0);
});

test('a parsed document can be re-encoded without a ComfyUI backend', () => {
  const result = parseComfyWorkflow(JSON.stringify({
    version: 1,
    state: { lastGroupId: 0, lastNodeId: 0, lastLinkId: 0, lastRerouteId: 0 },
    groups: [],
    nodes: [],
    links: [],
    floatingLinks: [],
    reroutes: [],
    extra: {},
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const text = stringifyComfyWorkflow(result.document);
  assert.deepEqual(JSON.parse(text), {
    version: 1,
    state: { lastGroupId: 0, lastNodeId: 0, lastLinkId: 0, lastRerouteId: 0 },
    groups: [],
    nodes: [],
    links: [],
    floatingLinks: [],
    reroutes: [],
    extra: {},
  });
});
