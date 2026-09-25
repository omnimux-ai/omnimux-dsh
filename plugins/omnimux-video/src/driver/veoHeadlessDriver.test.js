import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVeoTaskRequest, GOOGLE_VIDS_PROTO_TEMPLATES } from '../contracts/veoContracts.js';
import { detectOpenCliEnvironment } from './veoHeadlessDriver.js';

test('veoContracts 与 veoHeadlessDriver 测试套件', async (t) => {

  await t.test('validateVeoTaskRequest 参数校验规则', () => {
    assert.equal(validateVeoTaskRequest(null).valid, false);
    assert.equal(validateVeoTaskRequest({}).valid, false);
    assert.equal(validateVeoTaskRequest({ prompt: '   ' }).valid, false);
    assert.equal(validateVeoTaskRequest({ prompt: 'hello', mode: 'invalid_mode' }).valid, false);
    assert.equal(validateVeoTaskRequest({ prompt: 'hello', parameters: { durationSec: 15 } }).valid, false);
    assert.equal(validateVeoTaskRequest({ prompt: 'hello', parameters: { durationSec: 10 } }).valid, true);
  });

  await t.test('GOOGLE_VIDS_PROTO_TEMPLATES 374 与 376 模板生成契约', () => {
    const t374 = GOOGLE_VIDS_PROTO_TEMPLATES.TEXT_TO_VIDEO('doc_test_1', 'a cat running', 10);
    assert.equal(t374[0], 374, '纯文生视频代码必须为 374');
    assert.equal(t374[3][3][0][0][2], 'a cat running');
    assert.equal(t374[4][15][8], 10, '时长必须为 10 秒');

    const t376 = GOOGLE_VIDS_PROTO_TEMPLATES.IMAGE_TO_VIDEO('doc_test_2', 'skincare model', 'AVL_token_123', 'UUID_abc', 8);
    assert.equal(t376[0], 376, '参考图生视频代码必须为 376');
    assert.equal(t376[2][25][0][0][7][1][11][8][3], 'AVL_token_123');
    assert.equal(t376[4][15][8], 8, '时长必须为 8 秒');
  });

  await t.test('detectOpenCliEnvironment 环境就绪探测', () => {
    const env = detectOpenCliEnvironment();
    assert.equal(typeof env.installed, 'boolean');
    assert.equal(typeof env.bridgeConnected, 'boolean');
    // 在当前开发机上必须探测到已安装
    assert.equal(env.installed, true);
  });

});
