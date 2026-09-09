import { buildModelCatalog } from '../../../../omnimux/src/catalog/list.js';
import { projectCanvasCatalog } from '../generationPolicy.ts';
import { resolveCanvasSubmission, resolveExecutorSubmission } from '../../workflow/seam/submitGuard.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findExecutionReadinessFailure } from './executionReadiness.ts';

const pendingVideoNode = {
  id: 'video-1',
  type: 'material',
  data: {
    materialType: 'video',
    selectedTool: 'video-generation',
    params: {
      pendingVideoParamAdjustment: {
        suggestedParams: { duration: -1 },
        notices: ['时长将从 5 调整为 -1'],
      },
    },
  },
};

test('pending video parameter adjustment blocks execution even before catalog lookup', () => {
  assert.deepEqual(findExecutionReadinessFailure([pendingVideoNode], null), {
    nodeId: 'video-1',
    reasonCode: 'parameter_adjustment_required',
    message: '视频参数调整等待确认；请确认建议调整或保留原值后重新提交',
  });
});

test('clearing the decision record leaves contract validation to the selected operation', () => {
  const node = {
    ...pendingVideoNode,
    data: { ...pendingVideoNode.data, params: {} },
  };
  assert.equal(findExecutionReadinessFailure([node], null).reasonCode, 'catalog_unavailable');
});

test('kept invalid declared parameters remain a readiness error after the pending decision is cleared', () => {
  const catalog = {
    source: 'omnimux', text: [], image: [], audio: [], video: [],
    models: [{
      id: 'minimax-h3', label: 'MiniMax H3', listed: true,
      parameters: {
        aspectRatio: { options: [{ value: '16:9' }, { value: '9:16' }], defaultValue: '16:9' },
        resolution: { options: [{ value: '720p' }, { value: '1080p' }], defaultValue: '720p' },
      },
      operations: [{
        id: 'video_edit', label: '编辑', listed: true, output: { type: 'video' }, inputs: [],
      }],
    }],
  };
  const failure = findExecutionReadinessFailure([{
    id: 'video-2', type: 'material', data: {
      materialType: 'video', selectedTool: 'video-generation',
      params: { model: 'minimax-h3', aspectRatio: 'auto', resolution: '480p' },
    },
  }], catalog);
  assert.deepEqual(failure, {
    nodeId: 'video-2',
    reasonCode: 'parameter_unsupported',
    message: '参数“aspectRatio”不支持值 "auto"',
  });
});


const operationOverrideCatalog = {
  source: 'omnimux', text: [], image: [], audio: [], video: [],
  models: [{
    id: 'operation-model', label: 'Operation model', listed: true,
    operations: [{
      id: 'video_edit', label: 'Edit', listed: true, output: { type: 'video' }, inputs: [],
      parameters: { duration: { options: [{ value: -1 }], defaultValue: -1 } },
    }],
  }],
};

test('stale explicit operation blocks readiness instead of falling through to the gateway', () => {
  const failure = findExecutionReadinessFailure([{
    id: 'video-stale', type: 'material', data: {
      materialType: 'video', selectedTool: 'video-generation',
      params: { model: 'operation-model', operation: 'old_op' },
    },
  }], operationOverrideCatalog);
  assert.deepEqual(failure, {
    nodeId: 'video-stale',
    reasonCode: 'operation_incompatible',
    message: '当前模型不支持已保存的生成方式 old_op',
  });
});

test('implicit sole operation validates its override parameters', () => {
  const failure = findExecutionReadinessFailure([{
    id: 'video-implicit', type: 'material', data: {
      materialType: 'video', selectedTool: 'video-generation',
      params: { model: 'operation-model', duration: 5 },
    },
  }], operationOverrideCatalog);
  assert.deepEqual(failure, {
    nodeId: 'video-implicit',
    reasonCode: 'parameter_unsupported',
    message: '参数“duration”不支持值 5',
  });
});

