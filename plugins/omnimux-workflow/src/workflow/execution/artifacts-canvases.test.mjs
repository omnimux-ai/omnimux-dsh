/**
 * T03: generated media lands in project artifacts/; bound DAG lives in
 * `.omnimux/canvases/`. Ledger JSON must not contain absolute /Users paths.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createWorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { createProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';
import { persistGeneratedArtifact } from './persistGeneratedArtifact.ts';
import { resolveProjectPaths } from '../../projects/paths.ts';

function seedProject(libraryRoot, workspaceId) {
  const projectRoot = join(libraryRoot, workspaceId);
  mkdirSync(join(projectRoot, '.omnimux'), { recursive: true });
  writeFileSync(
    join(projectRoot, '.omnimux', 'project.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: `p_${workspaceId}`,
      title: 'T03',
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
      sessionId: null,
      canvasWorkspaceIds: [workspaceId],
    }),
    'utf8',
  );
  return projectRoot;
}

test('绑定后 DAG 迁到项目 canvases，home canvas.json 仍保留元数据副本', () => {
  const dir = mkdtempSync(join(tmpdir(), 't03-canvas-'));
  try {
    const workspacesDir = join(dir, 'workspaces');
    const libraryRoot = join(dir, 'library');
    mkdirSync(workspacesDir, { recursive: true });
    mkdirSync(libraryRoot, { recursive: true });
    const bindings = new Map();
    const store = createWorkspaceStore({
      workspacesDir,
      resolveProjectRoot: (id) => bindings.get(id) ?? null,
    });
    const snapshot = store.create('T03 画布');
    const home = join(workspacesDir, snapshot.id, 'canvas.json');
    assert.equal(existsSync(home), true);

    const projectRoot = seedProject(libraryRoot, snapshot.id);
    bindings.set(snapshot.id, { path: projectRoot });

    const loaded = store.get(snapshot.id);
    assert.equal(loaded.id, snapshot.id);
    const projectFile = join(projectRoot, '.omnimux', 'canvases', `${snapshot.id}.json`);
    assert.equal(existsSync(projectFile), true);
    assert.equal(store.canvasFileOf(snapshot.id), projectFile);
    assert.equal(existsSync(home), true);
    const disk = JSON.parse(readFileSync(projectFile, 'utf8'));
    assert.equal(disk.name, 'T03 画布');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('生成物 move 进 artifacts/ 并登记账本；JSON 无绝对路径', async () => {
  const dir = mkdtempSync(join(tmpdir(), 't03-art-'));
  try {
    const workspacesDir = join(dir, 'workspaces');
    const libraryRoot = join(dir, 'library');
    mkdirSync(workspacesDir, { recursive: true });
    mkdirSync(libraryRoot, { recursive: true });
    const workspaceId = 'ws_t03artifact';
    mkdirSync(join(workspacesDir, workspaceId), { recursive: true });
    writeFileSync(join(workspacesDir, workspaceId, 'canvas.json'), '{"id":"marker"}\n', 'utf8');
    const projectRoot = seedProject(libraryRoot, workspaceId);
    const assetsStore = createProjectAssetsStore({
      workspacesDir,
      resolveProjectRoot: (id) => (id === workspaceId ? { path: projectRoot } : null),
    });
    const tmp = join(dir, 'executions', 'n1.svg');
    mkdirSync(join(tmp, '..'), { recursive: true });
    writeFileSync(tmp, '<svg xmlns="http://www.w3.org/2000/svg" />', 'utf8');

    const persisted = await persistGeneratedArtifact({
      workspaceId,
      nodeId: 'n1',
      nodeType: 'material',
      tmpAbs: tmp,
      materialType: 'image',
      resolveProjectRoot: (id) => (id === workspaceId ? { path: projectRoot } : null),
      registerGenerated: (id, payload) => assetsStore.registerGenerated(id, payload),
      prompt: '一张图',
      modelId: 'mock',
    });
    assert.match(persisted.relativePath, /^artifacts\/\d+_n1\.svg$/);
    assert.match(persisted.url, /\/api\/workspaces\/ws_t03artifact\/file\?rel=/);
    assert.equal(existsSync(tmp), false);
    const dest = join(projectRoot, persisted.relativePath);
    assert.equal(existsSync(dest), true);
    const paths = resolveProjectPaths(projectRoot);
    assert.equal(dest.startsWith(paths.artifactsDir), true);

    const ledgerPath = join(projectRoot, '.omnimux', 'assets.json');
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    assert.equal(ledger.items.length, 1);
    assert.equal(ledger.items[0].relative_path, persisted.relativePath);
    assert.equal(ledger.items[0].lineage.generatorNodeId, 'n1');
    assert.equal(JSON.stringify(ledger).includes('/Users'), false);
    assert.equal(JSON.stringify(ledger).includes(projectRoot), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PNG 二进制即使临时文件叫 .svg 也按真实扩展名落盘', async () => {
  const dir = mkdtempSync(join(tmpdir(), 't03-art-png-'));
  try {
    const workspacesDir = join(dir, 'workspaces');
    const libraryRoot = join(dir, 'library');
    mkdirSync(workspacesDir, { recursive: true });
    mkdirSync(libraryRoot, { recursive: true });
    const workspaceId = 'ws_t03png';
    mkdirSync(join(workspacesDir, workspaceId), { recursive: true });
    writeFileSync(join(workspacesDir, workspaceId, 'canvas.json'), '{"id":"marker"}\n', 'utf8');
    const projectRoot = seedProject(libraryRoot, workspaceId);
    const assetsStore = createProjectAssetsStore({
      workspacesDir,
      resolveProjectRoot: (id) => (id === workspaceId ? { path: projectRoot } : null),
    });
    const tmp = join(dir, 'executions', 'n2.svg');
    mkdirSync(join(tmp, '..'), { recursive: true });
    writeFileSync(tmp, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]));

    const persisted = await persistGeneratedArtifact({
      workspaceId,
      nodeId: 'n2',
      nodeType: 'material',
      tmpAbs: tmp,
      materialType: 'image',
      resolveProjectRoot: (id) => (id === workspaceId ? { path: projectRoot } : null),
      registerGenerated: (id, payload) => assetsStore.registerGenerated(id, payload),
      prompt: '一张图',
      modelId: 'gpt-image-2.5',
    });
    assert.match(persisted.relativePath, /^artifacts\/\d+_n2\.png$/);
    assert.equal(existsSync(join(projectRoot, persisted.relativePath)), true);
    assert.equal(existsSync(tmp), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('未绑定项目 persistGeneratedArtifact → project-required', async () => {
  await assert.rejects(
    () => persistGeneratedArtifact({
      workspaceId: 'ws_unbound01',
      nodeId: 'n1',
      nodeType: 'material',
      tmpAbs: '/tmp/nope.svg',
      materialType: 'image',
      resolveProjectRoot: () => null,
      registerGenerated: () => ({ items: [] }),
    }),
    (error) => error.code === 'project-required',
  );
});
