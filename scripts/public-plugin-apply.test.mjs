import test from 'node:test'
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectTestAuthoring } from './test-authoring-inspection.mjs'
import { handle, sourceInspectionIO } from './guard-anti-cheat.mjs'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync, constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const filePath = resolve(root, 'scripts/public-api-candidate.test.mjs')
const candidate = "import { apply } from '../plugins/omnimux/src/index.js'; test('install', () => { apply(ctx, {}) })"
const decide = (content) => handle(JSON.stringify({
  cwd: root, hook_event_name: 'PreToolUse', tool_name: 'write',
  tool_input: { file_path: filePath, content },
})).hookSpecificOutput.permissionDecision

const common = sourceInspectionIO.spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' })
assert.equal(common.status, 0)
const mainRoot = dirname(common.stdout.trim())
const fixtureRoot = resolve(mainRoot, '.worktrees/public-apply-fixture')

function registeredFixture(t) {
  const gitDir = resolve(common.stdout.trim(), 'worktrees/public-apply-fixture')
  const files = new Map([
    [resolve(fixtureRoot, '.git'), Buffer.from('gitdir: ' + gitDir + '\n')],
    [resolve(gitDir, 'gitdir'), Buffer.from(resolve(fixtureRoot, '.git') + '\n')],
    [resolve(gitDir, 'commondir'), Buffer.from('../..\n')],
    [resolve(fixtureRoot, 'plugins/omnimux/src/index.js'), Buffer.from("export { apply } from './host/apply.js'\n")],
    [resolve(fixtureRoot, 'plugins/omnimux/src/host/apply.js'), Buffer.from('export function apply(ctx) { return ctx }\n')],
    [resolve(fixtureRoot, 'plugins/omnimux/src/text/execute.test.js'), Buffer.from("import { apply } from '../index.js'; apply(ctx)\n")],
  ])
  const directories = new Set([resolve(mainRoot, '.worktrees'), resolve(common.stdout.trim(), 'worktrees'), gitDir, fixtureRoot])
  for (const path of files.keys()) {
    for (let parent = dirname(path); parent.startsWith(fixtureRoot + '/') || parent === fixtureRoot; parent = dirname(parent)) directories.add(parent)
  }
  const original = Object.assign({}, sourceInspectionIO)
  const fileStat = original.lstatSync(resolve(root, 'scripts/guard-anti-cheat.mjs'))
  const directoryStat = original.lstatSync(root)
  const descriptors = new Map()
  let nextFd = -100
  function stat(path) {
    const value = Object.assign(Object.create(Object.getPrototypeOf(files.has(path) ? fileStat : directoryStat)), files.has(path) ? fileStat : directoryStat)
    if (files.has(path)) value.size = files.get(path).length
    return value
  }
  t.mock.method(sourceInspectionIO, 'lstatSync', function (path) {
    if (files.has(path) || directories.has(path)) return stat(path)
    if (path.startsWith(fixtureRoot + '/')) throw Object.assign(new Error('Missing fixture path'), { code: 'ENOENT' })
    return original.lstatSync(path)
  })
  t.mock.method(sourceInspectionIO, 'realpathSync', path => files.has(path) || directories.has(path) ? path : original.realpathSync(path))
  t.mock.method(sourceInspectionIO, 'openSync', function (path, flags) {
    if (!files.has(path)) return original.openSync(path, flags)
    assert.equal(Boolean(flags & constants.O_NOFOLLOW), true)
    const fd = nextFd--
    descriptors.set(fd, path)
    return fd
  })
  t.mock.method(sourceInspectionIO, 'fstatSync', fd => descriptors.has(fd) ? stat(descriptors.get(fd)) : original.fstatSync(fd))
  t.mock.method(sourceInspectionIO, 'readFileSync', function (fd, options) {
    if (!descriptors.has(fd)) return original.readFileSync(fd, options)
    const bytes = files.get(descriptors.get(fd))
    return options === 'utf8' ? bytes.toString('utf8') : bytes
  })
  t.mock.method(sourceInspectionIO, 'closeSync', fd => descriptors.has(fd) ? descriptors.delete(fd) : original.closeSync(fd))
  t.mock.method(sourceInspectionIO, 'spawnSync', function (command, args, options) {
    if (args.includes('worktree') && args.includes('list')) {
      const result = original.spawnSync(command, args, options)
      return Object.assign({}, result, { stdout: result.stdout + `worktree ${fixtureRoot}\0HEAD ${'1'.repeat(40)}\0\0` })
    }
    if (args[1] !== fixtureRoot) return original.spawnSync(command, args, options)
    let stdout
    if (args.includes('--absolute-git-dir')) stdout = gitDir
    else if (args.includes('--git-common-dir')) stdout = common.stdout.trim()
    else if (args.includes('--show-toplevel')) stdout = fixtureRoot
    else if (args.includes('HEAD')) stdout = '1'.repeat(40)
    else if (args.includes('ls-tree')) {
      assert.equal(args[3], '1'.repeat(40))
      const rel = args.at(-1)
      const bytes = files.get(resolve(fixtureRoot, rel))
      const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      stdout = `100644 blob ${hash}\t${rel}`
    } else throw new Error('Unexpected fixture Git query')
    return { status: 0, stdout: stdout + '\n' }
  })
  return { other: fixtureRoot, gitDir, files }
}

