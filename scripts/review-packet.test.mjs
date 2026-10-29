/**
 * scripts/review-packet.test.mjs
 * 净室评审输入包：只含三段输入 + 评审要求，缺任一输入、工作区不干净、证据为二进制/未绑定 head/含密钥都必须失败。
 * 规格：specs/3848-independent-review-packet.spec.md
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { withFixtureRepo, runNodeCli, REPO_ROOT } from './lib/git-fixture-repo.mjs'
import { DEFAULT_OUT_DIR, HEAD_BINDING_MESSAGE, PACKET_SECTIONS, createReviewPacket, fenceFor, inputHash } from './review-packet.mjs'

const CLI = join(REPO_ROOT, 'scripts/review-packet.mjs')
const SPEC_REL = 'specs/demo.spec.md'
const SPEC_TEXT = '# demo spec\n\n## 假设\n\n需求原文里的标题必须留在围栏里，不能被当成评审包结构。\n'
const CHANGED_SOURCE = 'export const answer = 42\nconst fence = "````"\n'

/** 证据首行记录 head（模拟 git rev-parse HEAD 的输出），其余为测试原文。 */
function evidenceText(headSha, extra = '') {
  return `${headSha}\nnode --test demo.test.mjs\n# pass 3\n# fail 0\nexit 0\n${extra}`
}

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

function writeEvidence(scratch, headSha, name = 'unit.log', extra = '') {
  const path = join(scratch, name)
  writeFileSync(path, evidenceText(headSha, extra))
  return path
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
    const evidence = writeEvidence(scratch, headSha)
    const outDir = join(scratch, 'out')
    const result = runNodeCli([CLI, '--spec', SPEC_REL, '--evidence', evidence, '--base', 'main', '--out-dir', outDir], { cwd: repo.root })
    assert.equal(result.status, 0, result.stderr)
    const outPath = result.stdout.trim()
    const hash8 = inputHash(SPEC_TEXT, [evidenceText(headSha)])
    assert.match(hash8, /^[0-9a-f]{8}$/)
    assert.equal(outPath, join(outDir, `feature-demo-${headSha.slice(0, 12)}-${hash8}.md`))
    assert.ok(relative(repo.root, outPath).startsWith('..'), '评审包不得写进仓库')
    assert.equal(statSync(outDir).mode & 0o777, 0o700, '输出目录仅本人可访问')
    assert.equal(statSync(outPath).mode & 0o777, 0o600, '评审包仅本人可读写')
    const packet = readFileSync(outPath, 'utf8')

    assert.deepEqual(topLevelHeadings(packet), PACKET_SECTIONS)
    assert.ok(packet.includes(`- head：\`${headSha}\``))
    assert.ok(packet.includes(`- merge-base：\`${baseSha}\``))
    assert.ok(packet.includes(`- base：\`main\`（\`${baseSha}\`）`))
    const baseDate = repo.git(['show', '-s', '--format=%cI', baseSha]).trim()
    assert.ok(packet.includes(`- base 提交时间：${baseDate}\n`), '头信息含 base 提交时间')
    assert.ok(packet.includes('- 分支：`feature/demo`'))
    assert.match(packet, /- 生成日期：\d{4}-\d{2}-\d{2}\n/)
    assert.ok(packet.includes('  - A `specs/demo.spec.md`'))
    assert.ok(packet.includes('  - A `src/answer.mjs`'))
    assert.ok(packet.includes(SPEC_TEXT), '规格原文完整保留')
    assert.ok(packet.includes('+export const answer = 42'), 'diff 原文完整保留')
    assert.ok(packet.includes('### 证据 1：`unit.log`'), '仓库外文件只显示文件名')
    assert.ok(!packet.includes(scratch), '不得出现仓库外绝对路径')
    assert.ok(packet.includes(evidenceText(headSha)), '证据原文完整保留')
    assert.ok(packet.includes('`````diff\n'), 'diff 围栏比内容里最长的反引号串更长')
    assert.ok(packet.includes('docs/contracts/plugin-qa.md「评审与验收结论」'), '评审要求引用 plugin-qa 核对项')
    assert.ok(packet.includes('问题 / 位置（文件:行）/ 证据 / 严重度（阻断·建议·细节）/ 对应需求条目'))
    assert.ok(!packet.includes('README.md'), '不得混入 merge-base 之前的内容')

    assert.equal(repo.git(['status', '--porcelain']), '', '生成后夹具工作区保持干净')
  }))
})

test('默认输出目录在系统临时目录下', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    const evidence = writeEvidence(scratch, headSha)
    const outPath = createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [evidence], base: 'main' })
    try {
      const hash8 = inputHash(SPEC_TEXT, [evidenceText(headSha)])
      assert.equal(outPath, join(realpathSync(DEFAULT_OUT_DIR), `feature-demo-${headSha.slice(0, 12)}-${hash8}.md`))
      assert.ok(existsSync(outPath))
      assert.equal(statSync(realpathSync(DEFAULT_OUT_DIR)).mode & 0o777, 0o700, '默认目录即使已存在也收紧到 0700')
      assert.equal(statSync(outPath).mode & 0o777, 0o600)
      assert.equal(repo.git(['status', '--porcelain']), '')
    } finally {
      rmSync(outPath, { force: true })
    }
  }))
})

