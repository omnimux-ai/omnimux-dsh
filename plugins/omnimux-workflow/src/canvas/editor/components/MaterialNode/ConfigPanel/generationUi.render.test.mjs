import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../../..');
const tmp = await mkdtemp(resolve(tmpdir(), 'omnimux-generation-ui-'));
const output = resolve(tmp, 'render.cjs');
const stubs = {
  'useUpstreamMedia': `export const useUpstreamMedia = () => globalThis.__generationTestUpstreams ?? []; export const toUpstreamSnapshots = items => items;`,
  'useModelParameterSchema': `export const getCachedCatalog = () => null; export const useModelParameterSchema = (kind, id, catalog) => ({ schema: {}, modelItem: catalog?.[kind]?.find(m => m.id === id), aspectRatioOptions: [], defaultAspectRatio: '16:9', isAspectRatioValid: () => true, defaultDuration: 5, isDurationValid: () => true });`,
  'canvasStore': `export const useCanvasStore = { getState: () => ({edges: []}) };`,
  'generationPreferencesStore': `export const rememberGenerationModel = async () => {};`,
  'i18n': `import zh from ${JSON.stringify(resolve(root, 'src/canvas/i18n/dict.zh.ts'))}; export const useT = () => key => zh[key] ?? key;`,
  'ui': `import React from 'react'; export const CustomSelect = ({options=[]}) => React.createElement('div', {'data-model-options': options.length}, options.map(o => React.createElement('span', {key:o.value}, o.label))); export const CustomSlider = () => null; export const toast = {error: () => {}};`,
};
await build({
  absWorkingDir: root,
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import ConfigPanel from ${JSON.stringify(resolve(here, 'index.tsx'))}; export function render(nodeData,catalog,upstreams=[]) { globalThis.__generationTestUpstreams=upstreams; return renderToStaticMarkup(React.createElement(ConfigPanel,{nodeId:'target',nodeData,catalog,onUpdateNodeData:()=>{},onGenerate:()=>{},execBusy:false})); }`,
    resolveDir: root,
  },
  bundle: true, jsx: 'automatic', platform: 'node', format: 'cjs', outfile: output, logLevel: 'silent',
  plugins: [{ name: 'panel-test-boundaries', setup(build) {
    build.onResolve({filter: /(?:useUpstreamMedia|useModelParameterSchema|canvasStore|generationPreferencesStore|\/i18n|\/ui)$/}, args => {
      const name = args.path.split('/').pop();
      return name in stubs ? {path: name, namespace:'panel-test'} : undefined;
    });
    build.onLoad({filter: /.*/, namespace:'panel-test'}, args => ({ contents: stubs[args.path], loader:'tsx', resolveDir: root }));
  }}],
});
const { render } = createRequire(import.meta.url)(output);
await rm(tmp, {recursive: true, force: true});

function fixture(type, multiple = true) {
  const prompt = {slot:'prompt', type:'text', role:'prompt', source:'node_field', min:1, max:1};
  const operations = [{id:'plain', label:'文本对话', listed:true, output:{type}, inputs:[prompt]}];
  if (multiple) operations.push({id:'with_image',label:'图文对话',listed:true,output:{type},inputs:[prompt,{slot:'images',type:'image',role:'reference',source:'upstream_edge',min:0,max:4}]});
  const model = {id:'test-model',label:'Test model',listed:true,operations};
  return {source:'omnimux',text:[],image:[],video:[],audio:[],[type]:[model],models:[model]};
}
const node = (materialType, extra={}) => ({materialType,kind:'generate',selectedTool:'text-to-text',params:{model:'test-model',operation:'plain'},prompt:'',...extra});

test('new text panel has no quiet input hint element, no mode selector, and a disabled generation action', () => {
  const html = render(node('text'),fixture('text'));
  assert.doesNotMatch(html, /data-testid="wf-input-hint"/);
  assert.doesNotMatch(html, /wf-compat-error/);
  assert.match(html, /title="请输入内容或连接上游文本"/);
  assert.match(html, /描述你想生成、分析或改写的内容，也可以连接参考素材。/);
  assert.doesNotMatch(html, /role="alert"|wf-operation-mode-inline|文本对话|图文对话/);
  assert.match(html, /aria-disabled="true"/);
});

test('upstream text enables generation without adding a local prompt', () => {
  const html = render(node('text'), fixture('text'), [{nodeId:'source',label:'参考文本',materialType:'text',textContent:'Explain this',hasMedia:true}]);
  assert.doesNotMatch(html, /wf-input-hint|aria-disabled="true"/);
});

test('audio modes come from the selected model, with no fixed speech/music tabs', () => {
  const single = render(node('audio', {selectedTool:'text-to-music',prompt:'Music'}),fixture('audio',false));
  assert.doesNotMatch(single, /wf-config-panel__audio-tabs|wf-operation-mode-inline|音频生成|音乐生成/);
  const multi = render(node('audio', {prompt:'Music'}),fixture('audio'));
  assert.match(multi, /wf-operation-mode-inline/);
});

test('automatic model adaptation is a status message, not an error', () => {
  const html = render(node('text',{prompt:'Explain',compat:{status:'ready',adaptation:{toModelLabel:'Gemini 3.8 Flash',inputTypes:['video']}}}),fixture('text'));
  assert.match(html,/role="status" data-testid="wf-model-adaptation"/);
  assert.match(html,/已切换至 Gemini 3.8 Flash，以处理视频输入/);
  assert.doesNotMatch(html,/role="alert"/);
});
