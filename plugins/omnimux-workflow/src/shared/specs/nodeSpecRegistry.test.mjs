/**
 * Unit test suite for Phase 1: Node Specification Registry SSOT.
 *
 * Verifies:
 * 1. NodeSpecRegistry contains all built-in node types (material, table, video_composition, group).
 * 2. MATERIAL_TOOL_INPUT_TYPES is 100% equivalent to legacy behavior across all 16 tools.
 * 3. getNodeInputRequirements returns exact inputs for specified tools and union inputs for material types.
 * 4. Safe fallback for unknown/invalid node types and tool identifiers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeSpecRegistry } from './registry.ts';
import {
  MATERIAL_TOOLS,
  MATERIAL_TOOL_INPUT_TYPES,
  DEFAULT_MATERIAL_TOOL,
} from '../graph/materialNode.ts';

test('Test 1: NodeSpecRegistry contains all built-in node specifications', () => {
  const allSpecs = NodeSpecRegistry.getAll();
  assert.equal(allSpecs.length, 4, 'Should contain exactly 4 built-in node specifications');

  const types = allSpecs.map((s) => s.type).sort();
  assert.deepEqual(types, ['group', 'material', 'table', 'video_composition']);

  // Check material spec
  const materialSpec = NodeSpecRegistry.get('material');
  assert.ok(materialSpec, 'Material spec should exist');
  assert.equal(materialSpec.type, 'material');
  assert.equal(materialSpec.defaultTool, 'text-editor');
  assert.equal(materialSpec.executorKey, 'material');
  assert.equal(materialSpec.ports.length, 2);
  assert.equal(materialSpec.ports[0].side, 'in');
  assert.equal(materialSpec.ports[1].side, 'out');
  assert.equal(Object.keys(materialSpec.tools).length, 16, 'Material spec should declare all 16 tools');

  // Check table spec
  const tableSpec = NodeSpecRegistry.get('table');
  assert.ok(tableSpec, 'Table spec should exist');
  assert.equal(tableSpec.type, 'table');
  assert.equal(tableSpec.defaultTool, 'table');
  assert.equal(tableSpec.executorKey, 'table');
  assert.equal(tableSpec.ports.length, 2);

  // Check video_composition spec
  const videoCompSpec = NodeSpecRegistry.get('video_composition');
  assert.ok(videoCompSpec, 'Video composition spec should exist');
  assert.equal(videoCompSpec.type, 'video_composition');
  assert.equal(videoCompSpec.defaultTool, 'video_composition');
  assert.equal(videoCompSpec.executorKey, 'video_composition');
  assert.equal(videoCompSpec.ports.length, 2);
  assert.deepEqual(videoCompSpec.ports.find((p) => p.side === 'in')?.acceptedTypes, [
    'text',
    'image',
    'video',
    'audio',
  ]);
  assert.deepEqual(videoCompSpec.ports.find((p) => p.side === 'out')?.acceptedTypes, ['video']);

  // Check group spec
  const groupSpec = NodeSpecRegistry.get('group');
  assert.ok(groupSpec, 'Group spec should exist');
  assert.equal(groupSpec.type, 'group');
  assert.equal(groupSpec.defaultTool, 'group');
  assert.equal(groupSpec.executorKey, 'group');
  assert.deepEqual(groupSpec.ports, []);
});

test('Test 2: MATERIAL_TOOL_INPUT_TYPES is 100% equivalent to legacy behavior across all 16 tools', () => {
  const expectedToolInputs = {
    'text-editor': [],
    'text-to-text': ['text', 'image', 'video', 'audio'],
    'link-extract': ['text'],
    'audio-transcription': ['audio'],
    import: [],
    'text-to-image': ['text'],
    'image-to-image': ['text', 'image'],
    'video-generation': ['text', 'image', 'video', 'audio'],
    'digital-human': ['text', 'image', 'video', 'audio'],
    'motion-mimicry': ['text', 'image', 'video'],
    'subtitle-render': ['text', 'video'],
    'text-to-audio': ['text'],
    'video-to-audio': ['video'],
    'voice-clone': ['text', 'audio'],
    'audio-extract': ['video'],
    'text-to-music': ['text'],
  };

  assert.equal(
    Object.keys(expectedToolInputs).length,
    16,
    'Expected tool input matrix must cover 16 tools',
  );

  for (const [tool, expectedInputs] of Object.entries(expectedToolInputs)) {
    const actualInputs = MATERIAL_TOOL_INPUT_TYPES[tool];
    assert.ok(actualInputs !== undefined, `Tool ${tool} must exist in MATERIAL_TOOL_INPUT_TYPES`);
    assert.deepEqual(
      actualInputs.slice().sort(),
      expectedInputs.slice().sort(),
      `Input types for tool ${tool} must match expected contract`,
    );

    const toolSpec = NodeSpecRegistry.getToolSpec('material', tool);
    assert.ok(toolSpec !== undefined, `Tool ${tool} must be registered in NodeSpecRegistry`);
    assert.deepEqual(
      toolSpec.acceptedInputTypes.slice().sort(),
      expectedInputs.slice().sort(),
      `acceptedInputTypes in toolSpec for ${tool} must match expected contract`,
    );
  }

  // Check MATERIAL_TOOLS by material type
  assert.deepEqual(MATERIAL_TOOLS.text, [
    'text-editor',
    'text-to-text',
    'link-extract',
    'audio-transcription',
  ]);
  assert.deepEqual(MATERIAL_TOOLS.image, ['import', 'text-to-image', 'image-to-image']);
  assert.deepEqual(MATERIAL_TOOLS.video, [
    'import',
    'video-generation',
    'motion-mimicry',
    'subtitle-render',
    'digital-human',
  ]);
  assert.deepEqual(MATERIAL_TOOLS.audio, [
    'import',
    'text-to-audio',
    'text-to-music',
    'video-to-audio',
    'voice-clone',
    'audio-extract',
  ]);

  // Check DEFAULT_MATERIAL_TOOL
  assert.equal(DEFAULT_MATERIAL_TOOL.text, 'text-editor');
  assert.equal(DEFAULT_MATERIAL_TOOL.image, 'text-to-image');
  assert.equal(DEFAULT_MATERIAL_TOOL.video, 'video-generation');
  assert.equal(DEFAULT_MATERIAL_TOOL.audio, 'text-to-audio');

  // Verify slot definitions on key tools
  const i2iSpec = NodeSpecRegistry.getToolSpec('material', 'image-to-image');
  assert.ok(i2iSpec);
  assert.equal(i2iSpec.slots.length, 2);
  const promptSlot = i2iSpec.slots.find((s) => s.slotId === 'prompt');
  assert.ok(promptSlot);
  assert.equal(promptSlot.materialType, 'text');
  assert.equal(promptSlot.role, 'prompt');
  assert.equal(promptSlot.required, true);

  const refSlot = i2iSpec.slots.find((s) => s.slotId === 'references');
  assert.ok(refSlot);
  assert.equal(refSlot.materialType, 'image');
  assert.equal(refSlot.role, 'reference');
  assert.equal(refSlot.required, false);
  assert.equal(refSlot.dynamicMaxByModel, true);
});

test('Test 3: getNodeInputRequirements returns union for material types and exact inputs for tools', () => {
  // 1. Specific tools
  const t2iReq = NodeSpecRegistry.getNodeInputRequirements('material', 'text-to-image');
  assert.deepEqual(t2iReq.acceptedTypes, ['text']);

  const i2iReq = NodeSpecRegistry.getNodeInputRequirements('material', 'image-to-image');
  assert.deepEqual(i2iReq.acceptedTypes.slice().sort(), ['image', 'text']);

  const vidReq = NodeSpecRegistry.getNodeInputRequirements('material', 'video-generation');
  assert.deepEqual(vidReq.acceptedTypes.slice().sort(), ['audio', 'image', 'text', 'video']);

  const audioTransReq = NodeSpecRegistry.getNodeInputRequirements('material', 'audio-transcription');
  assert.deepEqual(audioTransReq.acceptedTypes, ['audio']);

  const editorReq = NodeSpecRegistry.getNodeInputRequirements('material', 'text-editor');
  assert.deepEqual(editorReq.acceptedTypes, []);

  const importReq = NodeSpecRegistry.getNodeInputRequirements('material', 'import');
  assert.deepEqual(importReq.acceptedTypes, []);

  // 2. MaterialType union (when tool is omitted or materialType is provided)
  const imageTypeReq = NodeSpecRegistry.getNodeInputRequirements('material', undefined, 'image');
  assert.deepEqual(imageTypeReq.acceptedTypes.slice().sort(), ['image', 'text']);

  const imageTypeDirectReq = NodeSpecRegistry.getNodeInputRequirements('material', 'image');
  assert.deepEqual(imageTypeDirectReq.acceptedTypes.slice().sort(), ['image', 'text']);

  const textTypeReq = NodeSpecRegistry.getNodeInputRequirements('material', undefined, 'text');
  assert.deepEqual(textTypeReq.acceptedTypes.slice().sort(), ['audio', 'image', 'text', 'video']);

  const videoTypeReq = NodeSpecRegistry.getNodeInputRequirements('material', undefined, 'video');
  assert.deepEqual(videoTypeReq.acceptedTypes.slice().sort(), ['audio', 'image', 'text', 'video']);

  const audioTypeReq = NodeSpecRegistry.getNodeInputRequirements('material', undefined, 'audio');
  assert.deepEqual(audioTypeReq.acceptedTypes.slice().sort(), ['audio', 'text', 'video']);

  const allMaterialReq = NodeSpecRegistry.getNodeInputRequirements('material');
  assert.deepEqual(allMaterialReq.acceptedTypes.slice().sort(), ['audio', 'image', 'text', 'video']);

  // 3. Other registered node types
  const tableReq = NodeSpecRegistry.getNodeInputRequirements('table');
  assert.deepEqual(tableReq.acceptedTypes.slice().sort(), ['audio', 'image', 'text', 'video']);

  const videoCompReq = NodeSpecRegistry.getNodeInputRequirements('video_composition');
  assert.deepEqual(videoCompReq.acceptedTypes.slice().sort(), ['audio', 'image', 'text', 'video']);

  const groupReq = NodeSpecRegistry.getNodeInputRequirements('group');
  assert.deepEqual(groupReq.acceptedTypes, []);
});

test('Test 4: Safe fallback for unknown/invalid node types and tool identifiers', () => {
  // Unknown node type fallback to all 4 types
  const unknownNodeReq = NodeSpecRegistry.getNodeInputRequirements('non_existent_node_type');
  assert.deepEqual(unknownNodeReq.acceptedTypes.slice().sort(), [
    'audio',
    'image',
    'text',
    'video',
  ]);

  const invalidNodeReq = NodeSpecRegistry.getNodeInputRequirements('');
  assert.deepEqual(invalidNodeReq.acceptedTypes.slice().sort(), [
    'audio',
    'image',
    'text',
    'video',
  ]);

  // Unknown tool on material node falls back to material tools union
  const unknownToolReq = NodeSpecRegistry.getNodeInputRequirements('material', 'unknown_tool_xyz');
  assert.deepEqual(unknownToolReq.acceptedTypes.slice().sort(), [
    'audio',
    'image',
    'text',
    'video',
  ]);

  // Lookup queries
  assert.equal(NodeSpecRegistry.get('non_existent'), undefined);
  assert.equal(NodeSpecRegistry.getToolSpec('material', 'non_existent_tool'), undefined);
  assert.equal(NodeSpecRegistry.getToolSpec('non_existent_node', 'tool'), undefined);
});
