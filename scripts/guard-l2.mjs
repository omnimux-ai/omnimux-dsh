#!/usr/bin/env node
/**
 * scripts/guard-l2.mjs
 * dsh-hooks-plugin PreToolUse Guard for OmniMux L2 Independent Testing
 *
 * 【L2 独立环境实时前置守卫与预警】
 * 在模型执行提交（git commit）、推送（git push）、创建 PR（gh pr create）或收尾合并时，
 * 实时嗅探当前变更是否包含 UI/客户端代码。
 *
 * 核心设计原则：
 * 1. 提早提醒：不在最后的 CI/合并阻塞，而是在模型尝试进行提交操作的第一时间发出预警；
 * 2. 用户可控：支持用户通过 .dsh/l2-guard.json 或环境变量配置模式：
 *    - "ask"  (默认推荐): 挂起工具并向用户弹出确认框，由人类用户决定是否放行本次操作；
 *    - "warn" (仅告警):   放行工具调用，但在控制台输出醒目的预警信息，保留警示现场；
 *    - "deny" (严格阻断): 直接阻断该操作，并给出标准的 pnpm wt dev <topic> 指引；
 *    - "off"  (关闭守卫): 静默放行。
 * 3. 0 误报：纯后端、纯脚本、纯文档变更自动 100% 毫秒级放行，无任何阻碍。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// 复用仓库官方 UI 变更判定规则 (覆盖 client, web, Stage, 及所有 UI/样式组件扩展名)
export const UI_FILE_RE = /(?:^|[\\/])(?:client|apps|web)(?:[\\/]|$)|Stage\.(?:js|jsx|ts|tsx)$|\.(?:jsx|tsx|vue|svelte|html|css|scss)$/i

// 针对代码版本提交与合并收尾的敏感命令特征
export const SENSITIVE_COMMAND_RE = /\b(?:git\s+commit|git\s+push|gh\s+pr\s+create|git-wt\.sh\s+finish|pnpm\s+wt\s+finish|--skip-l2)\b/i

/**
 * 寻找当前 Git 根目录或 Worktree 根目录
 */
export function findGitRoot(startDir = process.cwd()) {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return root || startDir
  } catch {
    return startDir
  }
}

/**
 * 读取用户可控配置
 */
export function loadGuardConfig(repoRoot) {
  // 1. 环境变量最高优先级
  const envMode = process.env.OMNIMUX_L2_GUARD_MODE?.toLowerCase().trim()
  if (envMode && ['ask', 'warn', 'deny', 'off'].includes(envMode)) {
    return { mode: envMode, source: 'env' }
  }

  // 2. 查找 .dsh/l2-guard.json
  const configPath = join(repoRoot, '.dsh', 'l2-guard.json')
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
      const mode = String(parsed.mode || '').toLowerCase().trim()
      if (['ask', 'warn', 'deny', 'off'].includes(mode)) {
        return { mode, source: configPath, ...parsed }
      }
    } catch {}
  }

  // 3. 默认配置为 ask 模式（交互确认，人类完全掌控）
  return { mode: 'ask', source: 'default' }
}

/**
 * 获取当前工作区的所有变动文件（已暂存、未暂存、及分支新增提交）
 */
export function getModifiedFiles(cwd) {
  const files = new Set()
  const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }

  // 1. 本地未提交的变动文件 (status --porcelain)
  try {
    const statusOut = execFileSync('git', ['status', '--porcelain'], options)
    for (const line of statusOut.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // 取后半部分路径（处理 rename 的情况）
      const parts = trimmed.split(/\s+/)
      const filePath = parts[parts.length - 1]
      if (filePath) files.add(filePath.replace(/\\/g, '/'))
    }
  } catch {}

  // 2. 分支未合并进 origin/main 的提交中修改的文件
  try {
    const diffOut = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], options)
    for (const line of diffOut.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) files.add(trimmed.replace(/\\/g, '/'))
    }
  } catch {}

  return Array.from(files)
}

/**
 * 检查当前工作区是否拥有合法的 L2 运行或验证记录
 * 向上回溯查找 .l2-dev.env 文件
 */
export function checkL2Status(startDir) {
  let cur = resolve(startDir)
  for (let i = 0; i < 6; i++) {
    const envPath = join(cur, '.l2-dev.env')
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf8')
        const portMatch = content.match(/^PORT=(\d+)/m)
        const urlMatch = content.match(/^URL=(https?:\/\/[^\s]+)/m)

        if (portMatch && urlMatch) {
          return {
            verified: true,
            port: portMatch[1],
            url: urlMatch[1],
            envPath,
          }
        }
      } catch {}
    }
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }

  return { verified: false, reason: 'missing-l2-env' }
}

/**
 * 核心判定逻辑
 */