test('同输入得同一文件；换证据得新文件，旧包不被覆盖', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    const outDir = join(scratch, 'out')
    const first = writeEvidence(scratch, headSha, 'a.log')
    const args = { cwd: repo.root, spec: SPEC_REL, base: 'main', outDir }
    const p1 = createReviewPacket({ ...args, evidence: [first] })
    const p1Text = readFileSync(p1, 'utf8')
    assert.equal(createReviewPacket({ ...args, evidence: [first] }), p1, '同输入同文件名')

    const second = writeEvidence(scratch, headSha, 'b.log', '# 追加的重跑输出\n')
    const p2 = createReviewPacket({ ...args, evidence: [second] })
    assert.notEqual(p2, p1, '不同证据得不同文件名')
    assert.ok(p2.startsWith(join(outDir, `feature-demo-${headSha.slice(0, 12)}-`)))
    assert.equal(readFileSync(p1, 'utf8'), p1Text, '旧包内容保持不变')
    assert.deepEqual(readdirSync(outDir).sort(), [p1, p2].map(p => relative(outDir, p)).sort())
  }))
})

test('规格缺失：CLI 非零退出并给出规格路径', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    const evidence = writeEvidence(scratch, headSha)
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

test('二进制证据（含 NUL 或非法 UTF-8）：拒绝生成并提示截图以路径交付', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    const outDir = join(scratch, 'out')
    const png = join(scratch, 'shot.png')
    writeFileSync(png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]), Buffer.from(headSha)]))
    assert.throws(
      () => createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [png], base: 'main', outDir }),
      /测试证据文件不是 UTF-8 文本：.*shot\.png。截图等二进制材料请按净室评审协议以路径交给评审者[\s\S]*NUL/,
    )
    const latin1 = join(scratch, 'latin1.log')
    writeFileSync(latin1, Buffer.concat([Buffer.from(`${headSha}\ncaf`), Buffer.from([0xe9]), Buffer.from('\n')]))
    assert.throws(
      () => createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [latin1], base: 'main', outDir }),
      /测试证据文件不是 UTF-8 文本：.*latin1\.log。截图等二进制材料请按净室评审协议以路径交给评审者/,
    )
    assert.equal(existsSync(outDir), false, '失败时不创建输出')
  }))
})

test('证据未包含当前 head SHA：拒绝生成', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    const outDir = join(scratch, 'out')
    const stale = join(scratch, 'stale.log')
    writeFileSync(stale, 'node --test demo.test.mjs\n# pass 3\n# fail 0\nexit 0\n')
    const bound = writeEvidence(scratch, headSha)
    assert.throws(
      () => createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [bound, stale], base: 'main', outDir }),
      error => error.message.includes(HEAD_BINDING_MESSAGE) && error.message.includes('stale.log') && !error.message.includes('unit.log'),
    )
    assert.equal(HEAD_BINDING_MESSAGE, '证据未绑定当前 head（请在证据中记录 git rev-parse HEAD 的输出）')
    const shortOnly = join(scratch, 'short.log')
    writeFileSync(shortOnly, `HEAD ${headSha.slice(0, 7)}\nexit 0\n`)
    assert.ok(existsSync(createReviewPacket({ cwd: repo.root, spec: SPEC_REL, evidence: [shortOnly], base: 'main', outDir })), '前 7 位即可绑定')
  }))
})

test('证据含高置信密钥：拒绝生成，报 文件:行 但不回显密钥', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    const outDir = join(scratch, 'out')
    const fakeKey = ['sk', '-'].join('') + 'Ab3'.repeat(10)
    const leaky = writeEvidence(scratch, headSha, 'leaky.log', `OPENAI_API_KEY=${fakeKey}\n`)
    const result = runNodeCli([CLI, '--spec', SPEC_REL, '--evidence', leaky, '--base', 'main', '--out-dir', outDir], { cwd: repo.root })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /疑似含密钥/)
    assert.match(result.stderr, /leaky\.log:6 疑似OpenAI 风格 API key/)
    assert.ok(!result.stderr.includes(fakeKey), '错误信息不得回显密钥')
    assert.ok(!result.stderr.includes('Ab3Ab3'), '错误信息不得含密钥片段')
    assert.equal(result.stdout, '')
    assert.equal(existsSync(outDir), false, '命中密钥时不写任何文件')
  }))
})

test('diff 为空：拒绝生成', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    repo.write(SPEC_REL, SPEC_TEXT)
    const headSha = repo.commit('base')
    repo.git(['checkout', '-q', '-b', 'feature/empty'])
    const evidence = writeEvidence(scratch, headSha)
    const result = runNodeCli([CLI, '--spec', SPEC_REL, '--evidence', evidence, '--base', 'main', '--out-dir', join(scratch, 'out')], { cwd: repo.root })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /diff 为空/)
  }))
})

test('已跟踪文件有未提交改动：拒绝生成', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    repo.write('src/answer.mjs', 'export const answer = 43\n')
    const evidence = writeEvidence(scratch, headSha)
    const result = runNodeCli([CLI, '--spec', SPEC_REL, '--evidence', evidence, '--base', 'main', '--out-dir', join(scratch, 'out')], { cwd: repo.root })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /评审包必须绑定到一个提交/)
    assert.match(result.stderr, /src\/answer\.mjs/)
  }))
})

test('未忽略的未跟踪文件：拒绝生成；被忽略的文件不影响', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    repo.write('.gitignore', 'ignored.log\n')
    const { headSha } = prepareFeature(repo)
    repo.write('ignored.log', 'noise\n')
    const evidence = writeEvidence(scratch, headSha)
    const args = { cwd: repo.root, spec: SPEC_REL, evidence: [evidence], base: 'main', outDir: join(scratch, 'out') }
    assert.ok(existsSync(createReviewPacket(args)), '被忽略文件不算脏')
    repo.write('notes.txt', 'draft\n')
    assert.throws(() => createReviewPacket(args), /未提交改动或未忽略的未跟踪文件[\s\S]*notes\.txt/)
  }))
})

test('输出目录在仓库内：拒绝写入', () => {
  withFixtureRepo(repo => withScratch(scratch => {
    const { headSha } = prepareFeature(repo)
    const evidence = writeEvidence(scratch, headSha)
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
