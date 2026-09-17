import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendJson, SECRET_PATTERN } from './helpers.ts';
import { buildModelCatalog } from '../../../omnimux/src/catalog/list.js';
import { projectCanvasCatalog } from '../shared/generationPolicy.ts';

function createMockResponse() {
  return {
    statusCode: 0,
    headers: {},
    endedBody: '',
    writeHead(status, headers) {
      this.statusCode = status;
      Object.assign(this.headers, headers);
    },
    end(data) {
      this.endedBody = data;
    },
  };
}

test('SECRET_PATTERN does not falsely match task-pro or model identifiers', () => {
  assert.equal(SECRET_PATTERN.test('seedance-2-0-task-pro'), false);
  assert.equal(SECRET_PATTERN.test('wireGroup: "seedance-2-0-task-pro"'), false);
  assert.equal(SECRET_PATTERN.test('task-xxx'), false);
  assert.equal(SECRET_PATTERN.test('normal-model-description'), false);
});

test('SECRET_PATTERN strictly matches real API secrets and access_token', () => {
  assert.equal(SECRET_PATTERN.test('sk-1234567890abcdef'), true);
  assert.equal(SECRET_PATTERN.test('sk-proj-1234567890abcdef'), true);
  assert.equal(SECRET_PATTERN.test('{"key": "sk-1234567890"}'), true);
  assert.equal(SECRET_PATTERN.test('access_token'), true);
  assert.equal(SECRET_PATTERN.test('{"token": "access_token"}'), true);
});

test('sendJson allows legitimate catalog containing task-pro wireGroup without 500 refusal', () => {
  const res = createMockResponse();
  const legitimateBody = {
    models: [
      { id: 'seedance-2-0', wireGroup: 'seedance-2-0-task-pro' },
    ],
  };

  sendJson(res, 200, legitimateBody);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(res.endedBody), legitimateBody);
});

test('sendJson guards against real secret leaks by returning 500', () => {
  const res = createMockResponse();
  const leakingBody = {
    apiKey: 'sk-abcdef1234567890',
  };

  sendJson(res, 200, leakingBody);

  assert.equal(res.statusCode, 500);
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(res.endedBody), { error: 'refused to emit a secret' });
});

test('sendJson handles live projected canvas catalog with 200 OK (resolving Issue #2182)', () => {
  const raw = buildModelCatalog({ env: {} });
  const catalog = projectCanvasCatalog(raw);
  const res = createMockResponse();

  sendJson(res, 200, catalog);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/json; charset=utf-8');
  const parsed = JSON.parse(res.endedBody);
  assert.equal(parsed.source, 'omnimux');
  assert.ok(parsed.models.length > 0, 'Catalog must contain models');
  assert.ok(parsed.text.length > 0, 'Catalog must contain text models');
  assert.ok(parsed.video.length > 0, 'Catalog must contain video models');
  assert.ok(parsed.audio.length > 0, 'Catalog must contain audio models');
});
