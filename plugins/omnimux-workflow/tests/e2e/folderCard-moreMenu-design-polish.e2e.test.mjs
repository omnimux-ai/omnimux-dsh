import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cardPath = join(here, '../../src/client/projects/ProjectFolderCard.jsx')
const stylesPath = join(here, '../../src/client/projects/folderStyles.js')

const cardSrc = readFileSync(cardPath, 'utf8')
const stylesSrc = readFileSync(stylesPath, 'utf8')

test('E2E: 项目卡片操作菜单全链路遵循 design.md 设计规范契约', () => {
  // 1. 结构与语义契约：更多操作必须声明 IconButton、menu 角色与展开项
  assert.match(
    cardSrc,
    /<IconButton[^>]*className="omnimux-folder-more"[^>]*aria-haspopup="menu"/,
    '更多操作按钮必须具备 aria-haspopup="menu" 语义',
  )
  assert.match(
    cardSrc,
    /<div[^>]*className="omnimux-folder-menu"[^>]*role="menu"/,
    '菜单浮层容器必须具备 role="menu" 语义',
  )

  // 2. 危险项语义契约：「解散项目」必须标明危险状态属性与专属危险类名
  assert.match(
    cardSrc,
    /className="omnimux-folder-menu-item--danger"/,
    '解散项目菜单项必须携带专属危险类名',
  )
  assert.match(
    cardSrc,
    /data-danger="true"/,
    '解散项目菜单项必须携带 data-danger 契约属性',
  )

  // 3. 浮层材质规范：必须使用 elevated 提升层底色与 16px 毛玻璃滤镜
  assert.match(
    stylesSrc,
    /background:\s*var\(--dsw-alias-bg-elevated,\s*var\(--dsw-alias-bg-overlay\)\)/,
    '菜单面板必须优先采用 elevated 提升层背景',
  )
  assert.match(
    stylesSrc,
    /backdrop-filter:\s*blur\(16px\)/,
    '菜单面板必须具备 16px 苹果级毛玻璃滤镜',
  )
  assert.match(
    stylesSrc,
    /animation:\s*omnimux-menu-pop\s*120ms/,
    '菜单面板必须声明平滑进场淡入微动效',
  )

  // 4. 几何与内切圆角契约：10px 外框、4px 内边距与 6px 内切圆角
  assert.match(
    stylesSrc,
    /border-radius:\s*10px/,
    '菜单面板外框必须使用 10px 标准圆角',
  )
  assert.match(
    stylesSrc,
    /padding:\s*4px/,
    '菜单面板内边距必须保持 4px 规范',
  )
  assert.match(
    stylesSrc,
    /\.omnimux-folder-menu\s*\[role=menuitem\][^{]*\{[^}]*border-radius:\s*6px/,
    '菜单子项圆角必须严格满足 10px - 4px = 6px 内切几何',
  )
  assert.match(
    stylesSrc,
    /\.omnimux-folder-menu\s*\[role=menuitem\][^{]*\{[^}]*height:\s*32px/,
    '菜单子项必须遵循 32px 控件高基准',
  )

  // 5. 危险项色彩契约：必须消费官方错误状态令牌，严禁裸色
  assert.match(
    stylesSrc,
    /color:\s*var\(--dsw-alias-state-error-primary\)/,
    '危险操作文字与图标必须使用官方错误语义状态色',
  )
  assert.match(
    stylesSrc,
    /color-mix\(in\s*srgb,\s*var\(--dsw-alias-state-error-primary\)\s*12%,\s*transparent\)/,
    '危险项悬停微光必须使用 color-mix 保持纯令牌消费',
  )
})
