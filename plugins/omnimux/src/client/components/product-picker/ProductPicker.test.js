import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pickerSource = readFileSync(join(here, 'ProductPicker.jsx'), 'utf8');
const cardSource = readFileSync(join(here, 'ProductPickerCard.jsx'), 'utf8');
const modalSource = readFileSync(
  join(here, '../../composer-add/ProductPickerModal.jsx'),
  'utf8',
);

test('ProductPicker: follows design system, contains search, nav, empty states and dialog', () => {
  assert.ok(pickerSource.includes('ModalDialog'), 'uses ModalDialog from dsh-ui-kit');
  assert.ok(pickerSource.includes('ProductPickerCard'), 'renders ProductPickerCard');
  assert.ok(pickerSource.includes('omx-product-pick__search-input'), 'contains search input');
  assert.ok(pickerSource.includes('collectCategories'), 'uses collectCategories');
  assert.ok(pickerSource.includes('filterProducts'), 'uses filterProducts');
  assert.doesNotMatch(pickerSource, /📦/, 'contains no box emoji');
  assert.doesNotMatch(pickerSource, /🔍/, 'contains no search emoji');
});

test('ProductPickerCard: contains check, thumb, badge, price and accessibility hooks', () => {
  assert.ok(cardSource.includes('omx-product-pick-card'), 'has card class name');
  assert.ok(cardSource.includes('omx-product-pick-card__check'), 'has checkmark container');
  assert.ok(cardSource.includes('omx-product-pick-card__price'), 'displays formatted price');
  assert.ok(cardSource.includes('ProductPlaceholderIcon'), 'uses SVG vector placeholder icon');
  assert.ok(cardSource.includes('role="radio"'), 'declares radio role for single-select');
});

test('ProductPickerModal: exposes thin adapter contract with onConfirm, onClose, open and t', () => {
  assert.ok(modalSource.includes('export function ProductPickerModal'), 'exports ProductPickerModal');
  assert.ok(modalSource.includes('ProductPicker'), 'delegates to ProductPicker');
});
