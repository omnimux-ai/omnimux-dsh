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
  parts.push('📖 必读文档：请阅读项目根目录 [design.md](design.md)（§1.1 官方 Token 体系、§2.1 32px 控件基准高、§2.2 8px 圆角体系、§3 色彩映射表、§4.2 字阶白名单）')
  parts.push('👉 修复示范：')
  parts.push("  - 控件替代: 导入并使用 dsh-ui-kit (如 `import { Button, DropdownSelect } from 'dsh-ui-kit'`)")
  parts.push("  - 色彩 Token: 强制消费官方语义 Token `var(--dsw-alias-bg-base)` 与 `var(--dsw-alias-label-primary)`")
  parts.push("  - 规范豁免: 如属特殊特化场景，在违规行添加显式豁免注释 (如 `// exempt-ui01 <业务原因>`, `// exempt-ui03 <业务原因>`, `// exempt-ui10 <业务原因>`)")

  return parts.join('\n')
}
