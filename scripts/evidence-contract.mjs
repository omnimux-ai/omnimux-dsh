import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { isForbiddenArtifact } from './check-tracked-artifacts.mjs'

const decoder = new TextDecoder('utf-8', { fatal: true })
const HEX = /^[a-f0-9]{64}$/
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/
const SUMMARY_PATHS = new Set(['docs/evidence/worktree-app-qa-report.json', 'docs/evidence/live-qa-report.json', 'docs/evidence/live-cdp-qa-report.json'])
const PRODUCERS = ['controlled-runner', 'dependency-stub', 'imported-artifact']
const SCOPES = ['smoke', 'reproduction', 'task']

function fail(code) { throw Object.assign(new Error(code), { code }) }
function requireThat(value, code) { if (!value) fail(code) }
function text(value) { return typeof value === 'string' && value.length > 0 && value === value.trim() }
function utf8(bytes) { try { return decoder.decode(bytes) } catch { fail('NON_UTF8_UNSUPPORTED') } }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  requireThat(value && Object.getPrototypeOf(value) === Object.prototype, 'INVALID_SHAPE')
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
function digest(domain, value) { return createHash('sha256').update(`omnimux:${domain}:v1\0`).update(canonical(value)).digest('hex') }
function bytesDigest(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function exact(object, keys) {
  requireThat(object && Object.getPrototypeOf(object) === Object.prototype && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key)), 'INVALID_SHAPE')
}
function relativePath(path) {
  requireThat(text(path) && !isAbsolute(path) && !path.includes('\\') && !path.includes('\0') && path.split('/').every(part => part && part !== '.' && part !== '..' && part !== '.git'), 'UNSAFE_PATH')
  return path
}
function safeInput(path) {
  relativePath(path)
  requireThat(!/(?:^|\/)(?:\.env(?:\.[^/]*)?|\.ssh|\.test-env[^/]*|credentials?(?:\.(?:json|ya?ml|toml|ini|conf))?|secrets?(?:\.(?:json|ya?ml|toml|ini|conf))?|tokens?(?:\.(?:json|ya?ml|toml|ini|conf))?|passwords?(?:\.(?:json|ya?ml|toml|ini|conf))?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.[^/]*)?)(?:\/|$)|\.(?:pem|key|p12|pfx)$/i.test(path), 'SECRET_INPUT_IN_CANDIDATE')
  return path
}
function guarded(action, code = 'FILE_READ_FAILED') {
  try { return action() } catch (error) { if (error.code && error.message === error.code) throw error; fail(code) }
}
function git(root, args, input) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' })
  const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile=/dev/null', '-C', root, ...args], { env, input, maxBuffer: 128 * 1024 * 1024 })
  requireThat(!result.error && result.status === 0 && result.signal === null && Buffer.isBuffer(result.stdout), 'GIT_READ_FAILED')
  return result.stdout
}
function gitText(root, args) { return utf8(git(root, args)).trim() }
function repository(root) {
  requireThat(text(root) && isAbsolute(root), 'EXPLICIT_ROOT_REQUIRED')
  const realRoot = guarded(() => realpathSync(root), 'INVALID_GIT_ROOT')
  requireThat(realRoot === resolve(root), 'INVALID_GIT_ROOT')
  requireThat(guarded(() => realpathSync(gitText(root, ['rev-parse', '--show-toplevel'])), 'INVALID_GIT_ROOT') === realRoot, 'INVALID_GIT_ROOT')
  requireThat(gitText(root, ['rev-parse', '--is-bare-repository']) === 'false', 'INVALID_GIT_ROOT')
  requireThat(config(root, 'core.sparseCheckout') !== 'true', 'SPARSE_UNSUPPORTED')
  requireThat(config(root, 'core.autocrlf') === 'false', 'GIT_TRANSFORM_UNSUPPORTED')
  return { realRoot, gitDir: guarded(() => realpathSync(gitText(root, ['rev-parse', '--absolute-git-dir']))), commonGitDir: guarded(() => realpathSync(resolve(root, gitText(root, ['rev-parse', '--git-common-dir'])))) }
}
function config(root, name) {
  return gitText(root, ['config', '--default', 'false', '--get', name])
}
function commit(root, ref) {
  requireThat(text(ref) && !ref.startsWith('-') && !ref.includes('\0'), 'EXPLICIT_REF_REQUIRED')
  const sha = gitText(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])
  requireThat(SHA.test(sha), 'INVALID_COMMIT')
  return sha
}
function nul(bytes) {
  requireThat(bytes.length === 0 || bytes.at(-1) === 0, 'INVALID_GIT_OUTPUT')
  return utf8(bytes).split('\0').filter(Boolean)
}
function policy(options) {
  const paths = options.outputs ?? []
  const extraInputs = options.extraInputs ?? []
  requireThat(Array.isArray(paths) && Array.isArray(extraInputs), 'INVALID_SHAPE')
  const prefix = paths.length ? runPrefix(options.taskId, options.runId) : null
  for (const path of paths) {
    safeInput(path)
    requireThat(SUMMARY_PATHS.has(path) || (path.startsWith(prefix) && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:json|log|txt|png)$/.test(path.slice(prefix.length))), 'OUTPUT_EXCLUSION_DENIED')
  }
  for (const path of extraInputs) { safeInput(path); requireThat(!paths.includes(path) && !isForbiddenArtifact(path), 'EXTRA_INPUT_DENIED') }
  requireThat(new Set(paths).size === paths.length && new Set(extraInputs).size === extraInputs.length, 'DUPLICATE_PATH')
  const result = { outputPaths: [...paths].sort(), extraInputs: [...extraInputs].sort() }
  return { ...result, policyDigest: digest('candidate-policy', result) }
}
function runPrefix(taskId, runId) {
  requireThat(text(taskId) && text(runId) && ID.test(taskId) && ID.test(runId), 'INVALID_RUN_ID')
  return `.workbuddy/evidence/contract/${taskId}/${runId}/`
}
function checkAttributes(root, paths, source) {
  if (!paths.length) return
  const args = ['check-attr', '-z', '--stdin', ...(source ? [`--source=${source}`] : []), 'filter', 'working-tree-encoding', 'text', 'eol', 'ident']
  const fields = nul(git(root, args, Buffer.from(`${paths.join('\0')}\0`)))
  requireThat(fields.length === paths.length * 15, 'INVALID_GIT_OUTPUT')
  for (let i = 0; i < fields.length; i += 3) requireThat(['unspecified', 'unset'].includes(fields[i + 2]), 'GIT_TRANSFORM_UNSUPPORTED')
}
function entry(path, mode, bytes) { return { path, mode, bytes: bytes.length, sha256: bytesDigest(bytes) } }
function sortEntries(entries) { return entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))) }
function contentDigest(entries) { return digest('candidate-content', entries) }
function readTree(root, sha, exclusions) {
  const descriptors = nul(git(root, ['ls-tree', '-r', '-z', '--full-tree', sha])).map(record => {
    const tab = record.indexOf('\t')
    requireThat(tab > 0, 'INVALID_GIT_OUTPUT')
    const [mode, kind, object] = record.slice(0, tab).split(' ')
    const path = safeInput(record.slice(tab + 1))
    requireThat(['100644', '100755', '120000'].includes(mode) && kind === 'blob' && SHA.test(object), 'GITLINK_OR_MODE_UNSUPPORTED')
    requireThat(!isForbiddenArtifact(path), 'TRACKED_GENERATED_UNSUPPORTED')
    return { path, mode, object }
  }).filter(({ path }) => !exclusions.outputPaths.includes(path))
  checkAttributes(root, descriptors.map(item => item.path), sha)
  const objects = [...new Set(descriptors.map(item => item.object))]
  const content = new Map()
  if (objects.length) {
    const sizes = utf8(git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], Buffer.from(objects.join('\n') + '\n'))).trim().split('\n')
    requireThat(sizes.length === objects.length, 'INVALID_GIT_OUTPUT')
    let group = [], total = 0
    const readGroup = () => {
      const batch = git(root, ['cat-file', '--batch'], Buffer.from(group.join('\n') + '\n'))
      let offset = 0
      for (const object of group) {
        const end = batch.indexOf(10, offset)
        requireThat(end >= offset, 'INVALID_GIT_OUTPUT')
        const fields = utf8(batch.subarray(offset, end)).split(' ')
        const size = Number(fields[2])
        requireThat(fields.length === 3 && fields[0] === object && fields[1] === 'blob' && Number.isSafeInteger(size) && size >= 0, 'INVALID_GIT_OUTPUT')
        const start = end + 1
        requireThat(start + size < batch.length && batch[start + size] === 10, 'INVALID_GIT_OUTPUT')
        content.set(object, { bytes: size, sha256: bytesDigest(batch.subarray(start, start + size)) })
        offset = start + size + 1
      }
      requireThat(offset === batch.length, 'INVALID_GIT_OUTPUT')
      group = []; total = 0
    }
    for (let index = 0; index < objects.length; index++) {
      const fields = sizes[index].split(' '), size = Number(fields[2])
      requireThat(fields.length === 3 && fields[0] === objects[index] && fields[1] === 'blob' && Number.isSafeInteger(size) && size >= 0, 'INVALID_GIT_OUTPUT')
      requireThat(size <= 64 * 1024 * 1024, 'OBJECT_SIZE_UNSUPPORTED')
      if (group.length && total + size > 64 * 1024 * 1024) readGroup()
      group.push(objects[index]); total += size
    }
    if (group.length) readGroup()
  }
  return sortEntries(descriptors.map(({ path, mode, object }) => ({ path, mode, bytes: content.get(object).bytes, sha256: content.get(object).sha256 })))
}
function indexEntries(root) {
  requireThat(nul(git(root, ['ls-files', '-v', '-z'])).every(record => record.startsWith('H ')), 'INDEX_FLAGS_UNSUPPORTED')
  return nul(git(root, ['ls-files', '--stage', '-z'])).map(record => {
    const tab = record.indexOf('\t')
    requireThat(tab > 0, 'INVALID_GIT_OUTPUT')
    const [mode, object, stage] = record.slice(0, tab).split(' ')
    requireThat(stage === '0', 'UNMERGED_UNSUPPORTED')
    requireThat(['100644', '100755', '120000'].includes(mode) && SHA.test(object), 'GITLINK_OR_MODE_UNSUPPORTED')
    return { path: safeInput(record.slice(tab + 1)), mode, object }
  })
}
function noLinkedAncestors(root, path) {
  const parts = relativePath(path).split('/')
  for (let i = 1; i < parts.length; i += 1) {
    const stat = lstatSync(resolve(root, ...parts.slice(0, i)))
    requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'LINKED_ANCESTOR_UNSUPPORTED')
  }
}
function readEntry(root, path, allowMissing = false, allowLink = true) {
  safeInput(path)
  return guarded(() => {
    try {
      noLinkedAncestors(root, path)
      const absolute = resolve(root, path)
      const stat = lstatSync(absolute)
      if (stat.isSymbolicLink()) {
        requireThat(allowLink, 'ARTIFACT_LINK_DENIED')
        return entry(path, '120000', readlinkSync(absolute, { encoding: 'buffer' }))
      }
      requireThat(stat.isFile(), 'SPECIAL_FILE_UNSUPPORTED')
      const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const before = fstatSync(fd)
        const bytes = readFileSync(fd)
        const after = fstatSync(fd)
        requireThat(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mode === after.mode && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'CANDIDATE_CHANGED_DURING_CAPTURE')
        return entry(path, before.mode & 0o111 ? '100755' : '100644', bytes)
      } finally { closeSync(fd) }
    } catch (error) { if (error.code === 'ENOENT' && allowMissing) return null; throw error }
  })
}
function changes(before, after) {
  const old = new Map(before.map(item => [item.path, item]))
  const next = new Map(after.map(item => [item.path, item]))
  return [...new Set([...old.keys(), ...next.keys()])].sort().flatMap(path => {
    const from = old.get(path) ?? null
    const to = next.get(path) ?? null
    return canonical(from) === canonical(to) ? [] : [{ path, before: from, after: to }]
  })
}
function scan(root, headEntries, exclusions) {
  const index = indexEntries(root)
  const newPaths = nul(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).map(safeInput)
  const tracked = new Set([...headEntries.map(item => item.path), ...index.map(item => item.path)])
  for (const path of tracked) requireThat(!isForbiddenArtifact(path), 'TRACKED_GENERATED_UNSUPPORTED')
  const paths = [...new Set([...tracked, ...newPaths])].filter(path => !exclusions.outputPaths.includes(path) && !isForbiddenArtifact(path))
  checkAttributes(root, [...new Set([...paths, ...exclusions.extraInputs])])
  const entries = sortEntries(paths.map(path => readEntry(root, path, tracked.has(path))).filter(Boolean))
  const inputs = sortEntries(exclusions.extraInputs.map(path => readEntry(root, path)))
  return { entries, inputs, indexDigest: digest('candidate-index', index) }
}

