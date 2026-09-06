#!/usr/bin/env node
/**
 * OmniMux 插件开发与运维 CLI 入口（主仓库自包含版）
 *
 * 用法：
 *   node scripts/omnimux.mjs sync [插件...] [--skip-build]  - 构建并同步物化到生产 Profile
 *   node scripts/omnimux.mjs restart dev                   - 【人类专用】重启开发版应用 (/Applications/OmniMux Dev.app)
 *   node scripts/omnimux.mjs restart prod                  - 【人类专用】重启正式版应用 (/Applications/OmniMux.app)
 *   node scripts/omnimux.mjs dev start <task> <plugin>     - 启动 L2 预发布独立开发环境
 *   node scripts/omnimux.mjs dev stop|ls|rm|watch ...      - 管理开发环境
 *   node scripts/omnimux.mjs doctor                        - 环境合规检查
 *   node scripts/omnimux.mjs build:all                     - 全量并发构建插件
 *   node scripts/omnimux.mjs lint:i18n                     - 文案/禁词质量门禁
 *   node scripts/omnimux.mjs registry [build|verify]       - 插件注册表与 Schema 校验
 *   node scripts/omnimux.mjs stage                         - 物化进 desktop-fork preset
 *   node scripts/omnimux.mjs package:dev                   - 打包并安装 OmniMux Dev 开发版 App
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginsRoot = join(productRoot, 'plugins')
const forkRoot = join(homedir(), 'Desktop/Project/omnimux-desktop-fork')

function die(msg) {
  process.stderr.write(`✗ ${msg}\n`)
  process.exit(1)
}

function runBash(scriptRel, args = []) {
  const script = join(productRoot, scriptRel)
  if (!existsSync(script)) {
    die(`产品树脚本缺失: ${script}`)
  }
  const env = {
    ...process.env,
    OMNIMUX_PRODUCT_DIR: productRoot,
    OMNIMUX_PLUGINS_DIR: pluginsRoot,
  }
  const result = spawnSync('bash', [script, ...args], {
    cwd: productRoot,
    env,
    stdio: 'inherit',
  })
  process.exit(result.status === null ? 1 : result.status)
}

function runNodeScript(scriptRel, args = []) {
  const script = join(productRoot, scriptRel)
  if (!existsSync(script)) {
    die(`脚本缺失: ${script}`)
  }
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: productRoot,
    stdio: 'inherit',
  })
  process.exit(result.status === null ? 1 : result.status)
}

function runForkCommand(yarnScript, args = [], extraEnv = {}) {
  if (!existsSync(forkRoot)) {
    die(`桌面仓库不存在: ${forkRoot}`)
  }
  const env = {
    ...process.env,
    OMNIMUX_PRODUCT_DIR: productRoot,
    OMNIMUX_PLUGINS_DIR: pluginsRoot,
    ...extraEnv,
  }
  const result = spawnSync('corepack', ['yarn', yarnScript, ...args], {
    cwd: forkRoot,
    env,
    stdio: 'inherit',
  })
  process.exit(result.status === null ? 1 : result.status)
}

function restartApp(target = 'dev') {
  if (process.env.DSH_AGENT_SESSION || process.env.AGENT_ROLE || process.env.CI) {
    die(`Agent 严禁强杀或重启任何桌面应用 (/Applications/OmniMux*.app)！
原因：
1. Agent 无法调试 Native 桌面窗口，所有测试验证必须在 L2 独立隔离环境（Web 端）进行:
   node scripts/omnimux.mjs dev start <task-id> <plugin>
2. 重启公共 App 进程会导致多 Agent / 人机并发撞车。
3. 验证完成后直接执行 node scripts/omnimux.mjs sync <plugin> 静态物化即可，前端修改在页面刷新 (Cmd+R) 后自动生效。`)
  }

  if (target === 'dev') {
    spawnSync('pkill', ['-f', 'OmniMux Dev.app'], { stdio: 'ignore' })
    spawnSync('sleep', ['1'], { stdio: 'ignore' })
    const open = spawnSync('open', ['-a', 'OmniMux Dev'], { stdio: 'inherit' })
    if (open.status !== 0) die('open -a "OmniMux Dev" 失败（请先执行: node scripts/omnimux.mjs package:dev）')
    process.stdout.write('✓ 已请求重启 OmniMux Dev 开发版（人工操作）\n')
    return
  }

  spawnSync('pkill', ['-f', '/Applications/OmniMux.app'], { stdio: 'ignore' })
  spawnSync('sleep', ['1'], { stdio: 'ignore' })
  const open = spawnSync('open', ['-a', 'OmniMux'], { stdio: 'inherit' })
  if (open.status !== 0) die('open -a OmniMux 失败（确认已安装 /Applications/OmniMux.app）')
  process.stdout.write('✓ 已请求重启 OmniMux 正式版（人工操作）\n')
}

function printHelp() {
  process.stdout.write(`OmniMux 插件开发运维工具 (omnimux-dsh)

工作目录: ${productRoot}
插件目录: ${pluginsRoot}

命令:
  sync [插件...] [--prod|--dsh|--all] [--skip-build]
                                  构建并将插件物化进目标 Profile（默认仅开发版 ~/.omnimux-dev，可用 --prod / --dsh / --all 扩展）
  dev <start|stop|ls|rm|watch|restart-host>
                                  L2 独立开发/测试环境（多 Agent 隔离端口池 442xx + Web HMR，测试验证唯一入口）
  dev restart-host <task>         【推荐】仅原地重启指定 L2 环境的 Host 进程（2秒同端口冷重启，Agent 允许调用）
  build:all                       并发全量构建产品插件
  lint:i18n                       全量文案/禁词与多语言门禁检查
  analyze:refactor [路径...]       代码重构与简化分析工具 (CRSA: 行数超标与业务逻辑混乱检测)
  doc:lint                        开发文档工程实践合规与死链校验
  doc:index                       自动生成与更新全量文档索引矩阵
  registry [build|verify|query]   编译与校验插件 Manifest 及能力注册表
  doctor                          多层开发环境自检
  restart dev                     【人类专用】手动重启开发版应用 (/Applications/OmniMux Dev.app)
  restart prod                    【人类专用】手动重启正式版应用 (/Applications/OmniMux.app)
  stage                           物化全量预设插件到 desktop 仓库
  package:dev                     编译打包并安装 OmniMux Dev 开发版 App
  qa:gate                         严过关五维自动化质检门禁
  auto:run <issue_id>             全流程无人值守自动化闭环执行
  help                            显示本帮助

示例:
  node scripts/omnimux.mjs dev start task-a1 omnimux-workflow   # L2 独立隔离验证
  node scripts/omnimux.mjs dev restart-host task-a1            # 修改后端 Tool 后秒级重启 Host
  node scripts/omnimux.mjs sync omnimux-workflow               # 验证通过后物化落盘
`)
}

const args = process.argv.slice(2)
const cmd = args[0] || 'help'
const rest = args.slice(1)

switch (cmd) {
  case 'sync':
    runBash('scripts/sync-to-app.sh', rest)
    break
  case 'build:all':
    runNodeScript('scripts/build-all.mjs', rest)
    break
  case 'lint:i18n':
    runNodeScript('scripts/i18n-lint.mjs', rest)
    break
  case 'analyze:refactor':
  case 'refactor':
  case 'crsa':
    runNodeScript('scripts/code-refactor-analyzer.mjs', rest)
    break
  case 'doc:lint':
    runNodeScript('scripts/doc-lint.mjs', rest)
    break
  case 'doc:index':
    runNodeScript('scripts/doc-index-gen.mjs', rest)
    break
  case 'registry':
    runNodeScript('scripts/registry-tool.mjs', rest)
    break
  case 'restart':
    restartApp(rest[0] || 'dev')
    break
  case 'dev':
    runBash('scripts/dev-env.sh', rest)
    break
  case 'doctor':
    runBash('scripts/dev-doctor.sh', rest)
    break
  case 'stage':
    runForkCommand('omnimux:stage', rest)
    break
  case 'package:dev':
    runForkCommand('package:dir:dev', [], { OMNIMUX_CHANNEL: 'dev' })
    break
  case 'qa:gate':
    runNodeScript('scripts/auto-qa-gate.mjs', rest)
    break
  case 'auto:run':
    runNodeScript('scripts/auto-pipeline.mjs', rest)
    break
  case 'help':
  case '--help':
  case '-h':
    printHelp()
    break
  default:
    process.stderr.write(`未知命令: ${cmd}\n\n`)
    printHelp()
    process.exit(1)
}