test('implicit sole operation validates its required node fields', () => {
  const catalog = {
    source: 'omnimux', text: [], image: [], audio: [], video: [],
    models: [{
      id: 'document-model', label: 'Document model', listed: true,
      operations: [{
        id: 'document_to_video', label: 'Document', listed: true, output: { type: 'video' },
        inputs: [{ slot: 'file_url', type: 'document', role: 'document', source: 'node_field', min: 1, max: 1 }],
      }],
    }],
  };
  const failure = findExecutionReadinessFailure([{
    id: 'video-document', type: 'material', data: {
      materialType: 'video', selectedTool: 'video-generation', prompt: '生成视频',
      params: { model: 'document-model' },
    },
  }], catalog);
  assert.deepEqual(failure, {
    nodeId: 'video-document',
    reasonCode: 'metadata_required',
    message: '槽位 file_url 需要有效 URL',
  });
});

test('multiple effective video operations require a persisted selection', () => {
  const catalog = {
    source: 'omnimux', text: [], image: [], audio: [], video: [],
    models: [{
      id: 'multi-video', label: 'Multi video', listed: true,
      operations: [
        { id: 'text_to_video', label: 'Text', listed: true, output: { type: 'video' }, inputs: [] },
        { id: 'video_edit', label: 'Edit', listed: true, output: { type: 'video' }, inputs: [] },
      ],
    }],
  };
  const failure = findExecutionReadinessFailure([{
    id: 'video-multi', type: 'material', data: {
      materialType: 'video', selectedTool: 'video-generation',
      params: { model: 'multi-video' },
    },
  }], catalog);
  assert.deepEqual(failure, {
    nodeId: 'video-multi',
    reasonCode: 'operation_incompatible',
    message: '请选择生成方式',
  });
});


// ============================================================================
// MiniMax H3 Max & Turbo Canvas Readiness & Submission Tests
// ============================================================================
const realHubCatalog = projectCanvasCatalog(buildModelCatalog({ env: {} }));

test('MiniMax H3 Max & Turbo: text_to_video with valid parameters passes execution readiness (returns null)', () => {
  for (const modelId of ['minimax-h3-max', 'minimax-h3-max-turbo', 'h3-max', 'minimax/h3-max-turbo']) {
    const node = {
      id: `video-t2v-${modelId}`,
      type: 'material',
      data: {
        materialType: 'video',
        selectedTool: 'video-generation',
        prompt: 'A cinematic drone shot of majestic mountains',
        params: {
          model: modelId,
          operation: 'text_to_video',
          aspectRatio: '16:9',
          duration: 5,
          resolution: '720p',
        },
      },
    };
    const failure = findExecutionReadinessFailure([node], realHubCatalog);
    assert.equal(failure, null, `Expected null failure for ${modelId} text_to_video`);

    // Case-insensitive checks for resolution and aspectRatio
    const caseNode = {
      ...node,
      data: {
        ...node.data,
        params: {
          ...node.data.params,
          aspectRatio: '16:9',
          duration: 10,
          resolution: '1080P',
        },
      },
    };
    assert.equal(findExecutionReadinessFailure([caseNode], realHubCatalog), null);
  }
});

test('MiniMax H3 Max & Turbo: first_frame with valid image upstream passes execution readiness', () => {
  const imgNode = {
    id: 'img-first-frame',
    type: 'material',
    data: {
      nodeKind: 'import',
      materialType: 'image',
      mediaUrl: 'https://example.test/first_frame.png',
      mimeType: 'image/png',
      sizeBytes: 1024 * 512,
    },
  };

  for (const modelId of ['minimax-h3-max', 'minimax-h3-max-turbo']) {
    const videoNode = {
      id: `video-ff-${modelId}`,
      type: 'material',
      data: {
        materialType: 'video',
        selectedTool: 'video-generation',
        prompt: 'Animate this character walking forward',
        params: {
          model: modelId,
          operation: 'first_frame',
          aspectRatio: 'adaptive',
          duration: 5,
          resolution: '720p',
        },
      },
    };
    const graph = {
      nodes: [imgNode, videoNode],
      edges: [{
        id: `e-ff-${modelId}`,
        source: 'img-first-frame',
        target: videoNode.id,
        data: {
          role: 'first_frame',
          targetSlot: 'first_frame',
        },
      }],
    };
    const failure = findExecutionReadinessFailure([videoNode], realHubCatalog, graph);
    assert.equal(failure, null, `Expected null failure for ${modelId} first_frame`);
  }
});