/** @param {{root:string, base:string, head:string, outputs?:string[], taskId?:string, runId?:string, extraInputs?:string[]}} options */
export function captureCandidate(options) {
  requireThat(options && typeof options === 'object', 'INVALID_SHAPE')
  const repo = repository(options.root)
  const baseSha = commit(repo.realRoot, options.base)
  const headSha = commit(repo.realRoot, options.head)
  const currentHead = commit(repo.realRoot, 'HEAD')
  requireThat(headSha === currentHead, 'HEAD_NOT_CURRENT')
  const comparisons = gitText(repo.realRoot, ['merge-base', '--all', baseSha, headSha]).split('\n')
  requireThat(comparisons.length === 1 && SHA.test(comparisons[0]), 'AMBIGUOUS_COMPARISON_UNSUPPORTED')
  const exclusions = policy(options)
  const baseEntries = readTree(repo.realRoot, baseSha, exclusions)
  const headEntries = baseSha === headSha ? baseEntries : readTree(repo.realRoot, headSha, exclusions)
  const comparisonEntries = comparisons[0] === baseSha ? baseEntries : comparisons[0] === headSha ? headEntries : readTree(repo.realRoot, comparisons[0], exclusions)
  const first = scan(repo.realRoot, headEntries, exclusions)
  const second = scan(repo.realRoot, headEntries, exclusions)
  requireThat(canonical(first) === canonical(second) && digest('candidate-index', indexEntries(repo.realRoot)) === first.indexDigest && commit(repo.realRoot, 'HEAD') === currentHead && commit(repo.realRoot, options.base) === baseSha && commit(repo.realRoot, options.head) === headSha, 'CANDIDATE_CHANGED_DURING_CAPTURE')
  const delta = changes(comparisonEntries, first.entries)
  const snapshot = {
    schemaVersion: 1, repo,
    base: { requestedRef: options.base, resolvedSha: baseSha, contentDigest: contentDigest(baseEntries), entries: baseEntries },
    head: { requestedRef: options.head, resolvedSha: headSha, contentDigest: contentDigest(headEntries), entries: headEntries },
    comparison: { resolvedSha: comparisons[0], contentDigest: contentDigest(comparisonEntries), entries: comparisonEntries },
    candidate: { contentDigest: contentDigest(first.entries), entries: first.entries },
    inputs: { contentDigest: digest('extra-inputs', first.inputs), entries: first.inputs },
    indexDigest: first.indexDigest, changes: delta, changesDigest: digest('candidate-changes', delta), exclusions,
  }
  return { ...snapshot, snapshotDigest: digest('candidate-snapshot', snapshot) }
}