test('task-loaded guard inspects another registered repository worktree without tool cwd', (t) => {
  const { other } = registeredFixture(t)
  const target = resolve(other, 'plugins/omnimux/src/text/execute.test.js')
  const before = sourceInspectionIO.readFileSync(sourceInspectionIO.openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW), 'utf8')
  const content = "import { apply } from '../index.js'; test('install', () => apply(ctx, {}))"
  const result = handle(JSON.stringify({ tool_name: 'write', tool_input: { file_path: target, content } }))
  assert.equal(result.hookSpecificOutput.permissionDecision, 'allow')
  const edit = handle(JSON.stringify({ tool_name: 'edit', tool_input: { file_path: target, old_string: before, new_string: content } }))
  assert.equal(edit.hookSpecificOutput.permissionDecision, 'allow')
  assert.equal(sourceInspectionIO.readFileSync(sourceInspectionIO.openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW), 'utf8'), before)
})

test('public function binding return is rejected while ordinary installation results remain inspectable', () => {
  const prefix = "import { apply } from '../plugins/omnimux/src/index.js'; "
  assert.equal(decide(prefix + 'function install() { return apply }'), 'deny')
  assert.equal(decide(prefix + 'function install() { return apply(ctx) }'), 'allow')
  assert.equal(decide(prefix + 'const result = apply(ctx); assert.equal(typeof result, "function")'), 'allow')
  assert.equal(decide(prefix + 'apply(ctx)()'), 'deny')
})

test('registered target cannot borrow another tree source or tool-supplied inspection authority', (t) => {
  const { other } = registeredFixture(t)
  const target = resolve(other, 'plugins/omnimux/src/text/execute.test.js')
  const contents = [
    "import { apply } from '../../../../../../plugins/omnimux/src/index.js'; apply(ctx)",
    "import { apply } from '../../../../../../.worktrees/common-public-apply-issue-3326/plugins/omnimux/src/index.js'; apply(ctx)",
  ]
  for (const content of contents) {
    const result = handle(JSON.stringify({ cwd: root, tool_name: 'write', resolveImport: true, sourceInspectionIO: true, tool_input: { file_path: target, content, approved: true, verifiedImports: true, sourceInspectionIO: true } }))
    assert.equal(result.hookSpecificOutput.permissionDecision, 'deny')
  }
})