test('MiniMax H3 Max: video_multi_ref with reference image upstream passes execution readiness (Max only)', () => {
  const refImgNode = {
    id: 'img-ref-1',
    type: 'material',
    data: {
      nodeKind: 'import',
      materialType: 'image',
      mediaUrl: 'https://example.test/reference_art.png',
      mimeType: 'image/png',
      sizeBytes: 1024 * 1024,
    },
  };
  const maxNode = {
    id: 'video-mr-max',
    type: 'material',
    data: {
      materialType: 'video',
      selectedTool: 'video-generation',
      prompt: 'A cyberpunk cityscape matching this art style',
      params: {
        model: 'minimax-h3-max',
        operation: 'video_multi_ref',
        aspectRatio: 'adaptive',
        duration: 10,
        resolution: '1080p',
      },
    },
  };
  const graph = {
    nodes: [refImgNode, maxNode],
    edges: [{
      id: 'e-mr-1',
      source: 'img-ref-1',
      target: 'video-mr-max',
      data: {
        role: 'reference',
        targetSlot: 'reference_images',
      },
    }],
  };
  const failure = findExecutionReadinessFailure([maxNode], realHubCatalog, graph);
  assert.equal(failure, null, 'Expected null failure for minimax-h3-max video_multi_ref');

  // Turbo does not support video_multi_ref
  const turboNode = {
    ...maxNode,
    id: 'video-mr-turbo',
    data: {
      ...maxNode.data,
      params: {
        ...maxNode.data.params,
        model: 'minimax-h3-max-turbo',
      },
    },
  };
  const turboGraph = {
    nodes: [refImgNode, turboNode],
    edges: [{
      id: 'e-mr-turbo',
      source: 'img-ref-1',
      target: 'video-mr-turbo',
      data: {
        role: 'reference',
        targetSlot: 'reference_images',
      },
    }],
  };
  const turboFailure = findExecutionReadinessFailure([turboNode], realHubCatalog, turboGraph);
  assert.ok(turboFailure !== null);
  assert.equal(turboFailure.reasonCode, 'role_conflict');
});

test('MiniMax H3 Max & Turbo: invalid parameters strictly intercepted with parameter_unsupported', () => {
  const baseNode = {
    id: 'video-bad-param',
    type: 'material',
    data: {
      materialType: 'video',
      selectedTool: 'video-generation',
      prompt: 'Testing invalid parameters',
      params: {
        model: 'minimax-h3-max',
        operation: 'text_to_video',
        aspectRatio: '16:9',
        duration: 5,
        resolution: '720p',
      },
    },
  };

  // 1. Duration out of allowed discrete options (must be 5 or 10)
  for (const badDuration of [3, 7, 15, 0, -1]) {
    const node = {
      ...baseNode,
      data: {
        ...baseNode.data,
        params: { ...baseNode.data.params, duration: badDuration },
      },
    };
    const failure = findExecutionReadinessFailure([node], realHubCatalog);
    assert.deepEqual(failure, {
      nodeId: 'video-bad-param',
      reasonCode: 'parameter_unsupported',
      message: `参数“duration”不支持值 ${badDuration}`,
    });
  }

  // 2. Unsupported aspectRatio
  for (const badAspect of ['3:2', '2:1', 'square', 'invalid']) {
    const node = {
      ...baseNode,
      data: {
        ...baseNode.data,
        params: { ...baseNode.data.params, aspectRatio: badAspect },
      },
    };
    const failure = findExecutionReadinessFailure([node], realHubCatalog);
    assert.deepEqual(failure, {
      nodeId: 'video-bad-param',
      reasonCode: 'parameter_unsupported',
      message: `参数“aspectRatio”不支持值 ${JSON.stringify(badAspect)}`,
    });
  }

  // 3. Unsupported resolution
  for (const badRes of ['480p', '4k', '2k']) {
    const node = {
      ...baseNode,
      data: {
        ...baseNode.data,
        params: { ...baseNode.data.params, resolution: badRes },
      },
    };
    const failure = findExecutionReadinessFailure([node], realHubCatalog);
    assert.deepEqual(failure, {
      nodeId: 'video-bad-param',
      reasonCode: 'parameter_unsupported',
      message: `参数“resolution”不支持值 ${JSON.stringify(badRes)}`,
    });
  }
});

