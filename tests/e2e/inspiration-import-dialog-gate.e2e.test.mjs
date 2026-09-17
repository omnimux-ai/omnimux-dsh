import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 灵感导入弹窗智能链接分析与导入按钮状态门禁联动验证', () => {
  const dialogPath = path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationInlineImportDialog.jsx')
  const localesPath = path.join(root, 'plugins/omnimux-inspiration/src/client/locales.js')

  const dialogContent = fs.readFileSync(dialogPath, 'utf-8')
  const localesContent = fs.readFileSync(localesPath, 'utf-8')

  // 1. 验证导入弹窗具备分析中状态标识与请求追踪引用
  assert.ok(
    dialogContent.includes("const [classifying, setClassifying] = useState(false)") &&
    dialogContent.includes("const classifyReqRef = useRef(0)"),
    'InspirationInlineImportDialog 必须定义 classifying 状态及 classifyReqRef 请求追踪以防止竞态',
  )

  // 2. 验证分析中即刻阻断与导入按钮禁用判定逻辑
  assert.ok(
    dialogContent.includes("const isClassifiedValid = Boolean(") &&
    dialogContent.includes("classified.kind === 'content' || classified.kind === 'account'") &&
    dialogContent.includes("const canSubmit = !loading && !classifying && isClassifiedValid") &&
    dialogContent.includes("disabled={!canSubmit}"),
    '导入按钮必须基于 !canSubmit 进行 disabled 控制，未分析或分析中必须不可用',
  )

  // 3. 验证输入变更时即刻清除旧判决并切换到分析中状态
  assert.ok(
    dialogContent.includes("setClassifying(true)") &&
    dialogContent.includes("setClassified(null)"),
    'URL 输入变动时必须立即将旧判定作废并将状态重置为分析中',
  )

  // 4. 验证回显区域支持分析中文案展示
  assert.ok(
    dialogContent.includes("{classifying ? (") &&
    dialogContent.includes("t('add.analyzingUrl')"),
    '分析中状态必须在回显区域展示 add.analyzingUrl 提示',
  )

  // 5. 验证中英文多语言词条对齐
  assert.ok(
    localesContent.includes("'add.analyzingUrl': '正在分析并校验链接，请稍候…'") &&
    localesContent.includes("'add.analyzingUrl': 'Analyzing and verifying URL, please wait…'"),
    'locales.js 必须具备中英文双语 add.analyzingUrl 词条',
  )
})
