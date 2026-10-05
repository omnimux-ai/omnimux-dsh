/**
 * tests/e2e/google-vids-split-stage.e2e.test.mjs
 *
 * 《Google Vids 中间栏主舞台与视频剪辑同屏》端到端测试与质量验收（Issue #2698）
 * 依据 .workbuddy/prd/google-vids-split-stage-spec.prd.md 与 specs/google-vids-split-stage.spec.md
 * 验证：
 *  1. 双栏同屏拓扑与 Stage CSS 规则豁免 (AC-1)
 *  2. 极简 SaaS 文案字典与 UI 元素白名单审查 (AC-2)
 *  3. 跨栏数据流闭环：→ 插入 到 Clip 主视频轨 (AC-3)
 *  4. 门禁状态自愈与输入框联动 (AC-4)
 *  5. 退出主舞台生命周期与会话恢复 (AC-5)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')

test('E2E: Google Vids 中间栏主舞台与视频剪辑同屏全链路质量验收 (#2698)', async (t) => {
  await t.test('E2E-AC-1: 双栏同屏架构与 STAGE_CSS_CLASS_MAP 豁免契约', () => {
    const convBoxPath = path.join(root, 'plugins/omnimux/src/client/conversation-box.js')
    assert.ok(fs.existsSync(convBoxPath), 'conversation-box.js 必须存在')
    const convBoxSrc = fs.readFileSync(convBoxPath, 'utf8')

    // 1. STAGE_CSS_CLASS_MAP 包含 omnimux-vids
    assert.match(
      convBoxSrc,
      /'omnimux-vids':\s*'omnimux-vids-stage'/,
      'STAGE_CSS_CLASS_MAP 必须注册 omnimux-vids 舞台样式类',
    )

    // 2. PRODUCT_STAGE_CHROME 豁免 omnimux-vids 不隐藏 betterSidebar / toggleCluster
    assert.match(
      convBoxSrc,
      /html\[data-dsh-product-stage\]:not\(\[data-dsh-product-stage="omnimux-apps"\]\):not\(\[data-dsh-product-stage="omnimux-vids"\]\)\s+\[data-dsh-better-sidebar\]/,
      'PRODUCT_STAGE_CHROME 必须豁免 omnimux-vids 保持 betterSidebar 展开',
    )

    // 3. manifest 声明 shell.overlay slot
    const manifestPath = path.join(root, 'plugins/omnimux-video/dsh.manifest.json')
    assert.ok(fs.existsSync(manifestPath), 'manifest.json 必须存在')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const overlaySlot = manifest.capabilities.slots.find(
      (s) => s.target === 'shell.overlay' && s.componentPath === 'src/client/GoogleVidsStage.jsx',
    )
    assert.ok(overlaySlot, 'manifest.capabilities.slots 必须声明 shell.overlay 指向 GoogleVidsStage.jsx')
  })

  await t.test('E2E-AC-2: 极简 SaaS 文案字典与 UI 元素白名单 100% 审查', () => {
    const stagePath = path.join(root, 'plugins/omnimux-video/src/client/GoogleVidsStage.jsx')
    assert.ok(fs.existsSync(stagePath), 'GoogleVidsStage.jsx 必须存在')
    const stageSrc = fs.readFileSync(stagePath, 'utf8')

    // 1. 顶部 Header 白名单
    assert.match(stageSrc, /Google Vids/, '主标题必须严格为 Google Vids')
    assert.match(stageSrc, /内测版/, '微标必须严格为 内测版')
    assert.match(stageSrc, /向导/, '按钮必须严格为 向导')
    assert.doesNotMatch(stageSrc, /开箱向导/, '严禁加长为开箱向导')
    assert.doesNotMatch(stageSrc, /体验版|高画质|全新/, '严禁营销修饰词')

    // 2. 门禁提示条白名单
    assert.match(stageSrc, /请在右侧创建或打开剪辑工程/, '门禁必须严格为 请在右侧创建或打开剪辑工程')
    assert.match(stageSrc, /新建工程/, '动作键必须严格为 新建工程')
    assert.doesNotMatch(stageSrc, /右侧进入项目/, '严禁包含方向错位的旧指引')

    // 3. 生成记录白名单
    assert.match(stageSrc, /生成记录 \(/, '生成记录列表标题必须为 生成记录 (n)')
    assert.doesNotMatch(stageSrc, /时间线|历史记录/, '严禁违规词汇')
    assert.match(stageSrc, /正在生成视频\.\.\./, '生成中文案必须为 正在生成视频...')
    assert.match(stageSrc, /取消/, '取消按钮文案锁定为 取消')
    // Issue #3181：插入动作改用 Google Vids 官方动词「插入」（不再带方向箭头）
    assert.match(stageSrc, /插入/, '插入动作必须为 插入')
    assert.doesNotMatch(stageSrc, /← 插入|→ 插入/, '严禁保留方向箭头写法')
    assert.match(stageSrc, /延续/, '动作按钮锁定为 延续')
    assert.match(stageSrc, /修改/, '动作按钮锁定为 修改')
    assert.match(stageSrc, /移除/, '破坏性按钮锁定为 移除')
    // Issue #3181：删除伪造进度的「升频」能力（官方生成流程无此步骤）
    assert.doesNotMatch(stageSrc, /升频|handleUpscale/, '严禁保留伪造进度的升频动作')

    // 4. 四大模式 2 字纯名词 Tab（Issue #3181：文案真源迁至 shared/veoTaskSpec.js）
    const specSrc = fs.readFileSync(
      path.join(root, 'plugins/omnimux-video/src/shared/veoTaskSpec.js'),
      'utf8',
    )
    assert.match(specSrc, /label: '创建'/, '模式 Tab 必须为 创建')
    assert.match(specSrc, /label: '修改'/, '模式 Tab 必须为 修改')
    assert.match(specSrc, /label: '动画'/, '模式 Tab 必须为 动画')
    assert.match(specSrc, /label: '延续'/, '模式 Tab 必须为 延续（官方标签）')
    assert.doesNotMatch(specSrc, /label: '扩展'/, '严禁再使用旧标签 扩展')
    // Tab 标签必须是 2 字纯名词；动宾短语只允许出现在模式说明 title 上
    assert.doesNotMatch(specSrc, /label: '添加动画'/, '严禁把动宾短语写成 Tab 标签')
    assert.match(stageSrc, /VIDS_MODES/, 'Tab 标签必须从契约真源派生')

    // 5. 动态占位符字典（Issue #3181：迁至契约真源，文案同步四模式）
    assert.equal(specSrc.includes('请先在右侧创建或打开剪辑工程...'), true, '未就绪占位符真源缺失')
    assert.equal(specSrc.includes('描述要生成的画面与动作'), true, '创建模式占位符真源缺失')
    assert.equal(specSrc.includes('描述要调整的主体、服装或光影'), true, '修改模式占位符真源缺失')
    assert.equal(specSrc.includes('描述图片中元素如何运动、镜头如何移动'), true, '动画模式占位符真源缺失')
    assert.equal(specSrc.includes('描述这个片段结尾之后发生什么'), true, '延续模式占位符真源缺失')

    // 6. 严禁装饰 Emoji 检查
    assert.doesNotMatch(stageSrc, /[💎✨🔥⚙️🗑️🎬⚡]/, '绝对禁止包含任何装饰性 Emoji')
  })

  await t.test('E2E-AC-3: 侧边栏条目先开右侧剪辑再 claim 中栏，且分屏焦点由 open 决定', () => {
    const sidebarSrc = fs.readFileSync(
      path.join(root, 'plugins/omnimux-video/src/client/sidebar-entry.js'),
      'utf8',
    )
    // 1. 必须先 await 打开 Clip 右侧栏 Tab，并由 open 自身决定 split 分屏焦点
    assert.match(
      sidebarSrc,
      /const opened = await workbench\.open\(\{\s*tabId:\s*'omnimux-clip:studio',\s*title:\s*'视频剪辑',\s*focus:\s*'split',\s*\}\)/,
      '点击必须 await 打开右侧视频剪辑工程并指定 split 分屏',
    )
    // 2. 仅当返回严格为 true 时才 claim 中栏
    assert.match(
      sidebarSrc,
      /if \(!mounted \|\| opened !== true\) return\s*\n\s*stage\.claim\('omnimux-vids'\)/,
      '仅当 Clip 打开成功（严格 true）且条目仍挂载时才 claim 中栏',
    )
    // 3. 禁止再独立写 setFocus，分屏焦点只能来自 open
    assert.doesNotMatch(
      sidebarSrc,
      /setFocus/,
      '分屏焦点必须由 open(focus) 决定，禁止再单独调用 setFocus',
    )
    // 4. 仍需监听 dsh-product-stage 事件实现高亮自适应
    assert.match(
      sidebarSrc,
      /dsh-product-stage/,
      '侧栏条目必须监听 dsh-product-stage 事件实现高亮自适应',
    )
  })

  await t.test('E2E-AC-4: OpenReelStudioTab 状态广播与无缝追加到 V1 轨道', () => {
    const clipTabSrc = fs.readFileSync(
      path.join(root, 'plugins/omnimux-clip/src/client/OpenReelStudioTab.jsx'),
      'utf8',
    )
    assert.match(
      clipTabSrc,
      /omnimux-clip:editor-status/,
      '必须向外广播 omnimux-clip:editor-status 事件',
    )
    assert.match(
      clipTabSrc,
      /omnimux-clip:insert/,
      '必须监听 omnimux-clip:insert 事件',
    )
    assert.match(
      clipTabSrc,
      /t\.type === 'video'/,
      '必须寻获主视频轨 V1',
    )
    assert.match(
      clipTabSrc,
      /insertStartTime/,
      '必须按末尾时间无缝 0 间距追加',
    )
  })

  await t.test('E2E-AC-5: 退出主舞台契约与会话恢复', () => {
    const stageSrc = fs.readFileSync(
      path.join(root, 'plugins/omnimux-video/src/client/GoogleVidsStage.jsx'),
      'utf8',
    )
    assert.match(
      stageSrc,
      /window\.__omnimuxStage\.release\('omnimux-vids'\)/,
      '关闭按钮必须触发 release(omnimux-vids)',
    )
    assert.match(
      stageSrc,
      /dsh-product-stage/,
      '关闭时必须派发空舞台事件让宿主恢复会话',
    )
  })
})
