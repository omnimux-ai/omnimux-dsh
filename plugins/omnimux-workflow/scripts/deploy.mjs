/**
 * DEPRECATED entry — thin forwarder.
 *
 * 以前是 workflow 私有的「build → 拷 5 个文件进 profile」旁路，会绕过
 * `sync-stable.sh`（物化不全 / 依赖声明不更新）。现已收敛到统一主入口：
 *
 *   cd ~/Desktop/Project/omnimux-desktop-fork
 *   yarn omnimux:sync omnimux-workflow
 *   yarn omnimux:restart          # 需要加载时再跑；默认不自动重启
 *
 * 本文件仅兼容旧命令 `npm run deploy` / `deploy:restart`，转调产品树
 * `scripts/sync-to-app.sh`。勿再往这里加私有同步逻辑。
 *
 * Usage:
 *   node scripts/deploy.mjs             # → sync-to-app omnimux-workflow
 *   node scripts/deploy.mjs --restart   # → sync 后再 kill+open（兼容旧 flag）
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const productRoot = join(pluginRoot, '../..')
const syncToApp = join(productRoot, 'scripts/sync-to-app.sh')
const restart = process.argv.includes('--restart')
// Agent shells often carry ELECTRON_RUN_AS_NODE=1; `open` inherits it, so the
// Electron app would boot as Node and exit immediately. Keep this deprecated
// forwarder self-contained: the plugin npm package does not ship the repo-root
// scripts, so the one variable is stripped here instead of importing the helper.
const launchEnv = { ...process.env }
delete launchEnv.ELECTRON_RUN_AS_NODE

console.warn('[omnimux-workflow] scripts/deploy.mjs 已废弃：请改用 fork 仓库 `yarn omnimux:sync omnimux-workflow`（+ `yarn omnimux:restart`）')

if (!existsSync(syncToApp)) {
  console.error(`✗ 找不到统一同步脚本: ${syncToApp}`)
  process.exit(1)
}

const sync = spawnSync('bash', [syncToApp, 'omnimux-workflow'], {
  cwd: productRoot,
  stdio: 'inherit',
  env: process.env,
})
if (sync.status !== 0) process.exit(sync.status ?? 1)

if (!restart) {
  console.log('\n（兼容提示）需要加载时请：yarn omnimux:restart  —— 或本命令加 --restart')
  process.exit(0)
}

console.log('\n== restart OmniMux（deploy --restart 兼容路径）==')
spawnSync('pkill', ['-f', 'OmniMux.app'], { stdio: 'ignore' })
spawnSync('sleep', ['1'], { stdio: 'ignore' })
const open = spawnSync('open', ['-a', 'OmniMux'], { stdio: 'inherit', env: launchEnv })
process.exit(open.status ?? 1)
