/**
 * watch-plugin.mjs — 统一管理一个产品树插件的构建 watcher。
 *
 * 设计：
 * - 独立运行，只监听源码并重建构建产物（lib/client.js 等）。
 * - 不启动 Host、不物化 profile；合入后通过正式 sync 入口交付 Dev。
 * - workflow 复用其自带 scripts/dev.mjs；其余插件用本文件的通用 watcher。
 *
 * 用法：
 *   node scripts/watch-plugin.mjs <plugin>
 *   node scripts/watch-plugin.mjs omnimux-assets
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginsRoot = process.env.OMNIMUX_PLUGINS_DIR || join(root, 'plugins')
const name = process.argv[2]

if (!name) {
  console.error('用法: node scripts/watch-plugin.mjs <plugin>')
  process.exit(1)
}

const pluginDir = join(pluginsRoot, name)
if (!existsSync(join(pluginDir, 'package.json'))) {
  console.error(`✗ 插件源码不存在: ${pluginDir}`)
  process.exit(1)
}

const children = new Set()

function trackChild(child) {
  children.add(child)
  child.on('exit', () => children.delete(child))
  return child
}

function cleanExit(signal) {
  for (const child of children) {
    try {
      if (child.pid) {
        // 杀掉整个子进程组，避免 esbuild/npm 等孙进程残留为僵尸
        try {
          process.kill(-child.pid, signal || 'SIGTERM')
        } catch {
          child.kill(signal || 'SIGTERM')
        }
      }
    } catch {}
  }
  process.exit(0)
}

process.on('SIGINT', () => cleanExit('SIGINT'))
process.on('SIGTERM', () => cleanExit('SIGTERM'))

function runNode(scriptRel) {
  const child = spawn(process.execPath, [join(pluginDir, scriptRel)], {
    cwd: pluginDir,
    stdio: 'inherit',
    detached: true,
  })
  trackChild(child)
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[${name}] ${scriptRel} exited ${code}`)
  })
  return child
}

function runNpmBuild() {
  const child = spawn('npm', ['run', 'build', '--silent'], {
    cwd: pluginDir,
    stdio: 'inherit',
    shell: false,
    detached: true,
  })
  trackChild(child)
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[${name}] npm run build exited ${code}`)
  })
  return child
}

/** @type {{ kind: 'workflow' | 'client' | 'npm' | 'noop', dirs: string[], rebuild: () => void }} */
function resolveStrategy() {
  if (name === 'omnimux-workflow' && existsSync(join(pluginDir, 'scripts/dev.mjs'))) {
    return {
      kind: 'workflow',
      dirs: [],
      rebuild: () => {},
      start: () => {
        console.log(`[${name}] 复用 scripts/dev.mjs (独立托管，退出不拖死父进程)`)
        const runWorkflowWatcher = () => {
          const child = spawn(process.execPath, [join(pluginDir, 'scripts/dev.mjs')], {
            cwd: pluginDir,
            stdio: 'inherit',
            detached: true,
          })
          trackChild(child)
          child.on('exit', (code) => {
            console.error(`[${name}] scripts/dev.mjs exited ${code}，父 watcher 保持待命`)
          })
        }
        runWorkflowWatcher()
      },
    }
  }

  if (existsSync(join(pluginDir, 'scripts/build-client.mjs'))) {
    return {
      kind: 'client',
      dirs: ['src/client', 'src', 'scripts'].filter((d) => existsSync(join(pluginDir, d))),
      rebuild: () => {
        console.log(`\n[${name}] rebuild client`)
        runNode('scripts/build-client.mjs')
      },
      start: null,
    }
  }

  // omnimux-market 等：package.json 有 build
  try {
    const pkg = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'))
    if (pkg.scripts?.build) {
      return {
        kind: 'npm',
        dirs: ['src', 'scripts'].filter((d) => existsSync(join(pluginDir, d))),
        rebuild: () => {
          console.log(`\n[${name}] npm run build`)
          runNpmBuild()
        },
        start: null,
      }
    }
  } catch {
    // fall through to noop
  }

  // omnimux-video / omnimux-analytics 等：源码直读，无构建产物
  return {
    kind: 'noop',
    dirs: [],
    rebuild: () => {},
    start: null,
  }
}

const strategy = resolveStrategy()

if (strategy.kind === 'workflow') {
  strategy.start()
} else if (strategy.dirs.length === 0) {
  console.log(`[${name}] 无可监视目录 / 无构建步骤，保持空闲（Ctrl+C 退出）`)
  setInterval(() => {}, 1 << 30)
} else {
  console.log(`[${name}] initial build…`)
  strategy.rebuild()
  const timers = new Map()
  for (const dir of strategy.dirs) {
    const abs = join(pluginDir, dir)
    watch(abs, { recursive: true }, (_event, file) => {
      const key = String(file || dir)
      if (timers.has(key)) clearTimeout(timers.get(key))
      timers.set(
        key,
        setTimeout(() => {
          console.log(`\n[${name}] ${dir}/${file ?? ''} changed`)
          strategy.rebuild()
        }, 150),
      )
    })
  }
  console.log(`[${name}] watching ${strategy.dirs.join(', ')} — 仅重建源码产物`)
}
