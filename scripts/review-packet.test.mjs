/**
 * scripts/review-packet.test.mjs
 * 净室评审输入包：只含三段输入 + 评审要求，缺任一输入或工作区不干净都必须失败。
 * 规格：specs/3848-independent-review-packet.spec.md
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { withFixtureRepo, runNodeCli, REPO_ROOT } from './lib/git-fixture-repo.mjs'
import { DEFAULT_OUT_DIR, PACKET_SECTIONS, createReviewPacket, fenceFor } from './review-packet.mjs'

const CLI = join(REPO_ROOT, 'scripts/review-packet.mjs')
const SPEC_REL = 'specs/demo.spec.md'
const SPEC_TEXT = '# demo spec\n\n## 假设\n\n需求原文里的标题必须留在围栏里，不能被当成评审包结构。\n'
const EVIDENCE_TEXT = 'node --test demo.test.mjs\n# pass 3\n# fail 0\nexit 0\n'
const CHANGED_SOURCE = 'export const answer = 42\nconst fence = "````"\n'

/** 建 main 基线 + feature 分支一个提交（含规格与源码改动），证据放在仓库外。 */
function prepareFeature(repo) {
  repo.write('README.md', 'base\n')
  const baseSha = repo.commit('base')
  repo.git(['checkout', '-q', '-b', 'feature/demo'])
  repo.write(SPEC_REL, SPEC_TEXT)
  repo.write('src/answer.mjs', CHANGED_SOURCE)
  const headSha = repo.commit('feature')
  return { baseSha, headSha }
}

function withScratch(run) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'review-packet-test-')))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 围栏外的二级标题（围栏长度按开栏反引号数匹配）。 */
function topLevelHeadings(markdown) {
  const headings = []
  let open = null
  for (const line of markdown.split('\n')) {
    const fence = /^(`{3,})/.exec(line)
    if (fence) {
      if (open === null) open = fence[1].length
      else if (line.trim() === '`'.repeat(open)) open = null
      continue
    }
    if (open === null && line.startsWith('## ')) headings.push(line)
  }
  return headings
}

test('干净工作区生成评审包：三段输入 + 评审要求 + SHA，无额外段落，写在仓库外', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { baseSha, headSha } = prepareFeature(repo)
    const evidence = join(scratch, 'unit.log')
    writeFileSync(evidence, EVIDENCE_TEXT)
    const outDir = join(scratch, 'out')
    const canary = 'review-packet-canary-7f3a'
    process.env.REVIEW_PACKET_CANARY = canary
    const result = runNodeCli([CLI, '--spec', SPEC_REL, '--evidence', evidence, '--base', 'main', '--out-dir', outDir], { cwd: repo.root })
    delete process.env.REVIEW_PACKET_CANARY
    assert.equal(result.status, 0, result.stderr)
    const outPath = result.stdout.trim()
    assert.equal(outPath, join(outDir, `feature-demo-${headSha.slice(0, 12)}.md`))
    assert.ok(relative(repo.root, outPath).startsWith('..'), '评审包不得写进仓库')
    const packet = readFileSync(outPath, 'utf8')

    assert.deepEqual(topLevelHeadings(packet), PACKET_SECTIONS)
    assert.ok(packet.includes(`- head：\`${headSha}\``))
    assert.ok(packet.includes(`- merge-base：\`${baseSha}\``))
    assert.ok(packet.includes(`- base：\`main\`（\`${baseSha}\`）`))
    assert.ok(packet.includes('- 分支：`feature/demo`'))
    assert.match(packet, /- 生成日期：\d{4}-\d{2}-\d{2}\n/)
    assert.ok(packet.includes('  - A `specs/demo.spec.md`'))
    assert.ok(packet.includes('  - A `src/answer.mjs`'))
    assert.ok(packet.includes(SPEC_TEXT), '规格原文完整保留')
    assert.ok(packet.includes('+export const answer = 42'), 'diff 原文完整保留')
    assert.ok(packet.includes(`### 证据 1：\`${evidence}\``))
    assert.ok(packet.includes(EVIDENCE_TEXT), '证据原文完整保留')
    assert.ok(packet.includes('`````diff\n'), 'diff 围栏比内容里最长的反引号串更长')
    assert.ok(packet.includes('问题 / 位置（文件:行）/ 证据 / 严重度（阻断·建议·细节）/ 对应需求条目'))
    assert.ok(!packet.includes(canary), '不得混入环境变量')
    assert.ok(!packet.includes('README.md'), '不得混入 merge-base 之前的内容')

    assert.equal(repo.git(['status', '--porcelain']), '', '生成后夹具工作区保持干净')
  }))
})

