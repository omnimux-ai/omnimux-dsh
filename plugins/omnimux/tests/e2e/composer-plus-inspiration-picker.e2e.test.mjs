import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const omnimuxClientIndex = readFileSync(join(here, '../../src/client/index.js'), 'utf8');
const commandsSource = readFileSync(join(here, '../../src/client/composer-add/commands.js'), 'utf8');
const hostCommands = readFileSync(join(here, '../../src/host/composer-commands.js'), 'utf8');
const i18nSource = readFileSync(join(here, '../../src/client/composer-commands-i18n.js'), 'utf8');
const pickerSource = readFileSync(join(here, '../../src/client/components/inspiration-picker/InspirationPicker.jsx'), 'utf8');
const contractSource = readFileSync(join(here, '../../src/client/components/picker-dialog/pickerDialogContract.js'), 'utf8');
const marketApply = readFileSync(join(here, '../../../omnimux-market/src/client/apply.js'), 'utf8');
const installSource = readFileSync(join(here, '../../src/client/composer-add/install.js'), 'utf8');

test('AC-1 加号菜单仅四项且中文文案对齐图 2', () => {
  assert.match(hostCommands, /name: 'add-file'/);
  assert.match(hostCommands, /name: 'add-from-library'/);
  assert.match(hostCommands, /name: 'add-from-product'/);
  assert.match(hostCommands, /name: 'add-from-inspiration'/);
  assert.match(i18nSource, /name: '上传媒体或文件'/);
  assert.match(i18nSource, /name: '从资产库选择'/);
  assert.match(i18nSource, /name: '从商品库选择'/);
  assert.match(i18nSource, /name: '从灵感库选择'/);
  assert.match(i18nSource, /'add-from-product'/);
  assert.match(i18nSource, /'add-from-inspiration'/);
});

test('AC-2 资产库与商品库复用现成弹窗', () => {
  assert.match(commandsSource, /LIBRARY_COMMAND = 'add-from-library'/);
  assert.match(commandsSource, /PRODUCT_COMMAND = 'add-from-product'/);
  assert.match(installSource, /AssetPickerModal/);
  assert.match(installSource, /ProductPickerModal/);
});

test('AC-3 灵感库弹窗走共享外壳且 Tab 首位为全部', () => {
  assert.match(contractSource, /inspiration: 'omx-pick-dialog--inspiration'/);
  assert.match(pickerSource, /pickerDialogClassName\('inspiration'\)/);
  assert.match(pickerSource, /INSPIRATION_TABS/);
  assert.match(pickerSource, /inspirationPicker\.tab\.all/);
});

test('AC-6 卡槽挂在输入框内侧，不再占用外侧停靠位', () => {
  assert.match(omnimuxClientIndex, /id: 'omnimux-attachment-tray'/);
  assert.match(omnimuxClientIndex, /conversation\.input\.attachments/);
  assert.doesNotMatch(omnimuxClientIndex, /order: 118/);
  assert.doesNotMatch(omnimuxClientIndex, /NativeComposerBridge/);
});

test('AC-5 底栏恢复技能并卸掉产品/角色/预设胶囊', () => {
  assert.match(marketApply, /omnimux-market-skill-picker/);
  assert.match(marketApply, /SkillPickerButton/);
  assert.doesNotMatch(omnimuxClientIndex, /omnimux-composer-product-picker-button/);
  assert.doesNotMatch(omnimuxClientIndex, /omnimux-composer-character-picker-button/);
  assert.doesNotMatch(omnimuxClientIndex, /omnimux-creative-presets-triggers/);
});
