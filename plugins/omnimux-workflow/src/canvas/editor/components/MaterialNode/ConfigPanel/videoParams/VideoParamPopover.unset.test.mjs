import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// Execute the real facade; replace only hook plumbing and child controls.
const { outputFiles } = await build({
  entryPoints: [new URL('./VideoParamPopover.tsx', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  plugins: [{ name: 'facade-controls', setup(builder) {
    builder.onResolve({ filter: /^react$|^react\/jsx-runtime$/ }, args => ({ path: args.path, namespace: 'test-react' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-react' }, args => ({ contents: args.path === 'react'
      ? 'export const useMemo = fn => fn();'
      : 'export const jsx = (type, props) => ({type, props}); export const jsxs = jsx;' }));
    builder.onResolve({ filter: /ui\/index\.ts$|CfgPopoverShell\.tsx$|CfgSegment\.tsx$|AspectCardGrid\.tsx$|DurationGrid\.tsx$|SegmentControls\.tsx$/ }, args => ({ path: args.path, namespace: 'test-controls' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-controls' }, () => ({ contents:
      ['CustomSelect', 'CustomSlider', 'CfgPopoverShell', 'CfgSegment', 'AspectCardGrid', 'DurationGrid', 'BooleanSwitchSegment', 'OperationSegment', 'ResolutionSegment', 'SoundSwitchSegment'].map(name => `export const ${name} = '${name}';`).join('\n') }));
  } }],
});
const { VideoParamPopover } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
function render(schema, values = {}) {
  const changes = [];
  const tree = VideoParamPopover({ triggerRef: {current: null}, isOpen: true, onClose() {}, schema,
    params: { operation: 'text_to_video', effectiveOperations: [], duration: '', ...values },
    onParamChange: (...args) => changes.push(args) });
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    nodes.push(node); visit(node.props?.children);
  }
  visit(tree);
  return { nodes, changes, get: type => nodes.find(node => node.type === type) };
}
for (const field of ['outputFormat', 'referenceTaskType', 'generationType']) {
  test(`unset singleton ${field} remains selectable`, () => {
    const view = render({ [field]: { options: [{value: 'only', label: '唯一'}] } });
    const select = view.get('CustomSelect');
    assert.ok(select);
    assert.notEqual(select.props.disabled, true);
    assert.equal(select.props.value, undefined);
    assert.equal(select.props.placeholder, '未设置');
    select.props.onChange('only');
    assert.deepEqual(view.changes, [[field, 'only']]);
  });
}
test('unset range duration is not selected and offers an explicit minimum confirmation', () => {
  const view = render({duration: {range: {min: 4, max: 12}}});
  assert.ok(view.nodes.some(n => n.props?.children === '未设置'));
  assert.equal(view.get('CustomSlider'), undefined);
  const confirm = view.nodes.find(n => n.type === 'button' && n.props.onClick);
  assert.ok(confirm, 'range must offer a confirmation entry');
  assert.deepEqual(view.changes, []);
  confirm.props.onClick();
  assert.deepEqual(view.changes, [['duration', 4]]);
});
test('unset discrete duration never selects the five-second option', () => {
  const view = render({duration: {options: [{value: 5, label: '5s'}, {value: 10, label: '10s'}]}});
  assert.ok(view.nodes.some(n => n.props?.children === '未设置'));
  assert.equal(view.get('CustomSlider'), undefined);
  const grid = view.get('DurationGrid');
  assert.ok(grid);
  assert.ok(![5, 10].includes(grid.props.value));
  grid.props.onChange(5);
  assert.deepEqual(view.changes, [['duration', 5]]);
});
test('unset auto-capable duration has neither mode selected before explicit choice', () => {
  const view = render({duration: {range: {min: 4, max: 12}, allowAuto: true}});
  assert.equal(view.get('CfgSegment').props.value, '');
  view.get('CfgSegment').props.onChange('auto');
  assert.deepEqual(view.changes, [['duration', -1]]);
});
test('explicit duration still drives the range control', () => {
  const view = render({duration: {range: {min: 4, max: 12}}}, {duration: 8});
  assert.equal(view.get('CustomSlider').props.value, 8);
  assert.ok(view.nodes.some(n => n.props?.children === '8s'));
});