test('默认输出目录在系统临时目录下', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    const evidence = join(scratch, 'unit.log')
    writeFileSync(evidence, EVIDENCE_TEXT)
    const outPath = createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [evidence], base: 'main' })
    try {
      assert.equal(outPath, join(realpathSync(DEFAULT_OUT_DIR), `feature-demo-${headSha.slice(0, 12)}.md`))
      assert.ok(existsSync(outPath))
      assert.equal(repo.git(['status', '--porcelain']), '')
    } finally {
      rmSync(outPath, { force: true })
    }
  }))
})

test('规格缺失：CLI 非零退出并给出规格路径', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    prepareFeature(repo)
    const evidence = join(scratch, 'unit.log')
    writeFileSync(evidence, EVIDENCE_TEXT)
    const result = runNodeCli([CLI, '--spec', 'specs/missing.spec.md', '--evidence', evidence, '--base', 'main', '--out-dir', join(scratch, 'out')], { cwd: repo.root })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /规格文件不存在：.*specs\/missing\.spec\.md/)
    assert.equal(result.stdout, '')
    assert.equal(existsSync(join(scratch, 'out')), false)
  }))
})

test('未给 --evidence：拒绝生成', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    prepareFeature(repo)
    const result = runNodeCli([CLI, '--spec', SPEC_REL, '--base', 'main', '--out-dir', join(scratch, 'out')], { cwd: repo.root })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /缺少 --evidence/)
  }))
})

test('证据文件不存在或为空：拒绝生成', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    prepareFeature(repo)
    const empty = join(scratch, 'empty.log')
    writeFileSync(empty, '  \n')
    assert.throws(
      () => createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [join(scratch, 'nope.log')], base: 'main', outDir: join(scratch, 'out') }),
      /测试证据文件不存在：.*nope\.log/,
    )
    assert.throws(
      () => createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [empty], base: 'main', outDir: join(scratch, 'out') }),
      /测试证据文件为空：.*empty\.log/,
    )
  }))
})

test('diff 为空：拒绝生成', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    repo.write(SPEC_REL, SPEC_TEXT)
    repo.commit('base')
    repo.git(['checkout', '-q', '-b', 'feature/empty'])
    const evidence = join(scratch, 'unit.log')
    writeFileSync(evidence, EVIDENCE_TEXT)
    const result = runNodeCli([CLI, '--spec', SPEC_REL, '--evidence', evidence, '--base', 'main', '--out-dir', join(scratch, 'out')], { cwd: repo.root })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /diff 为空/)
  }))
})

test('已跟踪文件有未提交改动：拒绝生成', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    prepareFeature(repo)
    repo.write('src/answer.mjs', 'export const answer = 43\n')
    const evidence = join(scratch, 'unit.log')
    writeFileSync(evidence, EVIDENCE_TEXT)
    const result = runNodeCli([CLI, '--spec', SPEC_REL, '--evidence', evidence, '--base', 'main', '--out-dir', join(scratch, 'out')], { cwd: repo.root })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /评审包必须绑定到一个提交/)
    assert.match(result.stderr, /src\/answer\.mjs/)
  }))
})

test('未忽略的未跟踪文件：拒绝生成；被忽略的文件不影响', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    repo.write('.gitignore', 'ignored.log\n')
    prepareFeature(repo)
    repo.write('ignored.log', 'noise\n')
    const evidence = join(scratch, 'unit.log')
    writeFileSync(evidence, EVIDENCE_TEXT)
    const args = { cwd: repo.root, spec: SPEC_REL, evidence: [evidence], base: 'main', outDir: join(scratch, 'out') }
    assert.ok(existsSync(createReviewPacket(args)), '被忽略文件不算脏')
    repo.write('notes.txt', 'draft\n')
    assert.throws(() => createReviewPacket(args), /未提交改动或未忽略的未跟踪文件[\s\S]*notes\.txt/)
  }))
})

test('输出目录在仓库内：拒绝写入', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    prepareFeature(repo)
    const evidence = join(scratch, 'unit.log')
    writeFileSync(evidence, EVIDENCE_TEXT)
    assert.throws(
      () => createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [evidence], base: 'main', outDir: '.review' }),
      /--out-dir 不能在仓库内/,
    )
    assert.equal(repo.git(['status', '--porcelain']), '')
  }))
})

test('围栏长度始终长于内容里的反引号串', () => {
  assert.equal(fenceFor('plain'), '```')
  assert.equal(fenceFor('has ``` inside'), '````')
  assert.equal(fenceFor('has ````` inside'), '``````')
})
