import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanScriptDisplay } from '../../plugins/omnimux-inspiration/src/structure-script.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 灵感弹窗全面升级对齐视频分析工具双栏工作台布局与分镜卡片视觉验证', () => {
  const modalPath = path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx')
  const stylesPath = path.join(root, 'plugins/omnimux-inspiration/src/client/styles.js')

  const modalContent = fs.readFileSync(modalPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  // 1. 验证台词文本清洗函数纯净化能力 (针对用户截图中的真实脏文本)
  const dirty1 = 'Overlay): "**{Hook_Title}**<br>**{Model_List_Line_1}**"'
  assert.equal(cleanScriptDisplay(dirty1), '{Hook_Title} {Model_List_Line_1}')

  const dirty2 = '(CTA Banner): "**{CTA_Action}**"'
  assert.equal(cleanScriptDisplay(dirty2), '{CTA_Action}')

  const dirty3 = '（口播）：这真的是我发现的宝藏！<br/>千万别错过。'
  assert.equal(cleanScriptDisplay(dirty3), '这真的是我发现的宝藏！ 千万别错过。')

  // 2. 验证双栏视听工作台架构 (左侧大播放器+元数据栏，右侧分镜/结构双重视角)
  assert.ok(
    modalContent.includes('omnimux-inspiration-modal-body is-workbench') &&
    modalContent.includes('omnimux-inspiration-workbench-left') &&
    modalContent.includes('omnimux-inspiration-workbench-right'),
    'InspirationPreviewModal 必须采用 is-workbench 双栏视听工作台架构',
  )
  assert.ok(
    modalContent.includes('omnimux-inspiration-player-meta-box') &&
    modalContent.includes('omnimux-inspiration-player-meta-row'),
    '播放器下方必须呈现精炼视频元数据（来源、作者、时长）',
  )

  // 3. 验证右侧分段选项卡 (Segmented Tabs: shots ↔ structure)
  assert.ok(
    modalContent.includes('omnimux-inspiration-segmented-bar') &&
    modalContent.includes('omnimux-inspiration-segmented-container') &&
    modalContent.includes('omnimux-inspiration-segmented-btn'),
    '必须具备标准分段切换栏支持【分镜脚本】与【结构拆解】双重视角',
  )

  // 4. 验证分镜卡片的高级视听表现与声画联动
  assert.ok(
    modalContent.includes('omnimux-inspiration-shot-speech-container') &&
    modalContent.includes('omnimux-inspiration-shot-speech-icon') &&
    modalContent.includes('cleanScriptDisplay(shot.script)'),
    '分镜卡片必须具备专属麦克风图标气泡并消费清洗后的纯净台词',
  )
  assert.ok(
    modalContent.includes('currentShotIndex === sIdx') &&
    modalContent.includes('omnimux-inspiration-shot-playing-badge'),
    '当前播放分镜必须动态点亮播放中呼吸灯徽标',
  )

  // 5. 验证样式表包含双栏弹性与脉冲呼吸灯动画
  assert.ok(
    stylesContent.includes('.omnimux-inspiration-modal-body.is-workbench') &&
    stylesContent.includes('.omnimux-inspiration-workbench-left') &&
    stylesContent.includes('.omnimux-inspiration-workbench-right') &&
    stylesContent.includes('@keyframes omnimux-pulse'),
    'styles.js 必须包含完整的双栏工作台与呼吸灯动画样式',
  )
})
