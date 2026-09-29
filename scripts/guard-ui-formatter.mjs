/**
 * scripts/guard-ui-formatter.mjs
 * High-Impact Denial Reason Formatter for PreToolUse UI Design Guard
 * Contract: docs/system_design.md §5, design.md (L1)
 */

/**
 * 格式化输出具有强引导力与冲击力的拦截错误诊断
 * @param {Array<Object>} violations
 * @param {string} filePath
 * @returns {string} formatted markdown
 */
export function formatDenyReason(violations, filePath) {
  const parts = [
    '🚫【UI 设计规范硬门禁拦截】你的代码写入被物理打断！',
    '────────────────────────────────────────────────────────',
    `📍 目标文件: ${filePath || '当前编辑代码'}`,
    `❌ 检测到 ${violations.length} 处违反 L1 级设计规范：`,
    '',
  ]

  violations.forEach((v) => {
    parts.push(`[${v.ruleCode}] 第 ${v.lineNum} 行:`)
    parts.push(`  代码: ${v.lineText.trim()}`)
    parts.push(`  原因: ${v.message}`)
    parts.push(`  正解: ${v.fix}`)
    parts.push(`  必读: ${v.designSection}`)
    parts.push('')
  })

  parts.push('────────────────────────────────────────────────────────')
  parts.push('📖 必读文档：请阅读项目根目录 [design.md](design.md) 并按违规项的「正解」修正代码。')
  parts.push('👉 强制动作：按上方每条违规的正解改写代码后重试；禁止以旁路注释或脚本绕过门禁。')

  return parts.join('\n')
}