function checkEntries(entries) {
  requireThat(Array.isArray(entries), 'INVALID_SNAPSHOT')
  for (const item of entries) {
    exact(item, ['path', 'mode', 'bytes', 'sha256']); safeInput(item.path)
    requireThat(['100644', '100755', '120000'].includes(item.mode) && Number.isSafeInteger(item.bytes) && item.bytes >= 0 && HEX.test(item.sha256), 'INVALID_SNAPSHOT')
  }
  requireThat(new Set(entries.map(item => item.path)).size === entries.length && canonical(sortEntries([...entries])) === canonical(entries), 'INVALID_SNAPSHOT')
}
function checkSnapshot(snapshot) {
  exact(snapshot, ['schemaVersion', 'repo', 'base', 'head', 'comparison', 'candidate', 'inputs', 'indexDigest', 'changes', 'changesDigest', 'exclusions', 'snapshotDigest'])
  requireThat(snapshot.schemaVersion === 1, 'INVALID_SNAPSHOT')
  exact(snapshot.repo, ['realRoot', 'gitDir', 'commonGitDir'])
  requireThat(Object.values(snapshot.repo).every(path => text(path) && isAbsolute(path)), 'INVALID_SNAPSHOT')
  for (const name of ['base', 'head', 'comparison', 'candidate', 'inputs']) {
    const group = snapshot[name]
    exact(group, ['entries', 'contentDigest', ...(['base', 'head'].includes(name) ? ['requestedRef', 'resolvedSha'] : name === 'comparison' ? ['resolvedSha'] : [])])
    checkEntries(group.entries)
    requireThat(group.contentDigest === (name === 'inputs' ? digest('extra-inputs', group.entries) : contentDigest(group.entries)), 'INVALID_SNAPSHOT')
    if (group.resolvedSha !== undefined) requireThat(SHA.test(group.resolvedSha), 'INVALID_SNAPSHOT')
    if (group.requestedRef !== undefined) requireThat(text(group.requestedRef), 'INVALID_SNAPSHOT')
  }
  exact(snapshot.exclusions, ['outputPaths', 'extraInputs', 'policyDigest'])
  requireThat(Array.isArray(snapshot.exclusions.outputPaths) && Array.isArray(snapshot.exclusions.extraInputs) && HEX.test(snapshot.indexDigest), 'INVALID_SNAPSHOT')
  const outputs = snapshot.exclusions.outputPaths
  for (const path of outputs) {
    safeInput(path)
    requireThat(SUMMARY_PATHS.has(path) || /^\.workbuddy\/evidence\/contract\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:json|log|txt|png)$/.test(path), 'OUTPUT_EXCLUSION_DENIED')
  }
  requireThat(new Set(outputs).size === outputs.length && canonical([...outputs].sort()) === canonical(outputs), 'INVALID_SNAPSHOT')
  for (const path of snapshot.exclusions.extraInputs) { safeInput(path); requireThat(!outputs.includes(path) && !isForbiddenArtifact(path), 'EXTRA_INPUT_DENIED') }
  requireThat(new Set(snapshot.exclusions.extraInputs).size === snapshot.exclusions.extraInputs.length && canonical([...snapshot.exclusions.extraInputs].sort()) === canonical(snapshot.exclusions.extraInputs), 'INVALID_SNAPSHOT')
  const { policyDigest, ...domain } = snapshot.exclusions
  requireThat(policyDigest === digest('candidate-policy', domain), 'INVALID_SNAPSHOT')
  requireThat(snapshot.inputs.entries.map(item => item.path).sort().join('\0') === [...snapshot.exclusions.extraInputs].sort().join('\0'), 'INVALID_SNAPSHOT')
  const delta = changes(snapshot.comparison.entries, snapshot.candidate.entries)
  requireThat(canonical(delta) === canonical(snapshot.changes) && digest('candidate-changes', delta) === snapshot.changesDigest, 'INVALID_SNAPSHOT')
  const { snapshotDigest, ...body } = snapshot
  requireThat(snapshotDigest === digest('candidate-snapshot', body), 'INVALID_SNAPSHOT')
}

