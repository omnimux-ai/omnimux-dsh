// #1785 Verify support only: synthetic contracts are not product capabilities.
import { operation, slot } from '../../plugins/omnimux-workflow/src/workflow/seam/submissionFixtures.mjs';
const options = (values, defaultValue) => ({ options: values.map(value => ({ value, label: String(value) })), defaultValue });
const controls = (resolution, duration, aspectRatio) => ({ resolution: options(['480p', '720p', '1080p'], resolution), duration: options([5, 10], duration), aspectRatio: options(['16:9', '9:16'], aspectRatio) });
function model(id, label, defaults, frameDefaults) {
  return { id, label, listed: true, parameterSchema: defaults, operations: [
    { ...operation('text_to_video', 'video'), label: '文生视频', parameters: defaults },
    { ...operation('first_frame', 'video', [slot('image', 'first_frame', 1, 1, 'first_frame')]), label: '首帧', parameters: frameDefaults },
  ] };
}
export function createCatalog(minimax) {
  const a = model('seed-qa-1785-a', '离线验证 A', controls('720p', 5, '16:9'), controls('1080p', 10, '9:16'));
  const b = model('kling-qa-1785-b', '离线验证 B', controls('1080p', 10, '9:16'), controls('480p', 5, '16:9'));
  // Offline snapshot: video-models.yaml minimax-h3; listed here only for QA.
  minimax ||= model('minimax-h3', 'MiniMax H3 离线契约', {resolution:options(['2K','768P'],'2K'),duration:{range:{min:4,max:15,step:1},defaultValue:5},aspectRatio:options(['16:9','9:16'],'16:9')}, {resolution:options(['2K','768P'],'2K'),duration:{range:{min:4,max:15,step:1},defaultValue:5},aspectRatio:options(['adaptive'],'adaptive')});
  const missing = model('wan-qa-1785-unset', '无默认值验证', {resolution:options(['720p'],undefined),duration:{range:{min:4,max:15,step:1}},aspectRatio:options(['16:9'],undefined)}, {});
  for (const field of Object.values(missing.parameterSchema)) field.required = true;
  const models = [a, b, minimax, missing];
  return { source: 'static-stub', schemaVersion: '1.1', defaults: { video: a.id }, models, video: models, text: [], image: [], audio: [] };
}
export function fixture(name = 'clean', origin = 'http://127.0.0.1') {
  const target = { id: 'target', type: 'material', position: { x: 300, y: 100 }, data: { materialType: 'video', nodeKind: 'generate', kind: 'generate', label: '节点一', prompt: '测试海边风景', params: { model: 'seed-qa-1785-a', operation: 'text_to_video', resolution: '720p', duration: 5, aspectRatio: '16:9' } } };
  const second = structuredClone(target); second.id = 'second'; second.data.label = '节点二'; second.position.y = 400;
  const image = { id: 'image', type: 'material', position: { x: 0, y: 0 }, data: { materialType: 'image', nodeKind: 'import', kind: 'import', label: '测试图片', status: 'completed', mediaUrl: origin + '/media/a.svg', mimeType: 'image/svg+xml' } };
  const nodes = [target, second], edges = [];
  if (name === 'frames' || name === 'legacy-minimax') {
    nodes.unshift(image); edges.push({ id: 'edge-image', source: 'image', target: 'target', targetHandle: 'in', data: { feedType: 'image' } });
    target.data.params.operation = 'first_frame';
    target.data.slotBindings = { first_frame: [{ sourceNodeId: 'image', edgeId: 'edge-image', outputId: origin + '/media/a.svg', pinned: true }] };
  }
  if (name === 'legacy-minimax') target.data.params = { model: 'minimax-h3', operation: 'first_frame', resolution: '480p', duration: 5, aspectRatio: 'adaptive' };
  if(name==='unset')target.data.params={model:'wan-qa-1785-unset',operation:'text_to_video'};
  if(name==='unknown')target.data.params={model:'unknown-removed-model',operation:'text_to_video',resolution:'480p'};
  return { nodes, edges, targetId: 'target', name };
}
