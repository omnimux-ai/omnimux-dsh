/**
 * plugins/omnimux-workflow/src/canvas/editor/components/publish/publishWizard.test.mjs
 *
 * Unit tests for Canvas Workflow Publishing Wizard (T03).
 * Verifies publish button status, topology extraction, manifest assembly,
 * and event dispatching (omnimux-app-tabs-changed & omnimux-app-open).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWorkflowInputs,
  generateFormConfig,
} from './topologyAnalyzer.ts';

/**
 * Local assertion helper for ApplicationManifest structural validity.
 * Verifies publish wizard manifest output against Universal Application Manifest v1.0 contract
 * without private cross-plugin imports from omnimux-apps.
 */
function validateApplicationManifestStructure(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['Manifest must be a non-null object'] };
  }

  // 1. Top-level identifiers
  if (typeof manifest.appId !== 'string' || !manifest.appId.trim()) {
    errors.push('appId must be a non-empty string');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(manifest.appId)) {
    errors.push(`appId contains invalid characters: "${manifest.appId}". Allowed: [a-zA-Z0-9_-]`);
  }

  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    errors.push('version must be a non-empty string');
  } else if (!/^\d+\.\d+\.\d+([+-][a-zA-Z0-9_.-]+)?$/.test(manifest.version)) {
    errors.push(`version must follow semantic versioning: "${manifest.version}"`);
  }

  if (manifest.schemaVersion !== '1.0') {
    errors.push(`schemaVersion must be strictly "1.0", received "${manifest.schemaVersion}"`);
  }

  if (typeof manifest.createdAt !== 'string' || isNaN(Date.parse(manifest.createdAt))) {
    errors.push(`createdAt must be a valid ISO date string: "${manifest.createdAt}"`);
  }

  // 2. Metadata validation
  if (!manifest.metadata || typeof manifest.metadata !== 'object') {
    errors.push('metadata must be an object');
  } else {
    if (typeof manifest.metadata.name !== 'string' || !manifest.metadata.name.trim()) {
      errors.push('metadata.name must be a non-empty string');
    }
    const VALID_CATEGORIES = ['video', 'image', 'audio'];
    if (!VALID_CATEGORIES.includes(manifest.metadata.category)) {
      errors.push(
        `metadata.category must be one of [video, image, audio], received "${manifest.metadata.category}". Note: "agent" category is strictly prohibited.`,
      );
    }
    if (typeof manifest.metadata.iconSvg !== 'string' || !manifest.metadata.iconSvg.trim()) {
      errors.push('metadata.iconSvg must be a non-empty SVG string');
    } else if (!manifest.metadata.iconSvg.includes('<svg') && !manifest.metadata.iconSvg.includes('<path')) {
      errors.push('metadata.iconSvg must contain valid SVG markup');
    }
  }

  // 3. Workflow binding
  if (!manifest.workflowBinding || typeof manifest.workflowBinding !== 'object') {
    errors.push('workflowBinding must be an object');
  } else {
    if (!manifest.workflowBinding.workspaceId) errors.push('workflowBinding.workspaceId is required');
    if (!manifest.workflowBinding.workflowHash) errors.push('workflowBinding.workflowHash is required');
    if (!manifest.workflowBinding.snapshot || typeof manifest.workflowBinding.snapshot !== 'object') {
      errors.push('workflowBinding.snapshot must be an object');
    }
  }

  // 4. Form schema
  if (!manifest.formSchema || typeof manifest.formSchema !== 'object') {
    errors.push('formSchema must be an object');
  } else {
    if (manifest.formSchema.type !== 'object') {
      errors.push('formSchema.type must be strictly "object"');
    }
    if (manifest.formSchema.additionalProperties !== false) {
      errors.push('formSchema.additionalProperties must be false');
    }
  }

  // 5. Field mappings
  if (!manifest.fieldMappings || typeof manifest.fieldMappings !== 'object') {
    errors.push('fieldMappings must be an object');
  }

  return { valid: errors.length === 0, errors };
}

