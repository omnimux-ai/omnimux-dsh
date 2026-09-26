/**
 * tests/e2e/clean-isolated-nodes-runtime-defense.e2e.test.mjs
 *
 * 端到端全链路测试：存量内置应用孤立节点清洗与表单运行时拓扑防御
 * 1. 验证 8 款预置短视频应用工作流中彻底删除了未连线的 node-slot-voice-tts 孤立节点；
 * 2. 验证 builtin-apps.json 与 builtinCatalogData.ts 中徹底剔除了 voice 表单项与字段映射；
 * 3. 验证 AppFormPanel.tsx 的 filterReachableFormFields 运行时拓扑防御算法，确保历史带有孤立节点的旧工程副本在表单端 100% 屏蔽悬挂输入项。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const { BUILTIN_MANIFESTS, PRESET_WORKFLOW_SNAPSHOTS } = await import(
  path.join(root, 'plugins/omnimux-apps/src/shared/builtinCatalogData.ts')
);
const { PRESET_WORKFLOW_MAP } = await import(
  path.join(root, 'plugins/omnimux-workflow/src/client/projects/presetWorkflows.js')
);
const { FEATURED_APPS_CARDS } = await import(
  path.join(root, 'plugins/omnimux/src/client/session-guide/templates/featured-apps-data.js')
);
const { filterReachableFormFields } = await import(
  path.join(root, 'plugins/omnimux-apps/src/shared/reachabilityFilter.ts')
);

const CREATIFY_APP_IDS = [
  'app-creatify-app-demo',
  'app-creatify-3d-cute-vfx',
  'app-creatify-apparel-tryon',
  'app-creatify-chasing-product',
  'app-creatify-fall-down-durability',
  'app-creatify-product-spotlight',
  'app-creatify-ugc-selfie',
  'app-builtin-product-video',
];

describe('E2E: 存量内置应用与预置工作流清洗契约', () => {
  it('预置工作流快照中彻底拔除孤立的 node-slot-voice-tts 节点', () => {
    for (const appId of CREATIFY_APP_IDS) {
      const snapshot = PRESET_WORKFLOW_SNAPSHOTS[appId];
      assert.ok(snapshot, `${appId} 必须存在于 PRESET_WORKFLOW_SNAPSHOTS`);
      const voiceNode = snapshot.nodes.find((n) => n.id === 'node-slot-voice-tts');
      assert.equal(voiceNode, undefined, `${appId} 预置快照中绝不得残留 node-slot-voice-tts 孤立节点`);

      // 验证客户端克隆映射
      const clientPreset = PRESET_WORKFLOW_MAP[appId];
      if (clientPreset) {
        const clientVoiceNode = clientPreset.nodes.find((n) => n.id === 'node-slot-voice-tts');
        assert.equal(clientVoiceNode, undefined, `${appId} 客户端预置映射中绝不得残留 node-slot-voice-tts`);
      }
    }
  });

  it('内置应用清单 BUILTIN_MANIFESTS 与精选卡片中彻底剔除 voice 表单项与字段映射', () => {
    for (const appId of CREATIFY_APP_IDS) {
      const manifest = BUILTIN_MANIFESTS.find((m) => m.appId === appId);
      assert.ok(manifest, `${appId} 必须存在于 BUILTIN_MANIFESTS`);
      assert.equal(
        manifest.formSchema.properties?.voice,
        undefined,
        `${appId} 表单属性中不得存在 voice`,
      );
      assert.equal(
        manifest.fieldMappings?.voice,
        undefined,
        `${appId} 字段映射中不得存在 voice`,
      );
      if (Array.isArray(manifest.formSchema.required)) {
        assert.equal(
          manifest.formSchema.required.includes('voice'),
          false,
          `${appId} 必填项中不得包含 voice`,
        );
      }
    }

    // 精选卡片清单核验
    for (const card of FEATURED_APPS_CARDS) {
      if (CREATIFY_APP_IDS.includes(card.appId)) {
        assert.equal(
          card.manifest?.formSchema?.properties?.voice,
          undefined,
          `精选卡片 ${card.appId} 中不得包含 voice 表单项`,
        );
        assert.equal(
          card.manifest?.fieldMappings?.voice,
          undefined,
          `精选卡片 ${card.appId} 中不得包含 voice 字段映射`,
        );
      }
    }
  });
});

describe('E2E: AppFormPanel 运行时拓扑防御门禁 (Runtime Defense)', () => {
  it('当历史应用副本携带未连线孤立节点时，运行时自动过滤并静默剔除该表单项', () => {
    // 构造一个模拟的历史病态应用清单（包含孤立 node-slot-voice-tts 节点和 voice 表单项）
    const legacyCorruptedManifest = {
      appId: 'legacy-corrupted-app-demo',
      version: '1.0.0',
      schemaVersion: '1.0.0',
      metadata: { name: '历史遗留应用', category: 'video' },
      workflowBinding: {
        workspaceId: 'ws-legacy',
        snapshot: {
          nodes: [
            { id: 'node-image', data: { materialType: 'image' } },
            { id: 'node-text', data: { materialType: 'text' } },
            { id: 'node-core', data: { materialType: 'video' } },
            // 孤立死节点（入度0、出度0）
            { id: 'node-slot-voice-tts', data: { materialType: 'audio' } },
          ],
          edges: [
            { id: 'e1', source: 'node-image', target: 'node-core' },
            { id: 'e2', source: 'node-text', target: 'node-core' },
            // 注意：没有连接 node-slot-voice-tts 的 edge！
          ],
        },
      },
      formSchema: {
        type: 'object',
        properties: {
          product_image: { type: 'string', title: '商品图' },
          copywriting: { type: 'string', title: '文案' },
          voice: { type: 'string', title: '解说音色' },
        },
        required: ['product_image', 'copywriting'],
      },
      fieldMappings: {
        product_image: { nodeId: 'node-image' },
        copywriting: { nodeId: 'node-text' },
        voice: { nodeId: 'node-slot-voice-tts' },
      },
    };

    // 执行运行时拓扑防御过滤
    const filteredEntries = filterReachableFormFields(legacyCorruptedManifest);
    const renderedKeys = filteredEntries.map(([k]) => k);

    assert.ok(renderedKeys.includes('product_image'), '有连线的商品图节点必须渲染');
    assert.ok(renderedKeys.includes('copywriting'), '有连线的文案节点必须渲染');
    assert.equal(
      renderedKeys.includes('voice'),
      false,
      '映射至孤立未连线节点的 voice 字段必须被运行时拓扑防御门禁 100% 过滤剔除！',
    );
  });
});
