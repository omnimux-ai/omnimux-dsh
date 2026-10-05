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
  await t.test('E2E-AC-1: main 插槽座位与产品舞台去耦契约（Issue #3165）', () => {
    const convBoxPath = path.join(root, 'plugins/omnimux/src/client/conversation-box.js')
    assert.ok(fs.existsSync(convBoxPath), 'conversation-box.js 必须存在')
    const convBoxSrc = fs.readFileSync(convBoxPath, 'utf8')

    // 1. Vids 已迁至官方 main 插槽，不得再保留产品舞台样式类
    assert.doesNotMatch(
      convBoxSrc,
      /'omnimux-vids':\s*'omnimux-vids-stage'/,
      'STAGE_CSS_CLASS_MAP 不得再为 main 插槽面板保留 omnimux-vids 舞台类',
    )

    // 2. PRODUCT_STAGE_CHROME 不得再引用 omnimux-vids 舞台（该 overlay 舞台已不存在）
    assert.doesNotMatch(
      convBoxSrc,
      /data-dsh-product-stage="omnimux-vids"/,
      'PRODUCT_STAGE_CHROME 不得再引用 omnimux-vids 舞台',
    )

    // 3. manifest 声明 main slot，且不得再声明 shell.overlay
    const manifestPath = path.join(root, 'plugins/omnimux-video/dsh.manifest.json')
    assert.ok(fs.existsSync(manifestPath), 'manifest.json 必须存在')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const mainSlot = manifest.capabilities.slots.find(
      (s) => s.target === 'main' && s.componentPath === 'src/client/GoogleVidsStage.jsx',
    )
    assert.ok(mainSlot, 'manifest.capabilities.slots 必须声明 main 指向 GoogleVidsStage.jsx')
    assert.equal(
      manifest.capabilities.slots.some((s) => s.target === 'shell.overlay'),
      false,
      'Vids 不得再注册 shell.overlay 产品舞台',
    )
  })

  await t.test('E2E-AC-2: 极简 SaaS 文案字典与 UI 元素白名单 100% 审查', () => {
    const stagePath = path.join(root, 'plugins/omnimux-video/src/client/GoogleVidsStage.jsx')
    assert.ok(fs.existsSync(stagePath), 'GoogleVidsStage.jsx 必须存在')
    const stageSrc = fs.readFileSync(stagePath, 'utf8')
    // 模式 Tab 与占位符的真源是共享 spec，舞台只负责渲染 tab.label / placeholder
    const specPath = path.join(root, 'plugins/omnimux-video/src/shared/veoTaskSpec.js')
    assert.ok(fs.existsSync(specPath), 'veoTaskSpec.js 必须存在')
    const specSrc = fs.readFileSync(specPath, 'utf8')

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
    assert.match(stageSrc, /正在升频画质\.\.\./, '升频中文案必须为 正在升频画质...')
    assert.match(stageSrc, /取消/, '取消按钮文案锁定为 取消')
    assert.match(stageSrc, /→ 插入/, '插入动作必须严格为 → 插入（指向右侧）')
    assert.doesNotMatch(stageSrc, /← 插入/, '绝对禁止写成 ← 插入')
    assert.match(stageSrc, /延续/, '动作按钮锁定为 延续')
    assert.match(stageSrc, /修改/, '动作按钮锁定为 修改')
    assert.match(stageSrc, /升频/, '动作按钮锁定为 升频')
    assert.match(stageSrc, /移除/, '破坏性按钮锁定为 移除')

    // 4. 四大模式 2 字纯名词 Tab（渲染自 VEO_TASK_SPEC.modes）
    assert.match(stageSrc, /VEO_TASK_SPEC\.modes\.map/, '模式 Tab 必须渲染自 VEO_TASK_SPEC.modes')
    for (const label of ['创建', '修改', '动画', '扩展']) {
      assert.equal(
        new RegExp(`label: '${label}'`).test(specSrc),
        true,
        `模式 Tab 必须为 ${label}`,
      )
    }
    assert.doesNotMatch(specSrc, /添加动画/, '严禁写成动宾短语 添加动画')
    assert.doesNotMatch(stageSrc, /添加动画/, '严禁写成动宾短语 添加动画')

    // 5. 动态占位符字典（真源同在上表）
    assert.equal(
      specSrc.includes('请先在右侧创建或打开剪辑工程...'),
      true,
      '未就绪占位符真源缺失',
    )
    for (const placeholder of [
      '描述您想生成的视频画面与动作...',
      '描述需要对当前视频进行的调整（如光影或服装风格）...',
      '描述图像素材中应展现的动作与运镜细节...',
      '描述当前视频结尾后续发生的情节发展...',
    ]) {
      assert.equal(
        specSrc.includes(placeholder),
        true,
        `占位符真源缺失: ${placeholder}`,
      )
    }

    // 6. 严禁装饰 Emoji 检查
    assert.doesNotMatch(stageSrc, /[💎✨🔥⚙️🗑️🎬⚡]/, '绝对禁止包含任何装饰性 Emoji')
  })

  await t.test('E2E-AC-3: 侧边栏条目先开右侧剪辑再选中 main 面板，且分屏焦点由 open 决定', () => {
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
    // 2. 仅当返回严格为 true 且条目仍挂载时，才用宿主 layout 选中 main 面板
    assert.match(
      sidebarSrc,
      /if \(!mounted \|\| opened !== true\) return/,
      '仅当 Clip 打开成功（严格 true）且条目仍挂载时才继续',
    )
    assert.match(
      sidebarSrc,
      /layoutHandle\.selectPanel\('omnimux-vids'\)/,
      '成功后必须用宿主 layout 选中 omnimux-vids 面板',
    )
    // 3. main 插槽面板不得 claim 产品舞台：产品舞台 chrome 会隐藏会话列中的 main 面板本身
    assert.doesNotMatch(
      sidebarSrc,
      /claimProductStage|stage\.claim\(|__omnimuxStage/,
      'main 插槽面板不得 claim 产品舞台',
    )
    // 4. 禁止再独立写 setFocus，分屏焦点只能来自 open
    assert.doesNotMatch(
      sidebarSrc,
      /setFocus/,
      '分屏焦点必须由 open(focus) 决定，禁止再单独调用 setFocus',
    )
    // 5. 激活态由宿主 panelInfo 投影，不再依赖 dsh-product-stage 事件
    assert.match(
      sidebarSrc,
      /panelInfo/,
      '侧栏条目必须由宿主 panelInfo 投影激活态',
    )
    assert.doesNotMatch(
      sidebarSrc,
      /dsh-product-stage/,
      '侧栏条目不得再依赖 dsh-product-stage 事件',
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

  await t.test('E2E-AC-5: 退出 main 面板与会话恢复', () => {
    const stageSrc = fs.readFileSync(
      path.join(root, 'plugins/omnimux-video/src/client/GoogleVidsStage.jsx'),
      'utf8',
    )
    assert.match(
      stageSrc,
      /layout\.selectPanel\(null\)/,
      '关闭按钮必须把面板选择交还宿主原生会话',
    )
    assert.doesNotMatch(
      stageSrc,
      /__omnimuxStage|release\('omnimux-vids'\)|dsh-product-stage|dshProductStage/,
      'main 插槽面板关闭时不得操作产品舞台或派发舞台事件',
    )
  })
})