/** Re-read target Git blobs; this mapping is an attachment, not an edit to the old snapshot. */
export function mapCandidateToCommit(snapshot, request) {
  requireThat(request && Object.getPrototypeOf(request) === Object.prototype, 'INVALID_SHAPE')
  const { root, base, head } = request
  checkSnapshot(snapshot)
  const repo = repository(root)
  requireThat(canonical(repo) === canonical(snapshot.repo), 'REPOSITORY_MISMATCH')
  const baseSha = commit(root, base)
  const headSha = commit(root, head)
  const target = readTree(root, headSha, snapshot.exclusions)
  requireThat(contentDigest(target) === snapshot.candidate.contentDigest, 'COMMIT_CONTENT_MISMATCH')
  const baseEntries = readTree(root, baseSha, snapshot.exclusions)
  requireThat(contentDigest(baseEntries) === snapshot.base.contentDigest, 'BASE_CONTENT_MISMATCH')
  const comparison = gitText(root, ['merge-base', '--all', baseSha, headSha]).split('\n')
  requireThat(comparison.length === 1 && SHA.test(comparison[0]), 'AMBIGUOUS_COMPARISON_UNSUPPORTED')
  checkAttributes(root, snapshot.exclusions.extraInputs)
  const inputs = sortEntries(snapshot.exclusions.extraInputs.map(path => readEntry(root, path)))
  requireThat(digest('extra-inputs', inputs) === snapshot.inputs.contentDigest, 'EXTRA_INPUT_CHANGED')
  const targetChanges = changes(readTree(root, comparison[0], snapshot.exclusions), target)
  const mapping = { schemaVersion: 1, mapping: 'exact-tree-content', fromSnapshotDigest: snapshot.snapshotDigest, fromHeadSha: snapshot.head.resolvedSha, candidateDigest: snapshot.candidate.contentDigest, toBaseSha: baseSha, toHeadSha: headSha, comparisonSha: comparison[0], changesDigest: digest('candidate-changes', targetChanges), reviewContextUnchanged: comparison[0] === snapshot.comparison.resolvedSha && digest('candidate-changes', targetChanges) === snapshot.changesDigest }
  return { ...mapping, mappingDigest: digest('candidate-mapping', mapping) }
}

