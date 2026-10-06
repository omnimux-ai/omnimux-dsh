import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const slotWellsSrc = readFileSync(join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx'), 'utf8');
const uploadPaneSrc = readFileSync(join(here, '../../src/canvas/editor/components/ResourcePickerModal/LocalUploadPane.tsx'), 'utf8');

test('E2E: 本地素材导入——契约 type 全放行，取消不再重复提示', () => {
  // 契约 type（image/video/audio/document/text）直接放行；其它值（role）
  // 展开为五类全开，否则任何文件都被拦截为「不受支持」。
  assert.match(slotWellsSrc, /type === 'document'/);
  assert.match(slotWellsSrc, /\['image', 'video', 'audio', 'document', 'text'\]/);

  // ingestPaths 对空选择直接返回；同一次选择只提示一次 unsupported。
  assert.match(uploadPaneSrc, /if \(!paths\.length\) return;/);
  // ingestPaths 内 unsupported 提示至多一次（原来重复弹出两次）。
  const ingestBody = uploadPaneSrc.match(/const ingestPaths = useCallback\([\s\S]*?\n  \);/);
  assert.ok(ingestBody, 'ingestPaths callback exists');
  const toastCalls = ingestBody[0].match(/toast\.warning\(t\('picker\.unsupported'\)\)/g) || [];
  assert.equal(toastCalls.length, 1, `expected exactly 1 unsupported toast in ingestPaths, got ${toastCalls.length}`);

  // handleClick 直接走原生选择器，不再先弹 HTML input 再兜底 chooseNative
  // —— File.path 在新版 Electron 已移除，旧逻辑会导致用户被迫选两次文件。
  const handleClickBody = uploadPaneSrc.match(/const handleClick = useCallback\([\s\S]*?\n  \);/);
  assert.ok(handleClickBody, 'handleClick callback exists');
  assert.match(handleClickBody[0], /void chooseNative\(\);/);
  assert.ok(!/fileInputRef\.current\.click\(\)/.test(handleClickBody[0]), 'handleClick must not click the hidden input (File.path removed)');
});
