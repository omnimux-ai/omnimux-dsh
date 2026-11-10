import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zh from '../../../../i18n/dict.zh.ts';
import en from '../../../../i18n/dict.en.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../../..');
const result = await build({
 stdin: { contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import SlotWells from ${JSON.stringify(resolve(here,'SlotWells/SlotWells.tsx'))}; export const render = props => renderToStaticMarkup(React.createElement(SlotWells,props));`, resolveDir: root },
 bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'silent', nodePaths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean),
 plugins: [{name:'slot-i18n',setup(build) {
  build.onResolve({filter:/\/i18n$/},()=>({path:'i18n',namespace:'slot-test'}));
  build.onLoad({filter:/.*/,namespace:'slot-test'},()=>({contents:`import zh from ${JSON.stringify(resolve(root,'src/canvas/i18n/dict.zh.ts'))}; export const useT=()=>key=>zh[key]??key;`,loader:'ts',resolveDir:root}));
 }}],
});
const mod = {exports:{}};
new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {render} = mod.exports;
const spec = {slot:'refs',type:'image',role:'reference',min:0,max:2,labelKey:'panel.slot.reference_image'};
const props = {layout:{preset:'strip',slots:[spec],addButton:true},bindings:{refs:[{edgeId:'e',sourceNodeId:'image'}]},upstreams:[{edgeId:'e',nodeId:'image',label:'portrait.png',materialType:'image',availability:'ready',hasMedia:true,url:'https://example.test/portrait.png'}],onPickSlot(){},onClearOccupant(){},onInsertToken(){}};

test('slot renders accessible filled media and add control without native file title or dynamic geometry',()=>{
 const html=render(props);
 assert.match(html,/src="https:\/\/example.test\/portrait.png"/);
 assert.match(html,/aria-label="portrait.png"/);
 assert.match(html,/data-slot-state="filled"/);
 assert.match(html,/wf-slot-well--append/);
 assert.doesNotMatch(html,/title="portrait.png"|aspect-ratio|wf-slot-well__label/);
});
test('missing and waiting outputs render honest states rather than valid image previews',()=>{
 const waiting=render({...props,upstreams:[{...props.upstreams[0],availability:'waiting',hasMedia:false}]});
 const missing=render({...props,upstreams:[]});
 assert.match(waiting,/wf-slot-well__placeholder--loading/); assert.doesNotMatch(waiting,/<img/);
 assert.match(missing,/wf-slot-well__placeholder--broken/); assert.doesNotMatch(missing,/<img/);
});
test('empty and full strips preserve model capacity affordances',()=>{
 const empty=render({...props,bindings:{}});
 assert.doesNotMatch(empty,/data-slot-state="filled"/); assert.match(empty,/wf-slot-well--append/);
 const full=render({...props,layout:{...props.layout,slots:[{...spec,max:1}]}});
 assert.doesNotMatch(full,/wf-slot-well--append/);
});
test('replacement and reference grouping labels cover both locales',()=>{
 assert.equal(zh['node.replaceMaterial'],'替换素材'); assert.equal(en['node.replaceMaterial'],'Replace asset');
 for(const key of ['mention.current','mention.canvas','mention.waiting','mention.unavailable','mention.noMatches']) { assert.ok(zh[key]);assert.ok(en[key]); }
});
test('input_unavailable 记录不再渲染常驻裸「不可用」，但保留裂图占位（Issue #4032）',()=>{
 const promptSpec = {slot:'prompt',type:'text',role:'prompt',min:1,max:1,labelKey:'panel.slot.prompt'};
 const html = render({
  layout:{preset:'strip',slots:[promptSpec],addButton:false},
  bindings:{prompt:[{edgeId:'e-dead',sourceNodeId:'gone'}]},
  upstreams:[],
  records:[{slot:promptSpec,occupant:{edgeId:'e-dead',sourceNodeId:'gone'},state:'invalid',reasonCode:'input_unavailable'}],
  onPickSlot(){},onClearOccupant(){},onInsertToken(){},
 });
 assert.match(html,/wf-slot-well__placeholder--broken/);
 assert.doesNotMatch(html,/wf-slot-well__state/);
 assert.doesNotMatch(html,/不可用/);
});
test('任何槽位状态都不再渲染卡槽下方常驻文案（Issue #4048）',()=>{
 const imageSpec = {slot:'reference_images',type:'image',role:'reference',min:0,max:1,labelKey:'panel.slot.reference_image'};
 const base = {layout:{preset:'strip',slots:[imageSpec],addButton:false},
  bindings:{reference_images:[{edgeId:'e1',sourceNodeId:'src'}]},
  upstreams:[{edgeId:'e1',nodeId:'src',label:'img',materialType:'image',availability:'ready',hasMedia:true,url:'https://example.test/x.png'}],
  onPickSlot(){},onClearOccupant(){},onInsertToken(){}};
 for (const state of ['invalid','inactive','pending']) {
  const html = render({...base, records:[{slot:imageSpec,occupant:{edgeId:'e1',sourceNodeId:'src'},state,reasonCode: state==='invalid'?'role_conflict':undefined}]});
  assert.doesNotMatch(html,/wf-slot-well__state/, `${state}: 不得渲染常驻状态节点`);
  for (const word of ['不兼容','不可用','等待中','未使用','无效']) assert.doesNotMatch(html,new RegExp(word), `${state}: 不得出现「${word}」`);
 }
});
