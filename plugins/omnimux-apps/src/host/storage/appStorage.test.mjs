/**
 * plugins/omnimux-apps/src/host/storage/appStorage.test.mjs
 *
 * Unit test suite for Apps Domain Atomic File Storage (T02).
 * Verifies POSIX atomic write, immutable version conflict detection,
 * app.json index maintenance, getManifest, listApps, and recordTask.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { AppStorage, AppStorageError } from './appStorage.ts';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omnimux-apps-test-'));
}

function createSampleManifest(appId = 'app_video_tester', version = '1.0.0', category = 'video') {
  return {
    appId,
    version,
    schemaVersion: '1.0',
    createdAt: '2026-09-09T10:00:00.000Z',
    metadata: {
      name: `Test App ${appId}`,
      category,
      description: 'Test application for storage validation',
      iconSvg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
      coverUrl: 'https://example.com/cover.png',
    },
    workflowBinding: {
      workspaceId: 'ws_sample_01',
      workflowHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      snapshot: {
        nodes: [{ id: 'n1' }],
        edges: [],
      },
    },
    formSchema: {
      type: 'object',
      required: ['prompt'],
      additionalProperties: false,
      properties: {
        prompt: {
          type: 'string',
          title: 'Prompt',
          widget: 'textarea',
          default: 'sample prompt',
        },
      },
    },
    fieldMappings: {
      prompt: {
        nodeId: 'n1',
        targetField: 'prompt',
        mappingType: 'text',
        widget: 'textarea',
        required: true,
        defaultValue: 'sample prompt',
      },
    },
    showcase: {
      mode: 'gallery',
      items: [
        {
          id: 'sc1',
          mediaType: category,
          mediaUrl: 'https://example.com/out.mp4',
        },
      ],
    },
    demoSnapshot: {
      prompt: 'sample prompt',
    },
  };
}

test('T02.1: saveManifest writes manifest@<version>.json and creates app.json index', async (t) => {
  const tempDir = createTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const storage = new AppStorage({ baseDir: tempDir });
  const manifest = createSampleManifest('app_video_fast', '1.0.0', 'video');

  const saveRes = await storage.saveManifest(manifest);
  assert.equal(saveRes.success, true);
  assert.ok(fs.existsSync(saveRes.filePath));
  assert.equal(path.basename(saveRes.filePath), 'manifest@1.0.0.json');

  // Verify app.json index
  const indexPath = path.join(tempDir, 'app_video_fast', 'app.json');
  assert.ok(fs.existsSync(indexPath), 'app.json must exist');

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  assert.equal(index.appId, 'app_video_fast');
  assert.equal(index.latestVersion, '1.0.0');
  assert.deepEqual(index.versions, ['1.0.0']);
  assert.equal(index.name, 'Test App app_video_fast');
  assert.equal(index.category, 'video');

  // Verify no leftover temporary files
  const files = fs.readdirSync(path.join(tempDir, 'app_video_fast'));
  assert.equal(files.some((f) => f.includes('.tmp.')), false, 'No temporary files should linger');
});

test('T02.2: Version Immutability - Saving identical appId@version throws version_conflict error', async (t) => {
  const tempDir = createTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const storage = new AppStorage({ baseDir: tempDir });
  const manifest = createSampleManifest('app_image_paint', '1.0.0', 'image');

  await storage.saveManifest(manifest);

  // Attempting to overwrite existing version must fail closed
  await assert.rejects(
    async () => {
      await storage.saveManifest(manifest);
    },
    (err) => {
      assert.ok(err instanceof AppStorageError);
      assert.equal(err.code, 'version_conflict');
      assert.ok(err.message.includes('immutable'));
      return true;
    },
  );
});

test('T02.3: Multiple versions update app.json index and latestVersion', async (t) => {
  const tempDir = createTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const storage = new AppStorage({ baseDir: tempDir });
  const manifestV1 = createSampleManifest('app_audio_tts', '1.0.0', 'audio');
  const manifestV2 = createSampleManifest('app_audio_tts', '1.1.0', 'audio');

  await storage.saveManifest(manifestV1);
  await storage.saveManifest(manifestV2);

  const index = JSON.parse(fs.readFileSync(path.join(tempDir, 'app_audio_tts', 'app.json'), 'utf-8'));
  assert.equal(index.latestVersion, '1.1.0');
  assert.deepEqual(index.versions, ['1.0.0', '1.1.0']);

  // Check getManifest
  const latestManifest = await storage.getManifest('app_audio_tts');
  assert.ok(latestManifest);
  assert.equal(latestManifest.version, '1.1.0');

  const v1Manifest = await storage.getManifest('app_audio_tts', '1.0.0');
  assert.ok(v1Manifest);
  assert.equal(v1Manifest.version, '1.0.0');

  const nonExistent = await storage.getManifest('app_audio_tts', '9.9.9');
  assert.equal(nonExistent, null);
});

test('T02.4: listApps returns registered applications and respects category filter', async (t) => {
  const tempDir = createTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const storage = new AppStorage({ baseDir: tempDir });

  await storage.saveManifest(createSampleManifest('app_video_1', '1.0.0', 'video'));
  await storage.saveManifest(createSampleManifest('app_image_1', '1.0.0', 'image'));
  await storage.saveManifest(createSampleManifest('app_audio_1', '1.0.0', 'audio'));

  // 1. All apps
  const allApps = await storage.listApps();
  assert.equal(allApps.length, 3);
  const appIds = allApps.map((a) => a.appId).sort();
  assert.deepEqual(appIds, ['app_audio_1', 'app_image_1', 'app_video_1']);

  // 2. Video only filter
  const videoApps = await storage.listApps({ category: 'video' });
  assert.equal(videoApps.length, 1);
  assert.equal(videoApps[0].appId, 'app_video_1');

  // 3. Image only filter
  const imageApps = await storage.listApps({ category: 'image' });
  assert.equal(imageApps.length, 1);
  assert.equal(imageApps[0].appId, 'app_image_1');
});

test('T02.5: recordTask, getTask, and listTasks manage task projections reliably', async (t) => {
  const tempDir = createTempDir();
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const storage = new AppStorage({ baseDir: tempDir });
  const appId = 'app_video_render';
  await storage.saveManifest(createSampleManifest(appId, '1.0.0', 'video'));

  const task1 = {
    taskId: 'task_001',
    appId,
    appVersion: '1.0.0',
    executionId: 'exec_abc',
    status: 'completed',
    inputs: { prompt: 'Hello world' },
    outputs: { videoUrl: 'https://example.com/v.mp4' },
    createdAt: '2026-09-09T10:05:00.000Z',
    updatedAt: '2026-09-09T10:05:05.000Z',
  };

  const recRes = await storage.recordTask(appId, task1);
  assert.equal(recRes.success, true);
  assert.equal(recRes.taskId, 'task_001');

  const loadedTask = await storage.getTask(appId, 'task_001');
  assert.ok(loadedTask);
  assert.equal(loadedTask.taskId, 'task_001');
  assert.equal(loadedTask.status, 'completed');
  assert.equal(loadedTask.inputs.prompt, 'Hello world');

  const taskList = await storage.listTasks(appId);
  assert.equal(taskList.length, 1);
  assert.equal(taskList[0].taskId, 'task_001');
});