function assertionList(assertions) {
  requireThat(Array.isArray(assertions) && assertions.length > 0, 'ASSERTIONS_EMPTY')
  const names = new Set()
  return assertions.map(item => {
    exact(item, ['name', 'pass'])
    requireThat(text(item.name) && !names.has(item.name) && typeof item.pass === 'boolean', 'ASSERTION_INVALID')
    names.add(item.name)
    return { name: item.name, pass: item.pass }
  })
}
function checksList(checks) {
  requireThat(Array.isArray(checks) && checks.length > 0, 'CHECKS_EMPTY')
  const names = new Set()
  return checks.map(item => {
    exact(item, ['name', 'scope', 'required', 'status', 'reason', 'exitCode', 'tests', 'skipped', 'assertions'])
    requireThat(text(item.name) && !names.has(item.name) && SCOPES.includes(item.scope) && typeof item.required === 'boolean' && ['completed', 'not-run', 'not-applicable'].includes(item.status), 'CHECK_INVALID')
    names.add(item.name)
    requireThat(Number.isSafeInteger(item.tests) && item.tests >= 0 && Number.isSafeInteger(item.skipped) && item.skipped >= 0 && item.skipped <= item.tests, 'CHECK_INVALID')
    if (item.status === 'completed') requireThat(Number.isSafeInteger(item.exitCode) && item.reason === null, 'CHECK_INVALID')
    else requireThat(text(item.reason) && item.exitCode === null && item.tests === 0 && item.skipped === 0, 'CHECK_INVALID')
    return { ...item, assertions: assertionList(item.assertions) }
  })
}
function cleanupList(cleanup) {
  requireThat(Array.isArray(cleanup) && cleanup.length > 0, 'CLEANUP_EMPTY')
  const names = new Set()
  return cleanup.map(item => {
    exact(item, ['name', 'owner', 'status', 'reason'])
    requireThat(text(item.name) && !names.has(item.name) && text(item.owner) && ['completed', 'failed', 'not-applicable'].includes(item.status), 'CLEANUP_INVALID')
    names.add(item.name)
    requireThat(item.status === 'completed' ? item.reason === null : text(item.reason), 'CLEANUP_INVALID')
    return { ...item }
  })
}
function outcome(scope, checks, cleanup) {
  const required = checks.filter(item => item.required)
  const passed = required.length > 0 && required.some(item => item.scope === scope) && required.every(item => item.scope === scope && item.status === 'completed' && item.exitCode === 0 && item.tests > 0 && item.skipped === 0 && item.assertions.every(assertion => assertion.pass)) && cleanup.every(item => ['completed', 'not-applicable'].includes(item.status))
  return { scope, status: passed ? 'passed' : 'failed', pass: passed }
}
function checkReportPath(taskId, runId, reportPath) {
  safeInput(reportPath)
  const prefix = runPrefix(taskId, runId)
  requireThat(reportPath.startsWith(prefix) && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/.test(reportPath.slice(prefix.length)), 'REPORT_PATH_DENIED')
}
function artifacts(root, taskId, runId, paths, reportPath) {
  checkReportPath(taskId, runId, reportPath)
  requireThat(Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length, 'ARTIFACTS_EMPTY_OR_DUPLICATE')
  const prefix = runPrefix(taskId, runId)
  return paths.map(path => {
    safeInput(path)
    requireThat(path !== reportPath && path.startsWith(prefix) && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:json|log|txt|png)$/.test(path.slice(prefix.length)), 'ARTIFACT_PATH_DENIED')
    const file = readEntry(root, path, false, false)
    requireThat(file.bytes > 0, 'ARTIFACT_EMPTY')
    return { path, bytes: file.bytes, sha256: file.sha256 }
  })
}
function sameCandidate(before, after) {
  checkSnapshot(before); checkSnapshot(after)
  requireThat(canonical(before) === canonical(after), 'CANDIDATE_CHANGED_DURING_RUN')
}

