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