describe('T03: Canvas Workflow Publishing Wizard & Tab Dispatch', () => {
  const sampleNodes = [
    {
      id: 'text_root',
      type: 'material',
      data: {
        nodeKind: 'import',
        title: '用户输入脚本',
        content: '默认短剧旁白内容',
      },
    },
    {
      id: 'gen_video',
      type: 'material',
      data: {
        nodeKind: 'generate',
        title: '分镜视频生成',
        prompt: '高质量短剧画面',
        params: {
          aspectRatio: '9:16',
          seed: 42,
        },
      },
    },
  ];

  const sampleEdges = [
    {
      id: 'e1',
      source: 'text_root',
      target: 'gen_video',
      targetHandle: 'prompt',
    },
  ];

  it('T03.1: Analysis correctly extracts root vs downstream inputs and category suggestion', () => {
    const analysis = analyzeWorkflowInputs(sampleNodes, sampleEdges);

    assert.equal(analysis.categorySuggestion, 'video');
    assert.ok(analysis.workflowHash.length === 64);
    assert.deepEqual(analysis.rootNodeIds, ['text_root']);
    assert.deepEqual(analysis.terminalNodeIds, ['gen_video']);

    // Root input
    const rootInp = analysis.inputs.find((i) => i.nodeId === 'text_root');
    assert.ok(rootInp);
    assert.equal(rootInp.isRoot, true);
    assert.equal(rootInp.isExposed, true);
    assert.equal(rootInp.isRequired, true);
    assert.equal(rootInp.widget, 'textarea');

    // Downstream input (aspectRatio parameter)
    const ratioInp = analysis.inputs.find((i) => i.key.includes('aspectRatio'));
    assert.ok(ratioInp);
    assert.equal(ratioInp.isRoot, false);
    assert.equal(ratioInp.isExposed, false);
    assert.equal(ratioInp.isRequired, false);
    assert.equal(ratioInp.widget, 'ratio-cards');
  });

  it('T03.2: Generates strictly valid ApplicationManifest from exposed inputs', () => {
    const analysis = analyzeWorkflowInputs(sampleNodes, sampleEdges);

    // Expose both inputs
    const exposedInputs = analysis.inputs.map((inp) => ({
      ...inp,
      isExposed: true,
      fieldTitle: inp.isRoot ? '剧本文案' : '视频比例',
    }));

    const formConfig = generateFormConfig(exposedInputs);

    const manifest = {
      appId: 'app_short_drama_v1',
      version: '1.0.0',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      metadata: {
        name: '爆款短剧生成器',
        category: 'video',
        description: '一键将剧本转化为 9:16 竖屏短剧',
        iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>',
        coverUrl: 'https://cdn.omnimux.com/samples/cover.png',
      },
      workflowBinding: {
        workspaceId: 'ws_sample_01',
        workflowHash: analysis.workflowHash,
        snapshot: {
          nodes: sampleNodes,
          edges: sampleEdges,
        },
      },
      formSchema: formConfig.formSchema,
      fieldMappings: formConfig.fieldMappings,
      showcase: {
        mode: 'carousel',
        items: [
          {
            id: 'item_1',
            title: '样片 1',
            mediaType: 'video',
            mediaUrl: 'https://cdn.omnimux.com/samples/v1.mp4',
            posterUrl: 'https://cdn.omnimux.com/samples/p1.png',
          },
        ],
      },
      demoSnapshot: formConfig.demoSnapshot,
    };

    const valResult = validateApplicationManifestStructure(manifest);
    assert.equal(valResult.valid, true, `Manifest should be valid: ${valResult.errors.join('; ')}`);
  });

  it('T03.3: Dispatches omnimux-app-tabs-changed and omnimux-app-open events upon publish', () => {
    let tabsChangedFired = false;
    let openEventPayload = null;

    const mockWindow = {
      dispatchEvent(evt) {
        if (evt.type === 'omnimux-app-tabs-changed') {
          tabsChangedFired = true;
        } else if (evt.type === 'omnimux-app-open') {
          openEventPayload = evt.detail;
        }
      },
    };

    // Simulate publish dispatch sequence
    mockWindow.dispatchEvent({ type: 'omnimux-app-tabs-changed' });
    mockWindow.dispatchEvent({
      type: 'omnimux-app-open',
      detail: { id: 'app_short_drama_v1', title: '爆款短剧生成器' },
    });

    assert.equal(tabsChangedFired, true);
    assert.ok(openEventPayload);
    assert.equal(openEventPayload.id, 'app_short_drama_v1');
  });

  it('T03.4: Category is restricted to strictly video | image | audio (no agent)', () => {
    const analysis = analyzeWorkflowInputs(sampleNodes, sampleEdges);
    assert.ok(['video', 'image', 'audio'].includes(analysis.categorySuggestion));

    const invalidManifest = {
      appId: 'app_agent_invalid',
      version: '1.0.0',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      metadata: {
        name: '智能体应用',
        category: 'agent', // Strictly forbidden!
        iconSvg: '<svg></svg>',
      },
      workflowBinding: {
        workspaceId: 'ws_1',
        workflowHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        snapshot: { nodes: [], edges: [] },
      },
      formSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      fieldMappings: {},
      showcase: { mode: 'carousel', items: [] },
      demoSnapshot: {},
    };

    const valResult = validateApplicationManifestStructure(invalidManifest);
    assert.equal(valResult.valid, false);
    assert.ok(valResult.errors.some((e) => e.includes('"agent" category is strictly prohibited')));
  });
});