/** Seal after the producer has completed cleanup. No operation here executes checks or grants permission. */
export function sealEvidence(input) {
  requireThat(input && Object.getPrototypeOf(input) === Object.prototype, 'INVALID_SHAPE')
  const { taskId, runId, producer, scope, candidateBefore, candidateAfter, checks, cleanup, artifactPaths, reportPath, ci = null } = input
  runPrefix(taskId, runId)
  requireThat(PRODUCERS.includes(producer) && SCOPES.includes(scope), 'INVALID_SCOPE_OR_PRODUCER')
  sameCandidate(candidateBefore, candidateAfter)
  checkReportPath(taskId, runId, reportPath)
  requireThat(Array.isArray(artifactPaths), 'INVALID_SHAPE')
  requireThat(candidateBefore.exclusions.outputPaths.includes(reportPath) && artifactPaths.every(path => candidateBefore.exclusions.outputPaths.includes(path)), 'OUTPUT_NOT_EXCLUDED')
  const checkedPolicy = policy({ outputs: candidateBefore.exclusions.outputPaths, extraInputs: candidateBefore.exclusions.extraInputs, taskId, runId })
  requireThat(canonical(checkedPolicy) === canonical(candidateBefore.exclusions), 'INVALID_SNAPSHOT')
  const checked = checksList(checks)
  const cleaned = cleanupList(cleanup)
  if (ci !== null) checkCi(ci)
  const body = { schemaVersion: 1, kind: 'omnimux-evidence', taskId, runId, producer, candidate: candidateBefore, checks: checked, cleanup: cleaned, artifacts: artifacts(candidateBefore.repo.realRoot, taskId, runId, artifactPaths, reportPath), reportPath, ci, result: outcome(scope, checked, cleaned) }
  return { ...body, reportDigest: digest('evidence-envelope', body) }
}
function checkCi(ci) {
  exact(ci, ['repository', 'workflow', 'event', 'runId', 'attempt', 'job', 'baseSha', 'headSha'])
  requireThat(['repository', 'workflow', 'event', 'runId', 'job'].every(key => text(ci[key])) && Number.isSafeInteger(ci.attempt) && ci.attempt > 0 && SHA.test(ci.baseSha) && SHA.test(ci.headSha), 'CI_INVALID')
}

