/**
 * plugins/omnimux-workflow/src/canvas/editor/components/publish/topologyAnalyzer.test.mjs
 *
 * Unit test suite for Workflow Topology Analysis Algorithm (T01).
 * Tests InDegree/OutDegree, root node exposure, unwired slot extraction,
 * parameter mapping, widget derivation, category inference, and deterministic hash.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeWorkflowInputs,
  generateFormConfig,
} from './topologyAnalyzer.ts';

test('T01.1: Computes InDegree and OutDegree correctly across linear and branching graphs', () => {
  const nodes = [
    { id: 'node-text', type: 'material', data: { materialType: 'text', selectedTool: 'text-editor', label: 'Prompt' } },
    { id: 'node-image', type: 'material', data: { materialType: 'image', selectedTool: 'import', label: 'Ref Image' } },
    { id: 'node-gen', type: 'material', data: { materialType: 'video', selectedTool: 'video-generation', label: 'Gen Video' } },
  ];

  const edges = [
    { id: 'e1', source: 'node-text', target: 'node-gen', targetHandle: 'prompt' },
    { id: 'e2', source: 'node-image', target: 'node-gen', targetHandle: 'references' },
  ];

  const result = analyzeWorkflowInputs(nodes, edges);

  assert.equal(result.nodeInDegrees['node-text'], 0);
  assert.equal(result.nodeInDegrees['node-image'], 0);
  assert.equal(result.nodeInDegrees['node-gen'], 2);

  assert.equal(result.nodeOutDegrees['node-text'], 1);
  assert.equal(result.nodeOutDegrees['node-image'], 1);
  assert.equal(result.nodeOutDegrees['node-gen'], 0);

  assert.deepEqual(result.rootNodeIds.sort(), ['node-image', 'node-text']);
  assert.deepEqual(result.terminalNodeIds, ['node-gen']);
});

test('T01.2: Root nodes (inDegree === 0) default to mandatory core inputs (isExposed: true, isRequired: true)', () => {
  const nodes = [
    {
      id: 'text-1',
      type: 'material',
      data: { materialType: 'text', selectedTool: 'text-editor', label: 'Master Prompt', content: 'A cyber city' },
    },
    {
      id: 'import-1',
      type: 'material',
      data: { materialType: 'image', selectedTool: 'import', label: 'Hero Image', mediaUrl: 'https://example.com/hero.png' },
    },
  ];

  const result = analyzeWorkflowInputs(nodes, []);

  const textInput = result.inputs.find((i) => i.nodeId === 'text-1');
  assert.ok(textInput, 'Text input should exist');
  assert.equal(textInput.isExposed, true);
  assert.equal(textInput.isRequired, true);
  assert.equal(textInput.isRoot, true);
  assert.equal(textInput.widget, 'textarea');
  assert.equal(textInput.mappingType, 'text');
  assert.equal(textInput.defaultValue, 'A cyber city');

  const mediaInput = result.inputs.find((i) => i.nodeId === 'import-1');
  assert.ok(mediaInput, 'Media input should exist');
  assert.equal(mediaInput.isExposed, true);
  assert.equal(mediaInput.isRequired, true);
  assert.equal(mediaInput.isRoot, true);
  assert.equal(mediaInput.widget, 'media-uploader');
  assert.equal(mediaInput.mappingType, 'media');
  assert.equal(mediaInput.defaultValue, 'https://example.com/hero.png');
});

test('T01.3: Non-root nodes (inDegree > 0) default to unexposed and extract unwired slots & parameters', () => {
  const nodes = [
    {
      id: 'text-root',
      type: 'material',
      data: { materialType: 'text', selectedTool: 'text-editor', label: 'Prompt' },
    },
    {
      id: 'video-gen',
      type: 'material',
      data: {
        materialType: 'video',
        selectedTool: 'video-generation',
        label: 'Video Model',
        params: {
          aspectRatio: '16:9',
          seed: 42,
          enableUpscale: true,
        },
      },
    },
  ];

  // Only prompt slot is connected; references and audio_track slots are unwired!
  const edges = [
    { id: 'e1', source: 'text-root', target: 'video-gen', targetHandle: 'prompt' },
  ];

  const result = analyzeWorkflowInputs(nodes, edges);

  const genInputs = result.inputs.filter((i) => i.nodeId === 'video-gen');
  assert.ok(genInputs.length >= 3, 'Should extract unwired slots and params');

  // All non-root inputs must default to unexposed and non-required
  for (const input of genInputs) {
    assert.equal(input.isExposed, false, `Input ${input.key} should default to isExposed: false`);
    assert.equal(input.isRequired, false, `Input ${input.key} should default to isRequired: false`);
    assert.equal(input.isRoot, false);
  }

  // Check unwired slot: references (image -> media-uploader)
  const refSlot = genInputs.find((i) => i.slotId === 'references');
  assert.ok(refSlot, 'Unwired references slot should be extracted');
  assert.equal(refSlot.widget, 'media-uploader');
  assert.equal(refSlot.mappingType, 'slot');

  // Check unwired slot: audio_track (audio -> media-uploader)
  const audioSlot = genInputs.find((i) => i.slotId === 'audio_track');
  assert.ok(audioSlot, 'Unwired audio_track slot should be extracted');
  assert.equal(audioSlot.widget, 'media-uploader');
  assert.equal(audioSlot.mappingType, 'slot');

  // Check params: aspectRatio -> ratio-cards
  const aspectParam = genInputs.find((i) => i.targetField === 'params.aspectRatio');
  assert.ok(aspectParam, 'AspectRatio param should be extracted');
  assert.equal(aspectParam.widget, 'ratio-cards');
  assert.equal(aspectParam.defaultValue, '16:9');
  assert.equal(aspectParam.mappingType, 'param');
  assert.ok(aspectParam.enumOptions && aspectParam.enumOptions.length === 4);

  // Check params: seed -> slider-range (number)
  const seedParam = genInputs.find((i) => i.targetField === 'params.seed');
  assert.ok(seedParam, 'Seed param should be extracted');
  assert.equal(seedParam.widget, 'slider-range');
  assert.equal(seedParam.valueType, 'number');
  assert.equal(seedParam.defaultValue, 42);

  // Check params: enableUpscale -> switch-boolean (boolean)
  const switchParam = genInputs.find((i) => i.targetField === 'params.enableUpscale');
  assert.ok(switchParam, 'Boolean param should be extracted');
  assert.equal(switchParam.widget, 'switch-boolean');
  assert.equal(switchParam.valueType, 'boolean');
  assert.equal(switchParam.defaultValue, true);
});

test('T01.4: Derives correct category suggestion based on terminal nodes', () => {
  // 1. Terminal is video
  const videoWorkflow = [
    { id: 't1', type: 'material', data: { materialType: 'text' } },
    { id: 'v1', type: 'material', data: { materialType: 'video' } },
  ];
  const videoEdges = [{ id: 'e1', source: 't1', target: 'v1' }];
  const rVideo = analyzeWorkflowInputs(videoWorkflow, videoEdges);
  assert.equal(rVideo.categorySuggestion, 'video');

  // 2. Terminal is image
  const imgWorkflow = [
    { id: 't1', type: 'material', data: { materialType: 'text' } },
    { id: 'i1', type: 'material', data: { materialType: 'image' } },
  ];
  const imgEdges = [{ id: 'e1', source: 't1', target: 'i1' }];
  const rImg = analyzeWorkflowInputs(imgWorkflow, imgEdges);
  assert.equal(rImg.categorySuggestion, 'image');

  // 3. Terminal is audio
  const audioWorkflow = [
    { id: 't1', type: 'material', data: { materialType: 'text' } },
    { id: 'a1', type: 'material', data: { materialType: 'audio' } },
  ];
  const audioEdges = [{ id: 'e1', source: 't1', target: 'a1' }];
  const rAudio = analyzeWorkflowInputs(audioWorkflow, audioEdges);
  assert.equal(rAudio.categorySuggestion, 'audio');
});

test('T01.5: Computes deterministic workflowHash for graph topology', () => {
  const nodes = [
    { id: 'b', type: 'material', data: { selectedTool: 'video-generation' } },
    { id: 'a', type: 'material', data: { selectedTool: 'text-editor' } },
  ];
  const edges = [{ id: 'e1', source: 'a', target: 'b' }];

  const hash1 = analyzeWorkflowInputs(nodes, edges).workflowHash;

  // Permute order of nodes
  const permutedNodes = [nodes[1], nodes[0]];
  const hash2 = analyzeWorkflowInputs(permutedNodes, edges).workflowHash;

  assert.equal(hash1, hash2, 'Hash must be invariant to node input ordering');
  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64, 'Must be 64-char SHA-256 hex string');

  // Changing edge modifies hash
  const differentEdges = [{ id: 'e2', source: 'b', target: 'a' }];
  const hash3 = analyzeWorkflowInputs(nodes, differentEdges).workflowHash;
  assert.notEqual(hash1, hash3, 'Different topology must yield different hash');
});

test('T01.6: generateFormConfig builds valid RestrictedJsonSchema, fieldMappings, and demoSnapshot', () => {
  const nodes = [
    {
      id: 'node-prompt',
      type: 'material',
      data: { materialType: 'text', selectedTool: 'text-editor', label: 'User Prompt', content: 'Cyberpunk street' },
    },
    {
      id: 'node-gen',
      type: 'material',
      data: {
        materialType: 'video',
        selectedTool: 'video-generation',
        label: 'Video Gen',
        params: { aspectRatio: '16:9' },
      },
    },
  ];
  const edges = [{ id: 'e1', source: 'node-prompt', target: 'node-gen', targetHandle: 'prompt' }];

  const analysis = analyzeWorkflowInputs(nodes, edges);

  // Expose the root prompt and also optionally expose aspectRatio
  const inputs = analysis.inputs.map((inp) => {
    if (inp.key.includes('aspectRatio')) {
      return { ...inp, isExposed: true };
    }
    return inp;
  });

  const config = generateFormConfig(inputs);

  // FormSchema assertions
  assert.equal(config.formSchema.type, 'object');
  assert.equal(config.formSchema.additionalProperties, false);
  assert.deepEqual(config.formSchema.required, ['node-prompt_content']);
  assert.ok(config.formSchema.properties['node-prompt_content']);
  assert.ok(config.formSchema.properties['node-gen_aspectRatio']);

  // FieldMappings assertions
  const mappingPrompt = config.fieldMappings['node-prompt_content'];
  assert.ok(mappingPrompt);
  assert.equal(mappingPrompt.nodeId, 'node-prompt');
  assert.equal(mappingPrompt.targetField, 'content');
  assert.equal(mappingPrompt.widget, 'textarea');
  assert.equal(mappingPrompt.required, true);

  const mappingAspect = config.fieldMappings['node-gen_aspectRatio'];
  assert.ok(mappingAspect);
  assert.equal(mappingAspect.nodeId, 'node-gen');
  assert.equal(mappingAspect.targetField, 'params.aspectRatio');
  assert.equal(mappingAspect.widget, 'ratio-cards');
  assert.equal(mappingAspect.required, false);

  // DemoSnapshot assertions
  assert.equal(config.demoSnapshot['node-prompt_content'], 'Cyberpunk street');
  assert.equal(config.demoSnapshot['node-gen_aspectRatio'], '16:9');
});