test('common match, registry membership and reverse gitdir are all required', (t) => {
  const { other } = registeredFixture(t)
  const target = resolve(other, 'plugins/omnimux/src/text/execute.test.js')
  const content = "import { apply } from '../index.js'; apply(ctx)"
  const otherDecision = () => handle(JSON.stringify({ tool_name: 'write', tool_input: { file_path: target, content } })).hookSpecificOutput.permissionDecision
  const originalSpawn = sourceInspectionIO.spawnSync
  for (const query of ['--git-common-dir', '--absolute-git-dir', 'list']) {
    let hit = false
    t.mock.method(sourceInspectionIO, 'spawnSync', function (command, args, options) {
      const result = originalSpawn(command, args, options)
      if ((query === 'list' || args[1] === other) && args.includes(query)) {
        hit = true
        const stdout = query === 'list' ? `worktree ${root}\0\0` : resolve(root, 'fake-git-dir') + '\n'
        return Object.assign({}, result, { stdout })
      }
      return result
    })
    assert.equal(otherDecision(), 'deny', query)
    assert.equal(hit, true)
    sourceInspectionIO.spawnSync.mock.restore()
  }
  const originalOpen = sourceInspectionIO.openSync
  const originalRead = sourceInspectionIO.readFileSync
  const gitDir = resolve(common.stdout.trim(), 'worktrees/public-apply-fixture')
  for (const metadata of [resolve(other, '.git'), resolve(gitDir, 'gitdir'), resolve(gitDir, 'commondir')]) {
    let fd
    let hit = false
    t.mock.method(sourceInspectionIO, 'openSync', function (path, flags) {
      const opened = originalOpen(path, flags)
      if (path === metadata) fd = opened
      return opened
    })
    t.mock.method(sourceInspectionIO, 'readFileSync', function (path, options) {
      if (path === fd) {
        hit = true
        return Buffer.from('gitdir: ' + resolve(root, 'fake-registration'))
      }
      return originalRead(path, options)
    })
    assert.equal(otherDecision(), 'deny', metadata)
    assert.equal(hit, true)
    sourceInspectionIO.openSync.mock.restore()
    sourceInspectionIO.readFileSync.mock.restore()
  }
})

test('registered source bytes, canonical paths and query-time registry replacements remain fail closed', (t) => {
  const { other } = registeredFixture(t)
  const target = resolve(other, 'plugins/omnimux/src/text/execute.test.js')
  const content = "import { apply } from '../index.js'; apply(ctx)"
  const otherDecision = () => handle(JSON.stringify({ tool_name: 'write', tool_input: { file_path: target, content } })).hookSpecificOutput.permissionDecision
  const originalStat = sourceInspectionIO.lstatSync
  const originalSpawn = sourceInspectionIO.spawnSync
  const gitDir = resolve(common.stdout.trim(), 'worktrees/public-apply-fixture')
  for (const path of [other, resolve(other, '.git'), resolve(gitDir, 'gitdir'), resolve(other, 'plugins/omnimux/src/index.js')]) {
    let observed = false
    t.mock.method(sourceInspectionIO, 'lstatSync', function (requested) {
      const stat = originalStat(requested)
      if (requested === path) { observed = true; stat.isSymbolicLink = () => true }
      return stat
    })
    assert.equal(otherDecision(), 'deny', path)
    assert.equal(observed, true)
    sourceInspectionIO.lstatSync.mock.restore()
  }
  for (const path of [resolve(gitDir, 'commondir'), resolve(other, '.git'), resolve(other, 'plugins/omnimux/src/host/apply.js')]) {
    let changed = false
    let checked = false
    t.mock.method(sourceInspectionIO, 'spawnSync', function (command, args, options) {
      const result = originalSpawn(command, args, options)
      if (args.includes('plugins/omnimux/src/host/apply.js')) changed = true
      return result
    })
    t.mock.method(sourceInspectionIO, 'lstatSync', function (requested) {
      const stat = originalStat(requested)
      if (changed && requested === path) { checked = true; stat.ino += 1 }
      return stat
    })
    assert.equal(otherDecision(), 'deny', path)
    assert.equal(changed, true)
    assert.equal(checked, true)
    sourceInspectionIO.spawnSync.mock.restore()
    sourceInspectionIO.lstatSync.mock.restore()
  }
  let queried = false
  t.mock.method(sourceInspectionIO, 'spawnSync', function (command, args, options) {
    const result = originalSpawn(command, args, options)
    if (args.includes('ls-tree') && args.includes('plugins/omnimux/src/host/apply.js')) {
      queried = true
      return Object.assign({}, result, { stdout: '100644 blob ' + '0'.repeat(40) + '\tplugins/omnimux/src/host/apply.js\n' })
    }
    return result
  })
  assert.equal(otherDecision(), 'deny')
  assert.equal(queried, true)
})