/** @param {object} envelope @param {{purpose:string, root:string, taskId:string, runId:string, scope:string, requiredChecks:string[], expectedAssertions:Record<string,string[]>, currentCandidate?:object, executionObservation?:object, ci?:object}} expected */
export function validateEvidence(envelope, expected) {
  try {
    exact(envelope, ['schemaVersion', 'kind', 'taskId', 'runId', 'producer', 'candidate', 'checks', 'cleanup', 'artifacts', 'reportPath', 'ci', 'result', 'reportDigest'])
    requireThat(envelope.schemaVersion === 1 && envelope.kind === 'omnimux-evidence' && PRODUCERS.includes(envelope.producer), 'INVALID_ENVELOPE')
    const { reportDigest, ...body } = envelope
    requireThat(reportDigest === digest('evidence-envelope', body), 'REPORT_DIGEST_MISMATCH')
    requireThat(expected && ['history', 'candidate', 'ci', 'current-runtime', 'pre-e2e'].includes(expected.purpose), 'PURPOSE_UNSUPPORTED')
    requireThat(!['current-runtime', 'pre-e2e'].includes(expected.purpose), 'PURPOSE_UNSUPPORTED')
    requireThat(expected.taskId === envelope.taskId && expected.runId === envelope.runId && expected.scope === envelope.result.scope && SCOPES.includes(expected.scope), 'RUN_OR_SCOPE_MISMATCH')
    checkSnapshot(envelope.candidate)
    const repo = repository(expected.root)
    requireThat(canonical(repo) === canonical(envelope.candidate.repo), 'REPOSITORY_MISMATCH')
    // Recheck the declared narrow policy; a recomputed malicious snapshot cannot hide source paths.
    const checkedPolicy = policy({ outputs: envelope.candidate.exclusions.outputPaths, extraInputs: envelope.candidate.exclusions.extraInputs, taskId: envelope.taskId, runId: envelope.runId })
    requireThat(canonical(checkedPolicy) === canonical(envelope.candidate.exclusions), 'INVALID_SNAPSHOT')
    const checks = checksList(envelope.checks)
    const cleanup = cleanupList(envelope.cleanup)
    requireThat(canonical(outcome(expected.scope, checks, cleanup)) === canonical(envelope.result), 'RESULT_NOT_DERIVED')
    requireThat(Array.isArray(expected.requiredChecks) && expected.requiredChecks.length > 0 && new Set(expected.requiredChecks).size === expected.requiredChecks.length && canonical([...expected.requiredChecks].sort()) === canonical(checks.filter(check => check.required).map(check => check.name).sort()), 'REQUIRED_CHECKS_MISMATCH')
    requireThat(expected.expectedAssertions && Object.getPrototypeOf(expected.expectedAssertions) === Object.prototype, 'EXPECTED_ASSERTIONS_REQUIRED')
    for (const check of checks.filter(item => item.required)) {
      const names = expected.expectedAssertions[check.name]
      requireThat(Array.isArray(names) && names.length > 0 && names.every(text) && new Set(names).size === names.length && canonical([...names].sort()) === canonical(check.assertions.map(item => item.name).sort()), 'EXPECTED_ASSERTIONS_MISMATCH')
    }
    requireThat(envelope.candidate.exclusions.outputPaths.includes(envelope.reportPath) && envelope.artifacts.every(item => envelope.candidate.exclusions.outputPaths.includes(item.path)), 'OUTPUT_NOT_EXCLUDED')
    const actual = artifacts(expected.root, envelope.taskId, envelope.runId, envelope.artifacts.map(item => item.path), envelope.reportPath)
    requireThat(canonical(actual) === canonical(envelope.artifacts), 'ARTIFACT_CHANGED')
    if (expected.purpose !== 'history') {
      requireThat(expected.currentCandidate, 'CURRENT_CANDIDATE_REQUIRED')
      sameCandidate(envelope.candidate, expected.currentCandidate)
    }
    const observation = expected.executionObservation
    const observed = envelope.producer === 'controlled-runner' && observation && ['coordinator-observed-local-run', 'provider-ci-observed'].includes(observation.source) && observation.taskId === envelope.taskId && observation.runId === envelope.runId && observation.reportDigest === reportDigest
    if (envelope.ci !== null) { checkCi(envelope.ci); requireThat(envelope.ci.baseSha === envelope.candidate.base.resolvedSha && envelope.ci.headSha === envelope.candidate.head.resolvedSha, 'CI_CANDIDATE_MISMATCH') }
    if (expected.purpose === 'ci') {
      checkCi(expected.ci)
      requireThat(canonical(expected.ci) === canonical(envelope.ci) && observed && observation.source === 'provider-ci-observed', 'CI_CONTEXT_MISMATCH')
    }
    return { valid: true, applicable: true, scope: envelope.result.scope, pass: envelope.result.pass, errors: [], provenance: observed ? observation.source : 'self-reported', authorization: 'not-granted' }
  } catch (error) {
    return { valid: false, applicable: false, scope: null, pass: false, errors: [error.code && error.message === error.code ? error.code : 'INVALID_SHAPE'], provenance: 'unknown', authorization: 'not-granted' }
  }
}
