/**
 * ACL mapper + pick interpretation + injected-fetch library client (Issue #166).
 * Zero real osascript; picker is always mocked.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  interpretPickResponse,
  libraryPreviewUrl,
  mapLibraryAssetToSubject,
  normalizeLibraryType,
  SUBJECT_CATEGORY_TABS,
  TYPE_CITE,
} from './assetsLibraryMapper.ts';
import { createAssetsLibraryClient } from './assetsLibraryClient.ts';
import { flattenProjectAssets } from '../editor/hooks/flattenProjectAssets.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('6. mapLibraryAssetToSubject 六类 + 未知 → custom', () => {
  const types = ['character', 'scene', 'style', 'prop', 'knowledge', 'custom'];
  for (const type of types) {
    assert.equal(normalizeLibraryType(type), type);
    const subject = mapLibraryAssetToSubject({
      id: `ast_${type}`,
      name: `name-${type}`,
      type,
      tags: ['extra'],
      files: [{ id: `fil_${type}` }],
      cover_file_id: `fil_${type}`,
      updated_at: '2026-08-29T00:00:00.000Z',
    });
    assert.equal(subject.id, `ast_${type}`);
    assert.equal(subject.type, type);
    assert.equal(subject.tags[0], TYPE_CITE[type]);
    assert.equal(subject.itemCount, 1);
    assert.equal(subject.avatar, libraryPreviewUrl(`ast_${type}`, `fil_${type}`));
    assert.match(subject.avatar, /^\/omnimux\/assets\/library\/preview\?id=/);
  }
  assert.equal(normalizeLibraryType('mecha'), 'custom');
  assert.equal(normalizeLibraryType('lora'), 'custom');
  assert.equal(normalizeLibraryType(undefined), 'custom');
  const unknown = mapLibraryAssetToSubject({ id: 'ast_x', name: '未知', type: 'mecha' });
  assert.equal(unknown.type, 'custom');
  assert.equal(unknown.tags[0], '自定义');
  assert.equal(unknown.files, undefined);

  const withPath = mapLibraryAssetToSubject({
    id: 'ast_path',
    name: '夜景',
    type: 'scene',
    files: [{ id: 'fil_night', real_path: '/tmp/night.png', original_name: 'night.png' }],
    cover_file_id: 'fil_night',
  });
  assert.deepEqual(withPath.files, [
    { id: 'fil_night', real_path: '/tmp/night.png', original_name: 'night.png' },
  ]);

  assert.deepEqual(
    SUBJECT_CATEGORY_TABS.map((tab) => tab.id),
    ['all', 'character', 'scene', 'style', 'prop', 'knowledge', 'custom'],
  );
  assert.deepEqual(
    SUBJECT_CATEGORY_TABS.map((tab) => tab.label),
    ['全部', '角色', '场景', '风格包', '道具', '知识包', '自定义'],
  );
});

test('7. pick 取消 → 不报错、不写盘；501 不回退 input', async () => {
  const cancelled = interpretPickResponse({
    ok: true,
    status: 200,
    body: { path: null, paths: [] },
  });
  assert.equal(cancelled.kind, 'cancel');

  const unsupported = interpretPickResponse({
    ok: false,
    status: 501,
    body: { error: 'picker-unsupported' },
  });
  assert.equal(unsupported.kind, 'unsupported');

  const writes = [];
  const client = createAssetsLibraryClient({
    fetch: async (url, init) => {
      if (String(url).includes('/omnimux/assets/pick')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ path: null, paths: [] }),
        };
      }
      if (String(url).includes('/omnimux/assets/library') && init?.method === 'GET') {
        return { ok: false, status: 404, json: async () => ({ error: 'not-found' }) };
      }
      writes.push({ url, init });
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  const picked = await client.pickAssets('file');
  assert.equal(picked.interpretation.kind, 'cancel');
  assert.equal(writes.length, 0);

  const listed = await client.listLibrary();
  assert.equal(listed.ok, false);
  assert.equal(listed.status, 404);
  assert.deepEqual(listed.subjects, []);

  const network = createAssetsLibraryClient({
    fetch: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  const failed = await network.listLibrary();
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.subjects, []);
  assert.equal(failed.error, 'network');
});

test('树按 parentId 展平至少两层', () => {
  const assets = flattenProjectAssets({
    schemaVersion: 1,
    rev: 2,
    folders: [
      { id: 'fld_a', name: 'A', parentId: null, updatedAt: 1 },
      { id: 'fld_b', name: 'B', parentId: 'fld_a', updatedAt: 2 },
    ],
    items: [
      {
        id: 'ast_1',
        name: 'hero.png',
        type: 'image',
        parentId: 'fld_b',
        relative_path: 'assets/imported/hero.png',
        updatedAt: 3,
      },
    ],
  }, 'ws_preview01');
  const folderA = assets.find((row) => row.id === 'fld_a');
  const folderB = assets.find((row) => row.id === 'fld_b');
  const file = assets.find((row) => row.id === 'ast_1');
  assert.equal(folderA?.parentId ?? null, null);
  assert.equal(folderB?.parentId, 'fld_a');
  assert.equal(file?.parentId, 'fld_b');
  assert.equal(file?.real_path, undefined);
  assert.equal(file?.relative_path, 'assets/imported/hero.png');
  assert.equal(file?.workspaceId, 'ws_preview01');
  assert.match(file?.previewUrl || '', /\/omnimux-workflow\/api\/workspaces\/ws_preview01\/file\?rel=/);
});

test('createLibraryAsset 可携带 files[].real_path', async () => {
  let posted = null;
  const client = createAssetsLibraryClient({
    fetch: async (url, init) => {
      posted = { url: String(url), body: JSON.parse(String(init?.body || '{}')) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          asset: {
            id: 'ast_new',
            name: posted.body.name,
            type: 'custom',
            files: posted.body.files,
          },
        }),
      };
    },
  });
  const created = await client.createLibraryAsset('夜景', 'custom', [
    { real_path: '/tmp/night.png', original_name: 'night.png' },
  ]);
  assert.equal(created.ok, true);
  assert.equal(posted.body.name, '夜景');
  assert.deepEqual(posted.body.files, [
    { real_path: '/tmp/night.png', original_name: 'night.png' },
  ]);
  assert.equal(created.subject?.files?.[0]?.real_path, '/tmp/night.png');
});

test('SubjectLibraryView lucide-react 命名导入必须绑定 Layers（防卡片徽章 ReferenceError）', () => {
  const source = readFileSync(
    join(here, '../editor/components/assets/views/SubjectLibraryView.tsx'),
    'utf8',
  );
  const importMatch = source.match(/import\s*\{([\s\S]*?)\}\s*from\s*['"]lucide-react['"]/);
  assert.ok(importMatch, 'SubjectLibraryView.tsx 必须有 lucide-react 命名导入');
  const imported = importMatch[1]
    .split(',')
    .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
  assert.ok(
    imported.includes('Layers'),
    `lucide-react import 必须含 Layers，实际: ${imported.join(', ')}`,
  );
  assert.match(
    source,
    /<Layers\b/,
    '卡片计数徽章必须使用 <Layers />，import 绑定才有运行时意义',
  );
});

test('listLibrary 转发 AbortSignal；中止后返回 aborted 而非 network', async () => {
  const controller = new AbortController();
  let forwarded = false;
  const client = createAssetsLibraryClient({
    fetch: async (_url, init) => {
      forwarded = Boolean(init?.signal);
      if (init?.signal?.aborted) {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ assets: [{ id: 'ast_late', name: 'late', type: 'custom' }] }),
      };
    },
  });
  controller.abort();
  const result = await client.listLibrary({}, controller.signal);
  assert.equal(forwarded, true);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'aborted');
  assert.deepEqual(result.subjects, []);
});
