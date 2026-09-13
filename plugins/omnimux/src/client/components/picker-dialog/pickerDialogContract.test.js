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
  // 产品库：顶部 Tab 单层顶栏，无左侧栏，6 列高密度微卡
  assert.equal(PICKER_LAYOUTS.product.columns, 6, '产品库采用 6 列高密度微卡网格');
  assert.equal(PICKER_LAYOUTS.product.leading, 0, '顶部 Tab 布局没有左侧栏');
  assert.equal(pickerExpectedWidth('product'), 6 * 156 + 5 * PICKER_GRID_GAP);
  assert.equal(pickerExpectedWidth('product'), 1016);

  // 资产库：对齐选择产品弹窗，顶部 Tab 单层顶栏，无左侧栏，6 列高密度微卡
  assert.equal(PICKER_LAYOUTS.assets.columns, 6, '资产库采用 6 列高密度微卡网格');
  assert.equal(PICKER_LAYOUTS.assets.leading, 0, '顶部 Tab 布局没有左侧栏');
  assert.equal(pickerExpectedWidth('assets'), 6 * 156 + 5 * PICKER_GRID_GAP);
  assert.equal(pickerExpectedWidth('assets'), 1016);

  assert.throws(() => pickerExpectedWidth('nope'), /unknown picker layout/);
});

test('pickerDialogWidth emits a leading-less calc for the top-tab layout', () => {
  assert.equal(pickerDialogWidth({ columns: 6, cardWidth: 156 }), 'calc(6 * 156px + 5 * 16px)');
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

test('shell lets the shared external close button escape the dialog clipping', () => {
  assert.match(
    PICKER_DIALOG_SHELL_CSS,
    new RegExp(`\\.${PICKER_DIALOG_CLASS}\\s*\\{\\s*overflow: visible !important;`),
    '底座弹窗 overflow:hidden 会把右外侧的共享关闭按钮裁掉（真机实测点不到）',
  );
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
