import test from 'node:test';
import assert from 'node:assert/strict';
import { auditInlineMocks } from './verify-no-inline-mock.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('verify-no-inline-mock: 成功放行纯净的前端代码', () => {
  const { violations, scannedCount } = auditInlineMocks();
  assert.equal(violations.length, 0, `生产代码中不得含有硬编码假数据违规项: ${JSON.stringify(violations)}`);
  assert.ok(scannedCount > 0, '必须成功扫描客户端生产代码');
});

test('verify-no-inline-mock: 负向自测，精准捕获 DEFAULT_PRODUCTS 和业务假数据关键字', () => {
  const testDir = join(tmpdir(), `test-mock-gate-${Date.now()}`);
  const clientDir = join(testDir, 'plugins/omnimux-workflow/src/client');
  mkdirSync(clientDir, { recursive: true });

  const badFile = join(clientDir, 'BadComponent.jsx');
  writeFileSync(
    badFile,
    `
    const DEFAULT_PRODUCTS = [{ id: '1', name: '智能降噪真无线耳机' }];
    export function BadComp() {
      return <div>{DEFAULT_PRODUCTS[0].name}</div>;
    }
    `,
    'utf-8'
  );

  const { violations } = auditInlineMocks(testDir);
  rmSync(testDir, { recursive: true, force: true });

  assert.ok(violations.length >= 2, '必须同时捕获 DEFAULT_PRODUCTS 变量与假数据关键字');
  assert.ok(violations.some((v) => v.reason.includes('DEFAULT_PRODUCTS')));
  assert.ok(violations.some((v) => v.reason.includes('智能降噪真无线耳机')));
});
