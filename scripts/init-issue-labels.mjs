#!/usr/bin/env node
/**
 * scripts/init-issue-labels.mjs
 * Synchronize standard GitHub labels for the Issue-driven Agent pipeline.
 * Contract: docs/contracts/agent-issue-lifecycle.md
 *
 * Usage:
 *   node scripts/init-issue-labels.mjs
 *   node scripts/init-issue-labels.mjs --dry-run
 */

import { spawnSync } from 'node:child_process'

export const LABELS = [
  // Status labels
  { name: 'status:triage', color: 'ededed', description: '待需求定界与查重 (许清楚)' },
  { name: 'status:planning', color: 'd4c5f9', description: '架构设计、DoD 与风险定级中 (高见远)' },
  { name: 'status:ready-to-run', color: 'a2eeef', description: 'R2/R3 且维护者显式预授权，可触发全自动流水线' },
  { name: 'status:pipeline-running', color: '6f42c1', description: '自动流水线已取得 Issue 锁，禁止重复运行' },
  { name: 'status:in-progress', color: 'fbca04', description: '专属 Worktree 隔离编码与单测中 (林深)' },
  { name: 'status:qa-review', color: '0e8a16', description: 'PR 已发起，L0-L3 质量验收中 (严过关)' },
  { name: 'status:ready-for-boss', color: '1d76db', description: '旧交接状态；由协调 Agent 核对任务授权及证据后继续' },
  { name: 'status:auto-merge-pending', color: '5319e7', description: '质量已通过，等待受控自动合入确认' },
  { name: 'status:auto-merged', color: '6f42c1', description: '自动合入、物化与收尾全部完成' },
  { name: 'status:blocked', color: 'b60205', description: '授权、门禁、合入或收尾被阻断，保留现场' },

  // Track labels
  { name: 'track:A-dynamic', color: 'bfd4f2', description: 'Track A: 动态轻量插件 / 临时工具' },
  { name: 'track:B-stage', color: '5319e7', description: 'Track B: OmniMux 产品级 Stage 一级页' },
  { name: 'track:C-service', color: '1d76db', description: 'Track C: 标准服务与通用工具包' },
  { name: 'track:D-patch', color: 'd93f0b', description: 'Track D: 增量热修与版本迭代' },

  // QA verdicts
  { name: 'qa:pass', color: '0e8a16', description: 'CI 聚合 L0-L3 真实全绿（仅机器人写入）' },
  { name: 'qa:changes-requested', color: 'b60205', description: '严过关发现阻断项，需修复后复检' },

  // Risk labels
  { name: 'risk:R0', color: 'b60205', description: 'R0：核对高风险动作明确授权及适用证据' },
  { name: 'risk:R1', color: 'd93f0b', description: 'R1：跨插件/一级页/契约/CI，由协调 Agent 验收交付' },
  { name: 'risk:R2', color: '0e8a16', description: 'R2：单插件常规变更，显式预授权可自动' },
  { name: 'risk:R3', color: '1d76db', description: 'R3：低风险文档/测试/格式化，显式预授权可自动' },

  // Priority
  { name: 'priority:P0', color: 'b60205', description: '最高优先级 / 阻断性故障' },
  { name: 'priority:P1', color: 'e99695', description: '常规需求 / 核心特性' },
  { name: 'priority:P2', color: 'fef2c0', description: '低优先级 / 优化改进' },
]

export const REPO = 'laozhong86/omnimux-dsh'
const dryRun = process.argv.includes('--dry-run')

function syncLabel(label) {
  const args = [
    'label', 'create', label.name,
    '--repo', REPO,
    '--color', label.color,
    '--description', label.description,
    '--force',
  ]
  if (dryRun) {
    console.log(`[dry-run] gh ${args.join(' ')}`)
    return true
  }
  const result = spawnSync('gh', args, { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`✗ 标签同步失败: ${label.name} (exit ${result.status ?? 1})`)
    return false
  }
  console.log(`✓ Synchronized label: ${label.name}`)
  return true
}

console.log(`[init-labels] Synchronizing ${LABELS.length} labels for ${REPO}${dryRun ? ' (dry-run)' : ''}...`)
const failures = LABELS.filter(label => !syncLabel(label))
if (failures.length > 0) {
  console.error(`[init-labels] ${failures.length} label(s) failed`)
  process.exit(1)
}
console.log('[init-labels] Done.')
