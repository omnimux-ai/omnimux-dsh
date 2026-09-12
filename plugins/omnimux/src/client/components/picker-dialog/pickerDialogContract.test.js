import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PICKER_CARD_WIDTH,
  PICKER_DIALOG_CLASS,
  PICKER_DIALOG_SHELL_CSS,
  PICKER_DIALOG_VARIANT_CLASS,
  PICKER_GRID_GAP,
  PICKER_LAYOUTS,
  PICKER_ROOT_CLASSES,
  ensurePickerDialogStyles,
  pickerDialogClassName,
  pickerDialogWidth,
  pickerExpectedWidth,
} from './pickerDialogContract.js';

test('dialog className carries a variant class so the width variable lands on the dialog itself', () => {
  assert.equal(pickerDialogClassName('product'), `${PICKER_DIALOG_CLASS} omx-pick-dialog--product`);
  assert.equal(pickerDialogClassName('assets'), `${PICKER_DIALOG_CLASS} omx-pick-dialog--assets`);
  assert.throws(() => pickerDialogClassName('nope'), /unknown picker variant/);
  assert.equal(
    PICKER_DIALOG_SHELL_CSS.includes('var(--omnimux-pick-dialog-width'),
    true,
    'shell must consume the per-picker width variable',
  );
  assert.ok(
    !PICKER_DIALOG_SHELL_CSS.includes(`.${PICKER_DIALOG_VARIANT_CLASS.product} {`),
    'variant geometry belongs to the picker files, not the shell',
  );
});

test('each picker derives its width from its own layout geometry', () => {
  // 产品库：顶部 Tab，无左侧栏，4 列
  assert.equal(PICKER_LAYOUTS.product.columns, 4, '产品库需至少展示 3 列（取 4 列）');
  assert.equal(PICKER_LAYOUTS.product.leading, 0, '顶部 Tab 布局没有左侧栏');
  assert.equal(pickerExpectedWidth('product'), 4 * PICKER_CARD_WIDTH + 3 * PICKER_GRID_GAP);
  assert.equal(pickerExpectedWidth('product'), 1104);

  // 资产库：左侧分类栏 148 + 正文左内边距 16 + 2 列
  assert.equal(PICKER_LAYOUTS.assets.columns, 2);
  assert.equal(PICKER_LAYOUTS.assets.leading, 148 + 16);
  assert.equal(pickerExpectedWidth('assets'), 164 + 2 * PICKER_CARD_WIDTH + PICKER_GRID_GAP);
  assert.equal(pickerExpectedWidth('assets'), 708);

  assert.throws(() => pickerExpectedWidth('nope'), /unknown picker layout/);
});

test('pickerDialogWidth emits a leading-less calc for the top-tab layout', () => {
  assert.equal(pickerDialogWidth({ columns: 4 }), 'calc(4 * 264px + 3 * 16px)');
  assert.equal(pickerDialogWidth({ columns: 2, leading: 164 }), 'calc(164px + 2 * 264px + 1 * 16px)');
  assert.equal(pickerDialogWidth({ columns: 1 }), 'calc(1 * 264px)', '单列不产生列间距项');
});

test('shell css stays layout agnostic and consumes the per-picker width variable', () => {
  assert.ok(
    PICKER_DIALOG_SHELL_CSS.includes('min(92vw, var(--omnimux-pick-dialog-width'),
    'shell assembles width from the per-picker variable, capped by viewport',
  );
  assert.ok(
    !/--omnimux-pick-(nav-w|columns|card-w|gap)\s*:/.test(PICKER_DIALOG_SHELL_CSS),
    'geometric factors moved into each picker, not the shared shell',
  );
  assert.ok(
    !PICKER_DIALOG_SHELL_CSS.includes('--omx-'),
    'deprecated --omx-* prefix must never come back',
  );
});

test('shell lifts the primitive body cap and documented why', () => {
  const primitiveRefs = PICKER_DIALOG_SHELL_CSS.match(/\.dshUk-[A-Za-z-]+/g) || [];
  assert.deepEqual(
    [...new Set(primitiveRefs)],
    ['.dshUk-Dialog-body'],
    'only the primitive scroll container is addressed by class name',
  );
  assert.ok(
    PICKER_DIALOG_SHELL_CSS.includes('contentClassName'),
    'comment must explain why contentClassName cannot reach that container',
  );
  assert.ok(
    PICKER_DIALOG_SHELL_CSS.includes('verify:picker'),
    'comment must point at the runtime drift alarm',
  );
  for (const root of PICKER_ROOT_CLASSES) {
    assert.ok(
      PICKER_DIALOG_SHELL_CSS.includes(`.dshUk-Dialog-body:has(${root})`),
      `body cap must be lifted for ${root}`,
    );
    assert.ok(
      PICKER_DIALOG_SHELL_CSS.includes(`.dshUk-Dialog-body:has(${root}) > *:last-child`),
      `inner body padding/margin must be cleared for ${root}`,
    );
  }
});

test('shell hides the kit built-in close in favour of the shared external button', () => {
  assert.ok(
    PICKER_DIALOG_SHELL_CSS.includes(`.${PICKER_DIALOG_CLASS} .dshUk-Dialog-body > *:first-child > button`),
    'kit header close must be structurally targeted (it only has a hashed class)',
  );
  assert.match(
    PICKER_DIALOG_SHELL_CSS,
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
  assert.equal(created[0].textContent, PICKER_DIALOG_SHELL_CSS);
});