test('nested repository markers under a registered target are rejected', (t) => {
  const { other } = registeredFixture(t)
  const target = resolve(other, 'plugins/omnimux/src/text/execute.test.js')
  const marker = resolve(other, 'plugins/.git')
  const original = sourceInspectionIO.lstatSync
  let observed = false
  t.mock.method(sourceInspectionIO, 'lstatSync', function (path) {
    if (path === marker) {
      observed = true
      return original(resolve(other, '.git'))
    }
    return original(path)
  })
  const result = handle(JSON.stringify({ tool_name: 'write', tool_input: { file_path: target, content: "import { apply } from '../index.js'; apply(ctx)" } }))
  assert.equal(result.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(observed, true)
})

test('unregistered task paths and external siblings cannot inherit shared repository authority', () => {
  const main = mainRoot
  const targets = [
    resolve(main, '.worktrees/public-apply-unregistered-3326/scripts/candidate.test.mjs'),
    resolve(root, '.worktrees/candidate/scripts/candidate.test.mjs'),
    resolve(main, '../omnimux-other-clone/scripts/candidate.test.mjs'),
  ]
  for (const target of targets) {
    const result = handle(JSON.stringify({ cwd: root, tool_name: 'write', tool_input: { file_path: target, content: candidate, verifiedImports: true, approved: true } }))
    assert.equal(result.hookSpecificOutput.permissionDecision, 'deny', target)
  }
  const mainResult = handle(JSON.stringify({ tool_name: 'write', tool_input: { file_path: resolve(main, 'scripts/public-api-candidate.test.mjs'), content: candidate } }))
  assert.equal(mainResult.hookSpecificOutput.permissionDecision, 'allow')
})

test('raw imported apply stays denied without verified source facts', () => {
  assert.equal(inspectTestAuthoring(candidate).allowed, false)
})

test('guard allows direct calls from the verified repository public plugin entry', () => {
  assert.equal(decide(candidate), 'allow')
})

test('verified public binding cannot escape direct invocation or weaken execution selectors', () => {
  const prefix = "import { apply } from '../plugins/omnimux/src/index.js'; "
  const denied = [
    'const other = apply;', 'apply = replacement;', 'consume(apply);',
    'function factory() { return apply }', 'export { apply };', 'export default apply;',
    'function nested(apply) { apply(ctx) }', 'apply?.(ctx);',
    'apply.call(null, ctx);', 'apply.bind(null);', 'apply.apply(null, []);',
    'plugin.apply(ctx);', 'function member() {} member.apply(null, []);',
    'test.only("hidden", () => {});', 'test("hidden", { only: false }, () => {});',
    'test("hidden", { skip: true }, () => {});', 'test("hidden", { todo: "later" }, () => {});',
    'test("hidden", options, () => {});', 'new Function("return 1")();',
    'eval("1");', 'Reflect.get(plugin, "apply")(ctx);', 'plugin[key](ctx);',
    'apply(...args);', 'import("node:vm");',
  ]
  for (const suffix of denied) assert.equal(decide(prefix + suffix), 'deny', suffix)
  assert.equal(decide("import { apply as install } from '../plugins/omnimux/src/index.js'; install(ctx)"), 'deny')
  assert.equal(decide("import * as plugin from '../plugins/omnimux/src/index.js'; plugin.apply(ctx)"), 'deny')
  assert.equal(decide(prefix + "import { runInNewContext } from 'node:vm'; apply(ctx)"), 'deny')
  assert.equal(decide(prefix + "import { spawn } from 'node:child_process'; apply(ctx)"), 'deny')
  assert.equal(decide(prefix + "test('normal', { skip: false, todo: false }, () => apply(ctx))"), 'allow')
})

test('guard ignores claimed source facts and rejects unrelated relative sources', () => {
  assert.equal(decide("import { apply } from './index.js'; apply(ctx)"), 'deny')
  assert.equal(decide("import { apply } from '../plugins/omnimux/src/host/apply.js'; apply(ctx)"), 'deny')
  const result = handle(JSON.stringify({
    cwd: root, tool_name: 'write',
    tool_input: { file_path: filePath, content: "import { apply } from './index.js'; apply(ctx)", verifiedImports: { './index.js': true } },
    verifiedImports: { './index.js': true },
  }))
  assert.equal(result.hookSpecificOutput.permissionDecision, 'deny')
})

/**
 * 仓内临时夹具登记表。
 *
 * 这些夹具必须建在**仓内**（用例要验证"仓内未跟踪的插件目录不得获得仓库权威"），
 * 但只靠 `finally` 清理不够：测试运行被中断或提前失败时 `finally` 不会执行，
 * 残留的未跟踪文件会被 `scripts/sync-to-app.sh` 判定为"会进入物化产物"并
 * 直接拒绝开发版物化。这里再加一层进程退出兜底。
 */
const fixtures = new Set()

function makeFixture(prefix) {
  const dir = mkdtempSync(prefix)
  fixtures.add(dir)
  return dir
}

process.on('exit', () => {
  for (const dir of fixtures) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // 退出阶段尽力而为：清理失败不能反过来影响测试结论。
    }
  }
})