export function decideL2Guard({ command, cwd = process.cwd(), filesOverride = null, configOverride = null }) {
  if (!command || typeof command !== 'string') {
    return { decision: 'allow' }
  }

  // 1. 过滤非敏感命令：如果不是 git commit / push / pr / finish / --skip-l2，立即放行
  if (!SENSITIVE_COMMAND_RE.test(command)) {
    return { decision: 'allow', reason: 'non-sensitive-command' }
  }

  const root = findGitRoot(cwd)
  const config = configOverride || loadGuardConfig(root)

  // 如果用户设为 off，直接关闭放行
  if (config.mode === 'off') {
    return { decision: 'allow', reason: 'guard-off' }
  }

  // 2. 检查改动文件列表
  const files = filesOverride || getModifiedFiles(cwd)
  const uiFiles = files.filter((f) => UI_FILE_RE.test(f))

  // 3. 0 误报：如果没有修改任何 UI 文件，即使执行提交也完全放行
  if (uiFiles.length === 0) {
    return { decision: 'allow', reason: 'no-ui-files' }
  }

  // 4. 检查是否试图用 --skip-l2 绕过 UI 验证
  const isBypassingWithFlag = /--skip-l2\b/i.test(command)
  if (isBypassingWithFlag) {
    const bypassReason = [
      '⚠️【OmniMux L2 门禁安全警示】检测到命令试图使用 `--skip-l2` 跳过独立验证，但当前改动包含 UI 界面文件！',
      `📌 涉及 UI 文件: ${uiFiles.slice(0, 3).join(', ')}${uiFiles.length > 3 ? ` 等共 ${uiFiles.length} 个文件` : ''}`,
      '📌 规范要求：`--skip-l2` 仅允许纯文档或纯后端逻辑使用，UI 变更必须在 L2 环境核验，避免波形/界面回归事故。',
      '👉 正确做法：请运行 `pnpm wt dev <topic>` 启动独立端口进行真实视觉和交互核验后再交付。',
    ].join('\n')

    if (config.mode === 'deny') {
      return {
        decision: 'deny',
        reason: 'bypass-disallowed-for-ui',
        message: bypassReason,
        uiFiles,
      }
    }
    if (config.mode === 'ask') {
      return {
        decision: 'ask',
        reason: 'bypass-confirmation-required',
        message: bypassReason + '\n\n❓ 是否确认由人工授权跳过 L2 验证并继续执行？',
        uiFiles,
      }
    }
    // warn 模式
    return {
      decision: 'allow',
      warning: true,
      reason: 'warn-on-bypass',
      message: bypassReason,
      uiFiles,
    }
  }

  // 5. 检查 L2 验证状态 (优先从当前 cwd 向上查找，也可从 root 查找)
  const l2Status = checkL2Status(cwd) || checkL2Status(root)
  if (l2Status.verified) {
    // 已经启动过独立 L2 环境，记录存在，放行
    return {
      decision: 'allow',
      reason: 'l2-verified',
      l2Port: l2Status.port,
      l2Url: l2Status.url,
    }
  }

  // 6. 核心拦截与预警分发（有 UI 改动，但尚未经过 L2 独立环境验证）
  const warningText = [
    '⚠️【OmniMux L2 独立测试前置提醒】',
    `检测到当前操作准备提交/推送代码，且包含前端 UI 界面改动（共 ${uiFiles.length} 个文件，如 ${uiFiles.slice(0, 2).join(', ')}），但当前工作区尚未启动独立 L2 环境（端口 44201–44299）进行验证！`,
    '📌 事故防范：历史复盘表明，未在独立环境验证视觉与交互容易导致音频波形失真、按钮遮挡等界面回归并被误发布。',
    '👉 建议操作：',
    '  1. 运行: pnpm wt dev <topic> [issue_id] 启动独立隔离环境；',
    '  2. 验证浏览器渲染与交互表现；',
    '  3. 确认无误后再执行提交或发起 PR。',
    '⚙️ 本守卫由用户可控：可在 .dsh/l2-guard.json 中切换 mode 为 "ask"(询问), "warn"(告警), "deny"(阻断), "off"(关闭)。',
  ].join('\n')

  if (config.mode === 'deny') {
    return {
      decision: 'deny',
      reason: 'unverified-ui-changes',
      message: warningText,
      uiFiles,
    }
  }

  if (config.mode === 'ask') {
    return {
      decision: 'ask',
      reason: 'unverified-ui-changes',
      message: warningText + '\n\n❓ 是否确认放行此次提交？',
      uiFiles,
    }
  }

  // warn 模式：放行并在 stderr/日志中输出告警
  return {
    decision: 'allow',
    warning: true,
    reason: 'unverified-ui-changes',
    message: warningText,
    uiFiles,
  }
}

/**
 * dsh-hooks PreToolUse 主入口
 */
export function handle(rawInput) {
  const input = JSON.parse(rawInput || '{}')
  const hookEventName = input.hook_event_name || 'PreToolUse'
  const rawTool = String(input.tool_name || '').toLowerCase()
  const toolName = rawTool.replace(/^.*:/, '')
  const toolInput = input.tool_input || {}
  const cwd = String(input.cwd || process.cwd())

  // 仅在 bash / pwsh 执行命令时进行检查
  if (toolName !== 'bash' && toolName !== 'pwsh') {
    return {
      hookSpecificOutput: {
        hookEventName,
        permissionDecision: 'allow',
      },
    }
  }

  const command = String(toolInput.command || '').trim()
  const result = decideL2Guard({ command, cwd })

  // 如果处于 warn 模式并且有警告消息，打印到 stderr 让控制台可见
  if (result.warning && result.message) {
    process.stderr.write(`\n${result.message}\n\n`)
  }

  const output = {
    hookEventName,
    permissionDecision: result.decision,
  }

  if (result.decision === 'deny' || result.decision === 'ask') {
    output.permissionReason = result.message
    output.permissionDecisionReason = result.message
  }

  return { hookSpecificOutput: output }
}

export function main() {
  let rawInput = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    rawInput += chunk
  })
  process.stdin.on('end', () => {
    try {
      const result = handle(rawInput)
      process.stdout.write(JSON.stringify(result) + '\n')
    } catch (err) {
      process.stderr.write(`[guard-l2 error] ${err.message}\n`)
      // 容错安全兜底，避免 hook 自身崩溃造成死锁
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
          },
        }) + '\n',
      )
    }
  })
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  main()
}
