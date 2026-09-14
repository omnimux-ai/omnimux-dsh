import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migrateSnapshot } from './snapshotMigration.ts';

function createMockSnapshot(overrides = {}) {
  return {
    schemaVersion: 2,
    id: 'ws_test_migration',
    name: '测试工作区',
    version: 1,
    nodes: [],
    edges: [],
    settings: { maxParallel: 3, failStrategy: 'fail-fast' },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodeCount: 0,
    },
    ...overrides,
  };
}

describe('snapshotMigration (schemaVersion 2 -> 3)', () => {
  it('版本提升：v2 快照迁移后 schemaVersion 变为 3', () => {
    const v2 = createMockSnapshot({ schemaVersion: 2 });
    const v3 = migrateSnapshot(v2);
    assert.equal(v3.schemaVersion, 3);
  });

  it('幂等性：v3 快照直接原样返回', () => {
    const v3 = createMockSnapshot({ schemaVersion: 3 });
    const result = migrateSnapshot(v3);
    assert.equal(result, v3);
    assert.equal(result.schemaVersion, 3);
  });

  it('脏数据清洗：selectedTool === "import" 且残留 prompt/model 时，100% 固化为 nodeKind: "import"', () => {
    const dirtyV2 = createMockSnapshot({
      schemaVersion: 2,
      nodes: [
        {
          id: 'node-img-dirty',
          type: 'material',
          position: { x: 100, y: 100 },
          data: {
            materialType: 'image',
            selectedTool: 'import',
            realPath: '/Users/test/photo.jpg',
            prompt: 'An astronaut riding a horse',
            params: { model: 'mj-v8-1' },
          },
        },
      ],
    });

    const v3 = migrateSnapshot(dirtyV2);
    const node = v3.nodes[0];
    assert.equal(node?.data.nodeKind, 'import');
    assert.equal(node?.data.realPath, '/Users/test/photo.jpg');
  });

  it('普通生成节点迁移：自动补齐 nodeKind: "generate"', () => {
    const genV2 = createMockSnapshot({
      schemaVersion: 2,
      nodes: [
        {
          id: 'node-gen-1',
          type: 'material',
          position: { x: 200, y: 200 },
          data: {
            materialType: 'video',
            selectedTool: 'video-generation',
            prompt: 'A sunset over ocean waves',
          },
        },
      ],
    });

    const v3 = migrateSnapshot(genV2);
    assert.equal(v3.nodes[0]?.data.nodeKind, 'generate');
  });

  it('非 material 节点（如 table / video_composition）保持原样不变', () => {
    const nonMaterialV2 = createMockSnapshot({
      schemaVersion: 2,
      nodes: [
        {
          id: 'node-vc-1',
          type: 'video_composition',
          position: { x: 0, y: 0 },
          data: { outputVideoUrl: 'https://example.com/v.mp4' },
        },
      ],
    });

    const v3 = migrateSnapshot(nonMaterialV2);
    assert.equal(v3.nodes[0]?.data.nodeKind, undefined);
  });
});