test('external mirror, other checkout, and untracked repo plugin cannot establish identity', () => {
  const temporary = makeFixture(resolve(tmpdir(), 'public-apply-'))
  const untracked = makeFixture(resolve(root, 'plugins/public-apply-untracked-'))
  try {
    const fakeSrc = resolve(temporary, 'plugins/omnimux/src')
    mkdirSync(resolve(fakeSrc, 'host'), { recursive: true })
    mkdirSync(resolve(temporary, 'scripts'))
    writeFileSync(resolve(fakeSrc, 'index.js'), "export { apply } from './host/apply.js'")
    writeFileSync(resolve(fakeSrc, 'host/apply.js'), 'export function apply(ctx) { return ctx }')
    const outside = handle(JSON.stringify({ cwd: temporary, tool_name: 'write', tool_input: { file_path: 'scripts/test.test.mjs', content: candidate } }))
    assert.equal(outside.hookSpecificOutput.permissionDecision, 'deny')
    assert.equal(decide("import { apply } from '../../../plugins/omnimux/src/index.js'; apply(ctx)"), 'deny')
    assert.equal(decide("import { apply } from '" + resolve(fakeSrc, 'index.js') + "'; apply(ctx)"), 'deny')
    mkdirSync(resolve(untracked, 'src/host'), { recursive: true })
    writeFileSync(resolve(untracked, 'src/index.js'), "export { apply } from './host/apply.js'")
    writeFileSync(resolve(untracked, 'src/host/apply.js'), 'export function apply(ctx) { return ctx }')
    const untrackedCandidate = "import { apply } from '../plugins/" + untracked.split('/').at(-1) + "/src/index.js'; apply(ctx)"
    assert.equal(decide(untrackedCandidate), 'deny')
    writeFileSync(resolve(untracked, 'src/index.js'), "export function apply() { return eval('1') }")
    assert.equal(decide(untrackedCandidate), 'deny')
    assert.equal(resolve(untracked, 'src/index.js').startsWith(untracked + '/'), true)
    rmSync(resolve(untracked, 'src/index.js'))
    symlinkSync(resolve(root, 'plugins/omnimux/src/index.js'), resolve(untracked, 'src/index.js'))
    assert.equal(decide(untrackedCandidate), 'deny')
    symlinkSync(resolve(root, 'plugins/omnimux/src/index.js'), resolve(temporary, 'linked-index.js'))
    assert.equal(decide("import { apply } from '" + resolve(temporary, 'linked-index.js') + "'; apply(ctx)"), 'deny')
  } finally {
    assert.equal(temporary.startsWith(resolve(tmpdir(), 'public-apply-')), true)
    assert.equal(untracked.startsWith(resolve(root, 'plugins/public-apply-untracked-')), true)
    rmSync(temporary, { recursive: true, force: true })
    rmSync(untracked, { recursive: true, force: true })
    fixtures.delete(temporary)
    fixtures.delete(untracked)
  }
})

