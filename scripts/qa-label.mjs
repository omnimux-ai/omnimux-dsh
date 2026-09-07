import { spawnSync } from 'node:child_process'

/** CI-only label projection. execCommand has the same signature as spawnSync. */
export function syncQaPassLabel({ prNumber, pass, dryRun = false, repo = process.env.GITHUB_REPOSITORY || process.env.OMNIMUX_REPO || 'omnimux-ai/omnimux-dsh', execCommand = spawnSync }) {
  const result = { ok: true, removed: false, added: false, skipped: false, actions: [], errors: [] }
  if (!prNumber || dryRun) return { ...result, skipped: true }
  if (!/^[1-9]\d*$/.test(String(prNumber)) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return { ...result, ok: false, errors: ['无效的 PR 编号或仓库名'] }
  }
  const apply = action => {
    const args = ['pr', 'edit', String(prNumber), '--repo', repo, action, 'qa:pass']
    result.actions.push({ command: 'gh', args })
    try {
      const response = execCommand('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      if (response?.status !== 0) throw new Error(response?.stderr || response?.error?.message || response?.stdout || 'gh 命令未成功完成')
      return true
    } catch (error) {
      result.ok = false
      result.errors.push(`${action} qa:pass 失败: ${error.message}`)
      return false
    }
  }
  result.removed = apply('--remove-label')
  // Never add after an unconfirmed removal, or for truthy non-boolean verdicts.
  if (result.removed && pass === true) result.added = apply('--add-label')
  return result
}
