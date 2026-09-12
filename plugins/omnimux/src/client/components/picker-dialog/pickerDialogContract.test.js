import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  const nav = varPx('--omx-pick-nav-w');
  const mainPad = varPx('--omx-pick-main-pad');
  const card = varPx('--omx-pick-card-w');
  const gap = varPx('--omx-pick-gap');
  const bodyPad = varPx('--omx-pick-body-pad');

  // 分类栏 + 正文左内边距 + 两列卡片 + 列间距 + 底座正文左右内边距
  const expected = nav + mainPad + 2 * card + gap + bodyPad;
  assert.equal(expected, 756, 'derived dialog width must match the geometry contract');

  assert.match(
    PICKER_DIALOG_CSS,
    /width:\s*min\(92vw,\s*calc\(/,
    'width must be viewport-capped and computed from the variables',
  );
  assert.ok(
    !/width:\s*\d+px\s*!important/.test(PICKER_DIALOG_CSS),
    'no hardcoded pixel width remains',
  );
  for (const name of ['--omx-pick-nav-w', '--omx-pick-main-pad', '--omx-pick-card-w', '--omx-pick-gap', '--omx-pick-body-pad']) {
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