test('root, special targets, and non-ENOENT lookup failures are rejected', (t) => {
  const rootTarget = handle(JSON.stringify({ cwd: root, tool_name: 'write', tool_input: { file_path: root, content: candidate } }))
  assert.equal(rootTarget.hookSpecificOutput.permissionDecision, 'deny')
  const original = sourceInspectionIO.lstatSync
  t.mock.method(sourceInspectionIO, 'lstatSync', function (requested) {
    if (requested === filePath) throw Object.assign(new Error('Denied'), { code: 'EACCES' })
    return original(requested)
  })
  assert.equal(decide(candidate), 'deny')
  t.mock.restoreAll()
  t.mock.method(sourceInspectionIO, 'lstatSync', function (requested) {
    if (requested !== filePath) return original(requested)
    const stat = original(resolve(root, 'scripts/guard-anti-cheat.mjs'))
    stat.isFile = () => false
    return stat
  })
  assert.equal(decide(candidate), 'deny')
})

test('canonical source symlink is rejected at its actual public entry', (t) => {
  const path = resolve(root, 'plugins/omnimux/src/index.js')
  const original = sourceInspectionIO.lstatSync
  let observed = false
  t.mock.method(sourceInspectionIO, 'lstatSync', function (requested) {
    const stat = original(requested)
    if (requested === path) {
      observed = true
      stat.isSymbolicLink = () => true
    }
    return stat
  })
  assert.equal(decide(candidate), 'deny')
  assert.equal(observed, true)
})

test('source snapshot rejects host, entry and ancestor replacement at child return', (t) => {
  for (const changedPath of ['plugins/omnimux/src/host/apply.js', 'plugins/omnimux/src/index.js', 'plugins/omnimux/src']) {
    const path = resolve(root, changedPath)
    const originalStat = sourceInspectionIO.lstatSync
    const originalSpawn = sourceInspectionIO.spawnSync
    let changed = false
    let finalCheck = false
    t.mock.method(sourceInspectionIO, 'spawnSync', function (command, args, options) {
      const result = originalSpawn(command, args, options)
      if (args.includes('plugins/omnimux/src/host/apply.js')) changed = true
      return result
    })
    t.mock.method(sourceInspectionIO, 'lstatSync', function (requested) {
      const stat = originalStat(requested)
      if (changed && requested === path) {
        finalCheck = true
        stat.ino += 1
      }
      return stat
    })
    assert.equal(decide(candidate), 'deny', changedPath)
    assert.equal(changed, true)
    assert.equal(finalCheck, true)
    t.mock.restoreAll()
  }
})

test('one HEAD generation is fixed and rechecked after all source AST reads', (t) => {
  for (const changeAfter of ['plugins/omnimux/src/index.js', 'plugins/omnimux/src/host/apply.js']) {
    const originalSpawn = sourceInspectionIO.spawnSync
    let changed = false
    let rechecked = false
    let fixedHead
    const queriedHeads = []
    t.mock.method(sourceInspectionIO, 'spawnSync', function (command, args, options) {
      const result = originalSpawn(command, args, options)
      if (args.includes('rev-parse') && args.includes('HEAD')) {
        if (changed) {
          rechecked = true
          return Object.assign({}, result, { stdout: '0'.repeat(40) + '\n' })
        }
        fixedHead = result.stdout.trim()
      }
      if (args.includes('ls-tree')) queriedHeads.push(args[3])
      if (args.includes(changeAfter)) changed = true
      return result
    })
    assert.equal(decide(candidate), 'deny')
    assert.equal(changed, true)
    assert.equal(rechecked, true)
    assert.equal(queriedHeads.length, 2)
    assert.deepEqual(queriedHeads, [fixedHead, fixedHead])
    t.mock.restoreAll()
  }
})