test('MiniMax H3 Max & Turbo: resolveCanvasSubmission and resolveExecutorSubmission produce canonical model and parameters', () => {
  // Test T2V submission with alias
  const t2vSubmission = resolveCanvasSubmission({
    capability: 'video',
    model: 'minimax/h3-max',
    operation: 'text_to_video',
    prompt: 'A sunny beach',
    aspectRatio: '16:9',
    duration: 5,
    resolution: '720p',
  }, realHubCatalog);
  assert.equal(t2vSubmission.model, 'minimax-h3-max');
  assert.equal(t2vSubmission.operation, 'text_to_video');
  assert.equal(t2vSubmission.aspectRatio, '16:9');
  assert.equal(t2vSubmission.duration, 5);
  assert.equal(t2vSubmission.resolution, '720p');

  // Test first_frame submission with turbo alias
  const ffSubmission = resolveCanvasSubmission({
    capability: 'video',
    model: 'h3-max-turbo',
    operation: 'first_frame',
    prompt: 'Dance animation',
    references: [{
      pathOrUrl: 'https://example.test/dancer.png',
      type: 'image',
      role: 'first_frame',
      targetSlot: 'first_frame',
      mimeType: 'image/png',
      sizeBytes: 1024 * 800,
    }],
    aspectRatio: 'adaptive',
    duration: 10,
    resolution: '1080p',
  }, realHubCatalog);
  assert.equal(ffSubmission.model, 'minimax-h3-max-turbo');
  assert.equal(ffSubmission.operation, 'first_frame');
  assert.equal(ffSubmission.references.length, 1);
  assert.equal(ffSubmission.references[0].role, 'first_frame');
  assert.equal(ffSubmission.references[0].targetSlot, 'first_frame');
  assert.equal(ffSubmission.duration, 10);
  assert.equal(ffSubmission.resolution, '1080p');

  // Test video_multi_ref submission (Max only)
  const mrSubmission = resolveCanvasSubmission({
    capability: 'video',
    model: 'h3-max',
    operation: 'video_multi_ref',
    prompt: 'Style replication',
    references: [{
      pathOrUrl: 'https://example.test/style.png',
      type: 'image',
      role: 'reference',
      targetSlot: 'reference_images',
      mimeType: 'image/png',
      sizeBytes: 1024 * 600,
    }],
    aspectRatio: '16:9',
    duration: 5,
    resolution: '720p',
  }, realHubCatalog);
  assert.equal(mrSubmission.model, 'minimax-h3-max');
  assert.equal(mrSubmission.operation, 'video_multi_ref');
  assert.equal(mrSubmission.references.length, 1);
  assert.equal(mrSubmission.references[0].role, 'reference');
  assert.equal(mrSubmission.references[0].targetSlot, 'reference_images');

  // Test resolveExecutorSubmission with explicit operation and alias
  const execSubmission = resolveExecutorSubmission({
    capability: 'video',
    model: 'minimax/h3-max-turbo',
    operation: 'text_to_video',
    prompt: 'Quick cinematic cut',
    aspectRatio: '16:9',
    duration: 5,
    resolution: '720p',
  }, realHubCatalog);
  assert.equal(execSubmission.model, 'minimax-h3-max-turbo');
  assert.equal(execSubmission.operation, 'text_to_video');
});
