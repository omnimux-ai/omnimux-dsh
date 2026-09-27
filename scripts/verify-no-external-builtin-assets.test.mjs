import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditBuiltinAssets } from './verify-no-external-builtin-assets.mjs';

test('verify-no-external-builtin-assets: audits current codebase with 0 violations', () => {
  const result = auditBuiltinAssets();
  assert.equal(result.passed, true, '内置工程文件不应包含任何第三方外部 CDN 违规链接');
  assert.deepEqual(result.violations, []);
});