test('canonical target symlink is rejected for write and complete edit candidates', () => {
  const temporary = mkdtempSync(resolve(root, 'scripts/public-apply-target-'))
  const outside = mkdtempSync(resolve(tmpdir(), 'public-apply-target-'))
  try {
    const target = resolve(temporary, 'candidate.test.mjs')
    const referent = resolve(outside, 'candidate.test.mjs')
    const original = "import { apply } from '../../plugins/omnimux/src/index.js'; apply(ctx)"
    writeFileSync(referent, original)
    symlinkSync(referent, target)
    const write = handle(JSON.stringify({ cwd: root, tool_name: 'write', tool_input: { file_path: target, content: original } }))
    assert.equal(write.hookSpecificOutput.permissionDecision, 'deny')
    const edit = handle(JSON.stringify({ cwd: root, tool_name: 'edit', tool_input: { file_path: target, old_string: 'apply(ctx)', new_string: 'apply(ctx, {})' } }))
    assert.equal(edit.hookSpecificOutput.permissionDecision, 'deny')
    assert.equal(readFileSync(referent, 'utf8'), original)
  } finally {
    assert.equal(temporary.startsWith(resolve(root, 'scripts/public-apply-target-')), true)
    assert.equal(outside.startsWith(resolve(tmpdir(), 'public-apply-target-')), true)
    rmSync(temporary, { recursive: true })
    rmSync(outside, { recursive: true })
  }
})

test('source replacement during final HEAD child return is still rejected', (t) => {
  const path = resolve(root, 'plugins/omnimux/src/index.js')
  const originalSpawn = sourceInspectionIO.spawnSync
  const originalStat = sourceInspectionIO.lstatSync
  let queries = 0
  let changed = false
  t.mock.method(sourceInspectionIO, 'spawnSync', function (command, args, options) {
    const result = originalSpawn(command, args, options)
    if (args.includes('rev-parse') && args.includes('HEAD') && ++queries > 1) changed = true
    return result
  })
  t.mock.method(sourceInspectionIO, 'lstatSync', function (requested) {
    const stat = originalStat(requested)
    if (changed && requested === path) stat.ino += 1
    return stat
  })
  assert.equal(decide(candidate), 'deny')
  assert.equal(changed, true)
})

test('full edit candidate is reconstructed before binding and selector inspection', () => {
  const temporary = makeFixture(resolve(root, 'scripts/public-apply-edit-'))
  try {
    const path = resolve(temporary, 'candidate.test.mjs')
    const original = "import { apply } from '../../plugins/omnimux/src/index.js'; test('install', () => apply(ctx))"
    writeFileSync(path, original)
    const edit = (oldString, newString) => handle(JSON.stringify({ cwd: root, tool_name: 'edit', tool_input: { file_path: path, old_string: oldString, new_string: newString } }))
    assert.equal(edit('apply(ctx)', 'apply(ctx, {})').hookSpecificOutput.permissionDecision, 'allow')
    assert.equal(edit('apply(ctx)', 'consume(apply)').hookSpecificOutput.permissionDecision, 'deny')
    assert.equal(edit("test('install'", "test.only('install'").hookSpecificOutput.permissionDecision, 'deny')
    assert.equal(readFileSync(path, 'utf8'), original)
  } finally {
    assert.equal(temporary.startsWith(resolve(root, 'scripts/public-apply-edit-')), true)
    rmSync(temporary, { recursive: true, force: true })
    fixtures.delete(temporary)
  }
})
