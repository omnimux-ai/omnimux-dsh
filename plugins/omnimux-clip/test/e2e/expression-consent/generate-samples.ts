import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEmptyProject } from '@/stores/project/project-helpers';
import { motionEngine } from '@openreel/core/motion/motion-engine';
import { createMotionExpression } from '@openreel/core/motion/motion-expressions';
import { createProjectSerializer } from '@openreel/core/storage/project-serializer';
import { createStorageEngine } from '@openreel/core/storage/storage-engine';
import type { MotionExpression, MotionShapeLayer } from '@openreel/core/motion/types';

const serializer = createProjectSerializer(createStorageEngine());
const sampleDir = fileURLToPath(new URL('../samples/', import.meta.url));
const starter = motionEngine.createStarterComposition({ name: '安全验证场景', width: 640, height: 360, frameRate: 30, duration: 3, backgroundColor: '#f0f0f3' });
const baseLayer = starter.layers.find(layer => layer.type === 'shape') as MotionShapeLayer;
const layer: MotionShapeLayer = { ...baseLayer, id: 'qa-native-shape', name: '验证方块', width: 80, height: 80, transform: { ...baseLayer.transform, position: { x: 160, y: 180 }, scale: { x: 1, y: 1 } }, keyframes: [] };
const code = '(globalThis.__clipSecurityMarker += 1, value + 80)';
const expression: MotionExpression = { ...createMotionExpression('expression', 'transform.position.x', 'qa-imported-code'), code };
const cases = [
  { name: 'imported-code', label: '导入代码待授权', layer: { ...layer, expressions: [expression] } },
  { name: 'same-id-changed-code', label: '同一编号不同代码', layer: { ...layer, expressions: [{ ...expression, code: '(globalThis.__clipSecurityMarker += 1, value + 120)' }] } },
  { name: 'built-in-sine', label: '内置正弦', layer: { ...layer, expressions: [{ ...createMotionExpression('sine', 'transform.position.x', 'qa-builtin-sine'), amplitude: 40, frequency: 1, phase: 0 }] } },
  { name: 'keyframe', label: '关键帧', layer: { ...layer, keyframes: [{ id: 'qa-kf-0', property: 'transform.position.x', time: 0, value: 160, easing: 'linear' }, { id: 'qa-kf-1', property: 'transform.position.x', time: 1, value: 240, easing: 'linear' }] } },
];
for (const item of cases) {
  const project = { ...createEmptyProject(item.label, { width: 640, height: 360, frameRate: 30 }), id: 'qa-native-project', motionCompositions: [{ ...starter, id: 'qa-native-composition', layers: [item.layer] }] };
  const json = serializer.exportToJsonWithMetadata(project, 'Synthetic native Clip browser security verification sample; contains no external media.');
  const validation = serializer.validateProjectJson(json);
  if (!validation.valid) throw new Error(`${item.name}: ${validation.errors.join('; ')}`);
  writeFileSync(sampleDir + item.name + '.json', json);
}
writeFileSync(sampleDir + 'manifest.json', JSON.stringify({ code, samples: cases.map(({ name, label }) => ({ file: name + '.json', label })), validation: 'All samples passed the native serializer validation.' }, null, 2));
