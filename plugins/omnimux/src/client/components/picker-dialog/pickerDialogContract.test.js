import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PICKER_COLUMNS,
  PICKER_DIALOG_CLASS,
  PICKER_DIALOG_CSS,
  PICKER_ROOT_CLASSES,
  ensurePickerDialogStyles,
} from './pickerDialogContract.js';

/** 从契约 CSS 里取回一个变量值（px 数字） */
function varPx(name) {
  const match = PICKER_DIALOG_CSS.match(new RegExp(`${name}:\\s*(\\d+)px`));
  assert.ok(match, `contract must declare ${name}`);
  return Number(match[1]);
}

test('contract width derives from the layout factors instead of a magic number', () => {
  const nav = varPx('--omnimux-pick-nav-w');
  const mainPad = varPx('--omnimux-pick-main-pad');
  const card = varPx('--omnimux-pick-card-w');
  const gap = varPx('--omnimux-pick-gap');

  assert.equal(PICKER_COLUMNS, 3, 'picker must show at least three cards side by side');

  // 分类栏 + 正文左内边距 + 列数×卡片 + (列数-1)×列间距（选择器贴边，无正文内边距项）
  const expected = nav + mainPad + PICKER_COLUMNS * card + (PICKER_COLUMNS - 1) * gap;
  assert.equal(expected, 988, 'derived dialog width must match the geometry contract');

  assert.ok(
    !PICKER_DIALOG_CSS.includes('--omnimux-pick-body-pad'),
    'edge-to-edge picker has no body padding term',
  );
  assert.match(
    PICKER_DIALOG_CSS,
    /width:\s*min\(92vw,\s*calc\(/,
    'width must be viewport-capped and computed from the variables',
  );
  assert.ok(
    !/width:\s*\d+px\s*!important/.test(PICKER_DIALOG_CSS),
    'no hardcoded pixel width remains',
  );
  for (const name of ['--omnimux-pick-nav-w', '--omnimux-pick-main-pad', '--omnimux-pick-card-w', '--omnimux-pick-gap', '--omnimux-pick-columns']) {
    assert.ok(PICKER_DIALOG_CSS.includes(`var(${name})`), `width must consume ${name}`);
  }
});

test('contract keeps exactly one primitive-class dependency, documented', () => {
  const primitiveRefs = PICKER_DIALOG_CSS.match(/\.dshUk-[A-Za-z-]+/g) || [];
  assert.deepEqual(
    [...new Set(primitiveRefs)],
    ['.dshUk-Dialog-body'],
    'only the primitive scroll container is addressed by class name',
  );
  assert.ok(
    PICKER_DIALOG_CSS.includes('contentClassName'),
    'comment must explain why contentClassName cannot reach that container',
  );
  assert.ok(PICKER_DIALOG_CSS.includes('verify:picker'), 'comment must point at the runtime drift alarm');
});

test('contract lifts the body cap for both picker roots and keeps the dialog class single-sourced', () => {
  for (const root of PICKER_ROOT_CLASSES) {
    assert.ok(
      PICKER_DIALOG_CSS.includes(`.dshUk-Dialog-body:has(${root})`),
      `body cap must be lifted for ${root}`,
    );
  }
  assert.equal(PICKER_DIALOG_CLASS, 'omx-pick-dialog');
  assert.match(PICKER_DIALOG_CSS, /\.omx-pick-dialog\s*\{/);
});

test('contract lets the picker run edge to edge so the nav divider is full height', () => {
  for (const root of PICKER_ROOT_CLASSES) {
    assert.ok(
      PICKER_DIALOG_CSS.includes(`.dshUk-Dialog-body:has(${root}) > *:last-child`),
      `inner body padding/margin must be cleared for ${root}`,
    );
  }
  assert.match(
    PICKER_DIALOG_CSS,
    /> \*:last-child\s*\{[^}]*margin-top: 0 !important;[^}]*padding: 0 !important;/s,
    'inner body must lose its top margin and side padding',
  );
});

test('contract hides the kit built-in close in favour of the shared external button', () => {
  assert.ok(
    PICKER_DIALOG_CSS.includes(`.${PICKER_DIALOG_CLASS} .dshUk-Dialog-body > *:first-child > button`),
    'kit header close must be structurally targeted (it only has a hashed class)',
  );
  assert.match(
    PICKER_DIALOG_CSS,
    /\*:first-child > button\s*\{\s*display: none !important;/,
    'kit header close must be hidden',
  );
});

test('ensurePickerDialogStyles injects once and is idempotent', () => {
  const created = [];
  const fakeDoc = {
    getElementById: (id) => created.find((node) => node.id === id) ?? null,
    createElement: () => ({ id: '', textContent: '' }),
    head: {
      appendChild(node) {
        created.push(node);
      },
    },
  };

  ensurePickerDialogStyles(fakeDoc);
  ensurePickerDialogStyles(fakeDoc);

  assert.equal(created.length, 1, 'injects a single style tag across repeated calls');
  assert.equal(created[0].id, 'omx-picker-dialog-contract');
  assert.equal(created[0].textContent, PICKER_DIALOG_CSS);
});
