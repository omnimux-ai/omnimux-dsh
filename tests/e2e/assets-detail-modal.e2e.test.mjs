import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 资产文件夹详情侧边栏轻量弹窗化与编辑入口改造验证', () => {
  const browsePath = path.join(root, 'plugins/omnimux-assets/src/client/AssetBrowse.jsx')
  const detailPath = path.join(root, 'plugins/omnimux-assets/src/client/AssetDetail.jsx')
  const stagePath = path.join(root, 'plugins/omnimux-assets/src/client/AssetsStage.jsx')
  const iconsPath = path.join(root, 'plugins/omnimux-assets/src/client/icons.jsx')
  const localesPath = path.join(root, 'plugins/omnimux-assets/src/client/locales.js')
  const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')

  const browseContent = fs.readFileSync(browsePath, 'utf-8')
  const detailContent = fs.readFileSync(detailPath, 'utf-8')
  const stageContent = fs.readFileSync(stagePath, 'utf-8')
  const iconsContent = fs.readFileSync(iconsPath, 'utf-8')
  const localesContent = fs.readFileSync(localesPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  // 1. 验证 AssetBrowse 返回行增加编辑图标与回调
  assert.ok(
    iconsContent.includes('export function EditIcon') &&
    browseContent.includes('import { Badge, Button, IconButton } from \'dsh-ui-kit\'') &&
    browseContent.includes('EditIcon') &&
    browseContent.includes('className="omnimux-assets-crumb-edit"') &&
    browseContent.includes('onClick={onEdit}'),
    'AssetBrowse 必须在面包屑返回行集成 EditIcon 按钮并绑定 onEdit'
  )

  // 2. 验证 AssetDetail 侧边栏全面重构为 ModalDialog
  assert.ok(
    detailContent.includes('import { Button, DropdownSelect, InputField, ModalDialog } from \'dsh-ui-kit\'') &&
    detailContent.includes('<ModalDialog') &&
    detailContent.includes('size="md"') &&
    detailContent.includes('title={t(\'detail.title\')}'),
    'AssetDetail 必须使用 dsh-ui-kit 的 ModalDialog 呈现'
  )

  // 3. 验证弹窗严格对齐图 2 元素并剔除素材列表
  assert.ok(
    detailContent.includes('label={t(\'detail.name\')}') &&
    detailContent.includes('<DropdownSelect') &&
    detailContent.includes('aria-label={t(\'detail.type\')}') &&
    detailContent.includes('className="omnimux-assets-textarea"') &&
    detailContent.includes('className="omnimux-assets-cite"') &&
    detailContent.includes('{t(\'detail.save\')}'),
    'AssetDetail 弹窗必须保留名称、类型、描述、引用与保存按钮'
  )
  assert.ok(
    !detailContent.includes('<aside') &&
    !detailContent.includes('TopFileList') &&
    !detailContent.includes('FolderBrowse') &&
    !detailContent.includes('t(\'detail.files\')'),
    'AssetDetail 弹窗必须剔除原侧栏的多余素材列表及 aside 容器'
  )

  // 4. 验证 AssetsStage 中 AssetsBody 移除固定 aside 侧边栏并由 AssetsDialogs 接管弹窗
  const bodySlice = stageContent.slice(
    stageContent.indexOf('function AssetsBody'),
    stageContent.indexOf('function AddAssetDialogItem')
  )
  assert.ok(!bodySlice.includes('<AssetDetail'), 'AssetsBody 严禁挂载常驻的 AssetDetail 侧边栏')

  const dialogsSlice = stageContent.slice(
    stageContent.indexOf('function AssetsDialogs'),
    stageContent.indexOf('export function AssetsStage')
  )
  assert.ok(
    dialogsSlice.includes('detailModalOpen && feed.detail') &&
    dialogsSlice.includes('<AssetDetail'),
    'AssetsDialogs 必须按条件挂载 AssetDetail 弹窗并受控'
  )

  // 5. 验证样式与多语言
  assert.ok(
    stylesContent.includes('.omnimux-assets-crumb-edit') &&
    stylesContent.includes('.omnimux-assets-detail-dialog-body') &&
    stylesContent.includes('.omnimux-assets-detail-field'),
    'styles.js 必须包含编辑图标及弹窗表单布局样式'
  )
  assert.ok(
    localesContent.includes('\'detail.edit\': \'编辑\'') &&
    localesContent.includes('\'detail.edit\': \'Edit\''),
    'locales.js 必须包含 detail.edit 国际化文案'
  )
})
