/**
 * 资产侧栏 → 导入节点：路径字段优先级与 MIME 映射。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readAssetRealPath,
  draftFromAsset,
  classifyAssetImport,
} from './assetImportAdapter.ts';
import { planStandaloneImportNodes } from './resourcePickerPolicy.ts';

test('readAssetRealPath：real_path 优先于 files[0]', () => {
  assert.equal(
    readAssetRealPath({
      real_path: '/Users/me/hero.png',
      files: [{ path: '/Users/me/other.jpg' }],
    }),
    '/Users/me/hero.png',
  );
  assert.equal(
    readAssetRealPath({ realPath: '/Users/me/clip.mp4' }),
    '/Users/me/clip.mp4',
  );
  assert.equal(
    readAssetRealPath({ files: [{ real_path: '/Users/me/voice.wav' }] }),
    '/Users/me/voice.wav',
  );
  assert.equal(
    readAssetRealPath({ files: [{ path: '/Users/me/still.png' }] }),
    '/Users/me/still.png',
  );
  assert.equal(readAssetRealPath({ name: 'no-path' }), '');
  assert.equal(readAssetRealPath(null), '');
  assert.equal(readAssetRealPath(undefined), '');
});

test('classifyAssetImport：png / mp4 / wav 按文件名定 materialType', () => {
  const png = classifyAssetImport({ name: '截图.png', real_path: '/Users/me/截图.png' });
  assert.equal(png.ok, true);
  assert.equal(png.draft.materialType, 'image');
  assert.equal(png.draft.realPath, '/Users/me/截图.png');

  const mp4 = classifyAssetImport({ real_path: '/tmp/clip.mp4' });
  assert.equal(mp4.ok, true);
  assert.equal(mp4.draft.materialType, 'video');

  const wav = classifyAssetImport({ files: [{ real_path: '/tmp/voice.wav', original_name: 'voice.wav' }] });
  assert.equal(wav.ok, true);
  assert.equal(wav.draft.materialType, 'audio');
});

test('classifyAssetImport：角色包 type 不覆盖文件 MIME', () => {
  const result = classifyAssetImport({
    type: 'character',
    name: '女主',
    real_path: '/Users/me/hero.png',
  });
  assert.equal(result.ok, true);
  assert.equal(result.draft.materialType, 'image');
  assert.equal(result.draft.name, '女主');
});

test('classifyAssetImport：无路径 → needPath；pdf → unsupported', () => {
  assert.deepEqual(
    classifyAssetImport({ type: 'image', previewUrl: 'blob:abc', prompt: 'x' }),
    { ok: false, reason: 'needPath' },
  );
  assert.deepEqual(
    classifyAssetImport({ real_path: '/Users/me/notes.pdf' }),
    { ok: false, reason: 'unsupported' },
  );
  assert.equal(draftFromAsset({ previewUrl: 'https://cdn/x.png' }), null);
});

test('有路径的资产 draft 可经 planStandaloneImportNodes 落导入节点', () => {
  const draft = draftFromAsset({ name: 'hero.png', real_path: '/Users/me/hero.png' });
  const plan = planStandaloneImportNodes({ files: [draft], origin: { x: 40, y: 80 } });
  assert.equal(plan.hasWork, true);
  assert.equal(plan.addNodes.length, 1);
  assert.equal(plan.addNodes[0].data.nodeKind, 'import');
  assert.equal(plan.addNodes[0].data.selectedTool, 'import');
  assert.equal(plan.addNodes[0].data.realPath, '/Users/me/hero.png');
  assert.equal(plan.addNodes[0].data.materialType, 'image');
});

test('project asset keeps its workspace-relative identity through insertion, save and reopen', async () => {
  const { flattenProjectAssets } = await import('../hooks/flattenProjectAssets.ts');
  const { sanitizeNodes, signatureOf } = await import('../../bridge/persistSanitize.ts');
  const { projectFileMediaUrl } = await import('../../../shared/localMedia.ts');
  const workspaceId = 'ws_project-A';
  const relativePath = 'assets/imported/参考图.png';
  const [asset] = flattenProjectAssets({
    schemaVersion: 1, rev: 3, folders: [], items: [{
      id: 'asset_hero', name: 'hero.png', type: 'image', parentId: null,
      relative_path: relativePath, sizeBytes: 1024, mimeType: 'image/png', updatedAt: 1,
    }],
  }, workspaceId);
  assert.equal(asset.real_path, undefined);
  assert.equal(asset.relative_path, relativePath);
  assert.equal(asset.workspaceId, workspaceId);
  const classified = classifyAssetImport(asset, workspaceId);
  assert.equal(classified.ok, true);
  assert.equal('realPath' in classified.draft, false);
  const plan = planStandaloneImportNodes({ files: [classified.draft], origin: { x: 4, y: 8 } });
  assert.equal(plan.hasWork, true);
  const node = plan.addNodes[0];
  const expectedUrl = projectFileMediaUrl(workspaceId, relativePath);
  assert.equal(node.data.mediaUrl, expectedUrl);
  assert.equal(node.data.relativePath, relativePath);
  assert.equal(node.data.assetId, 'asset_hero');
  assert.equal(node.data.mediaAssets[0].url, expectedUrl);
  assert.equal(node.data.sizeBytes, 1024);
  assert.equal(node.data.nodeKind, 'import');
  assert.equal(node.data.selectedTool, 'import');
  const saved = sanitizeNodes(plan.addNodes, { workspaceId });
  const reopened = JSON.parse(JSON.stringify(saved));
  assert.equal(reopened[0].data.relativePath, relativePath);
  assert.equal(reopened[0].data.mediaUrl, expectedUrl);
  assert.equal(reopened[0].data.mediaAssets[0].relativePath, relativePath);
  assert.equal(reopened[0].data.mediaAssets[0].url, expectedUrl);
  assert.equal(JSON.stringify(reopened).includes('/api/local-file'), false);
  assert.equal('realPath' in reopened[0].data, false);
  assert.equal(signatureOf(plan.addNodes, [], { workspaceId }), signatureOf(reopened, [], { workspaceId }));
});

test('project import requires matching source and target workspace; relative real_path is rejected', () => {
  const project = { id: 'a', name: 'hero.png', relative_path: 'assets/imported/hero.png', workspaceId: 'A' };
  assert.deepEqual(classifyAssetImport(project), { ok: false, reason: 'needPath' });
  assert.deepEqual(classifyAssetImport({ ...project, workspaceId: undefined }, 'A'), { ok: false, reason: 'needPath' });
  assert.deepEqual(classifyAssetImport(project, 'B'), { ok: false, reason: 'needPath' });
  assert.deepEqual(classifyAssetImport({ ...project, relative_path: '../hero.png' }, 'A'), { ok: false, reason: 'needPath' });
  assert.deepEqual(classifyAssetImport({ ...project, relative_path: '/tmp/hero.png' }, 'A'), { ok: false, reason: 'needPath' });
  assert.deepEqual(classifyAssetImport({ real_path: 'assets/imported/hero.png' }, 'A'), { ok: false, reason: 'needPath' });
  assert.equal(readAssetRealPath({ files: [{ path: 'assets/imported/hero.png' }] }), '');
});

test('native absolute paths remain native; path-only relative drafts cannot create nodes', async () => {
  const { draftFromRealPath } = await import('./localFileDraft.ts');
  const { localFileMediaUrl } = await import('../../../shared/localMedia.ts');
  assert.equal(draftFromRealPath('assets/imported/hero.png'), null);
  const classified = classifyAssetImport({ real_path: '/tmp/hero.png' }, 'A');
  assert.equal(classified.ok, true);
  const plan = planStandaloneImportNodes({ files: [classified.draft], origin: { x: 0, y: 0 } });
  assert.equal(plan.addNodes[0].data.realPath, '/tmp/hero.png');
  assert.equal(plan.addNodes[0].data.mediaUrl, localFileMediaUrl('/tmp/hero.png'));
  assert.equal('relativePath' in plan.addNodes[0].data, false);
  const invalid = planStandaloneImportNodes({
    files: [{ ...classified.draft, realPath: 'assets/imported/hero.png' }], origin: { x: 0, y: 0 },
  });
  assert.equal(invalid.hasWork, false);
  assert.equal(invalid.addNodes, undefined);
});

test('unscoped project drafts are rejected by the planner without creating a broken node', () => {
  const draft = { id: 'project', name: 'hero.png', mime: 'image/png', size: null, materialType: 'image', relativePath: 'assets/imported/hero.png' };
  const plan = planStandaloneImportNodes({ files: [draft], origin: { x: 0, y: 0 } });
  assert.equal(plan.hasWork, false);
  assert.equal(plan.addNodes, undefined);
  assert.equal(plan.rejected[0].reason, 'unsupported');
});
