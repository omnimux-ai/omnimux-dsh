/**
 * scripts/sync-kit-artifact-restore.test.mjs
 * 构建产物恢复逻辑的契约（Issue #3887）
 *
 * 缺陷形态：`packages/dsh-ui-kit/lib/` 是被 git 跟踪的构建产物，而构建工具链
 * 是浮动版本（`tsdown: ^0.22.14`）。每次 `corepack pnpm build` 都会把它重写成
 * 与入库版本不同的字节（差异是注释与格式化风格，语义等价），于是
 * `assert_omnimux_sync_main` 看到「已跟踪文件改动」就拒绝下一次物化——自我污染循环。
 *
 * 本文件断言 `sync-to-app.sh` 里的修复形态。真正的执行验证由人工物化承担
 * （`./scripts/sync-to-app.sh` 连跑两次，`git status` 保持干净），因为那段逻辑
 * 需要真实 git 仓库与 profile 布局，不适合在单测里伪造。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const script = readFileSync(join(here, 'sync-to-app.sh'), 'utf8')

test('契约一：存在只作用于构建产物目录的恢复函数 (AC-1, AC-2)', () => {
  assert.match(script, /^restore_built_kit_artifacts\(\) \{/m, '必须定义 restore_built_kit_artifacts')

  // 函数体必须把作用域钉在 $DSH_UI_KIT_DIR/lib，而不是宽口径路径。
  const body = script.slice(script.indexOf('restore_built_kit_artifacts() {'))
  const fn = body.slice(0, body.indexOf('\n}\n') + 3)
  assert.match(fn, /local dir="\$DSH_UI_KIT_DIR\/lib"/, '作用域必须是 kit 的 lib 目录')
  assert.match(fn, /git -C "\$ROOT" checkout -- "\$dir"/, '恢复命令必须带路径限定')

  // 绝不能出现无边界的恢复写法——那会连开发者的源码改动一起抹掉。
  assert.doesNotMatch(fn, /checkout -- \.$/, '不得使用 checkout -- .')
  assert.doesNotMatch(fn, /checkout -- \.$/m, '不得使用 checkout -- .')
  assert.doesNotMatch(fn, /reset --hard/, '不得使用 reset --hard')
  assert.doesNotMatch(fn, /clean -[a-z]*d/, '不得使用 git clean')
})

test('契约二：恢复在物化之后调用，且跳过构建时不调用 (AC-1)', () => {
  const ensureStart = script.indexOf('ensure_dsh_ui_kit_fresh() {')
  assert.ok(ensureStart >= 0, '必须存在 ensure_dsh_ui_kit_fresh')
  const ensureBody = script.slice(ensureStart, ensureStart + 2000)

  const materializeAt = ensureBody.indexOf('materialize_authoritative_dsh_ui_kit "$profile"')
  const restoreAt = ensureBody.indexOf('restore_built_kit_artifacts')
  assert.ok(materializeAt >= 0, '物化调用必须存在')
  assert.ok(restoreAt >= 0, '恢复调用必须存在')
  assert.ok(restoreAt > materializeAt, '恢复必须在物化之后——否则 profile 会拿到旧产物')

  // 跳过构建时没有新产物，不该动 git。
  assert.match(
    ensureBody,
    /if \[ "\$\{OMNIMUX_SKIP_KIT_BUILD:-0\}" != "1" \]; then\n\s+restore_built_kit_artifacts\n\s+fi/,
    'OMNIMUX_SKIP_KIT_BUILD=1 时必须跳过恢复',
  )
})

test('契约三：门禁对真实源码改动的拦截未被放宽 (AC-3)', () => {
  const guard = readFileSync(join(here, 'sync-main.sh'), 'utf8')
  // 已跟踪文件的任何改动仍然一律拦截——本次修复只处理构建产物，不动这条。
  assert.match(guard, /if \[ -n "\$tracked" \]; then/, '脏树检查必须保留')
  assert.match(guard, /工作区存在已跟踪文件的未提交改动，拒绝物化/, '拒绝文案必须保留')
  // sync-to-app.sh 不得为了让物化通过而跳过这道检查。
  assert.match(script, /assert_omnimux_sync_main "\$ROOT"/, '物化入口必须仍调用干净检查')
})
