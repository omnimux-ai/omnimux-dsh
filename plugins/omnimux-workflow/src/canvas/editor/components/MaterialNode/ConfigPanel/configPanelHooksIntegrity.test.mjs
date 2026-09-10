import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'index.tsx'), 'utf8');

test('ConfigPanel 源码架构契约：ImportConfigPanel 与 GenerationConfigPanel 架构拆解，根治 Hook 错位', () => {
  // 1. 验证 ImportConfigPanel 与 GenerationConfigPanel 独立组件存在
  assert.match(src, /const ImportConfigPanel: React\.FC<ImportConfigPanelProps>/);
  assert.match(src, /const GenerationConfigPanel: React\.FC<ConfigPanelProps>/);

  // 2. 验证门面组件 ConfigPanel 通过分支选择独立组件，而非内部 early return 跳过 Hook
  assert.match(src, /const ConfigPanel: React\.FC<ConfigPanelProps> = \(props\) => \{/);
  assert.match(src, /const kind = resolveNodeKind\(props\.nodeData\);/);
  assert.match(src, /<ImportConfigPanel\s+nodeData=\{props\.nodeData\}/);
  assert.match(src, /<GenerationConfigPanel\s+\{\.\.\.props\}/);

  // 3. 验证 GenerationConfigPanel 内部没有任何提前 return 语句跳过下游 Hook
  const genPanelStart = src.indexOf('const GenerationConfigPanel: React.FC<ConfigPanelProps>');
  const genPanelEnd = src.indexOf('export interface ConfigPanelErrorBoundaryProps');
  assert.ok(genPanelStart > 0 && genPanelEnd > genPanelStart);
  const genPanelBody = src.slice(genPanelStart, genPanelEnd);
  assert.doesNotMatch(genPanelBody, /if\s*\(kind\s*===\s*['"]import['"]\)\s*\{\s*return/);
});

test('ConfigPanel 容灾契约：挂载局部 ConfigPanelErrorBoundary 保护画布顶层', () => {
  // 1. 验证定义了 ConfigPanelErrorBoundary 类组件
  assert.match(src, /export class ConfigPanelErrorBoundary extends React\.Component/);
  assert.match(src, /static getDerivedStateFromError/);
  assert.match(src, /componentDidCatch/);
  assert.match(src, /wf-config-panel--error/);

  // 2. 验证门面 ConfigPanel 外层挂载了 ConfigPanelErrorBoundary
  assert.match(src, /<ConfigPanelErrorBoundary nodeId=\{props\.nodeId\}>/);
});
