#!/usr/bin/env node
/**
 * scripts/guard-anti-cheat.mjs
 * AI Agent 防兜底、假数据与虚假交差写前门禁 (PreToolUse Guard)
 *
 * 生产规则使用固定路径与模式，不接受任务意图或本地审批作为放行权限。
 * 测试检查是有界语法检查，已有标准变更仍须独立审查；不是执行沙箱。
 * 既可作为 DSH PreToolUse 独立运行，也可作为 ESM 模块由单元测试复用。
 */

import { readFileSync, existsSync, lstatSync, realpathSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { inspectTestAuthoring, inspectTestAuthoringDelta } from './test-authoring-inspection.mjs';
import {
  PROVENANCE_REASONS,
  recordAttestationUse,
  recordBusinessEdit,
  treeRootOf,
  verifyAttestation,
} from './test-review-provenance.mjs';

const isTestPath = path => /(^|\/)(tests?|specs?|__tests__)(\/|$)|\.(test|spec)\.[a-zA-Z0-9]+$/i.test(path.replace(/\\/g, '/')) && !/\.md$/i.test(path);
const isFixturePath = path => /(^|\/)(fixtures?|mocks?|test-data)(\/|$)|(\.|\/)(fixture|mock)\.[a-zA-Z0-9]+$/i.test(path.replace(/\\/g, '/'));
function testDecision(inspection) {
  return inspection.allowed ? { permissionDecision: 'allow' } : {
    permissionDecision: 'deny',
    ruleId: 'RULE-01-TEST-IMMUTABLE',
    reason: '【硬门禁拦截】测试用例与断言属于只读评估契约：禁止删除/改写已有测试用例或断言（新增用例、追加断言放行）；不可新增执行风险；旧标准变更仍须独立审查。'
  };
}

// Repository identity starts at this guard's checkout, never at tool-supplied cwd.
const REPO_ROOT = realpathSync(fileURLToPath(new URL('../', import.meta.url)));

// Trusted in-process I/O seam; tool input never supplies this object or its facts.
export const sourceInspectionIO = { readFileSync, lstatSync, realpathSync, openSync, closeSync, fstatSync, spawnSync };

function sameIdentity(before, after, directory = false) {
  const fields = directory ? ['dev', 'ino', 'mode'] : ['dev', 'ino', 'mode', 'size', 'mtimeMs', 'ctimeMs'];
  return fields.every(key => before[key] === after[key]);
}

function createSourceInspection(target, allowMissing = true) {
  const records = new Map();
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  let head;
  let treeRoot;
  let commonDir;
  let mainRoot;
  function git(args, root = treeRoot || REPO_ROOT) {
    const result = sourceInspectionIO.spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5000, env: gitEnv });
    if (result.status !== 0 || result.error) throw new Error('Cannot confirm repository identity');
    return result.stdout || '';
  }
  function currentHead() {
    const value = git(['rev-parse', '--verify', 'HEAD']).trim();
    if (!/^[0-9a-f]{40}$/.test(value)) throw new Error('Invalid repository HEAD');
    return value;
  }
  function record(path, directory, missingAllowed = false) {
    if (records.has(path)) return records.get(path);
    let stat;
    try { stat = sourceInspectionIO.lstatSync(path); }
    catch (error) {
      if (!missingAllowed || error.code !== 'ENOENT') throw error;
      const item = { path, missing: true };
      records.set(path, item);
      return item;
    }
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) || sourceInspectionIO.realpathSync(path) !== path) throw new Error('Noncanonical or nonregular inspection path');
    const item = { path, stat, directory };
    records.set(path, item);
    if (!directory) {
      item.fd = sourceInspectionIO.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const opened = sourceInspectionIO.fstatSync(item.fd);
      if (!opened.isFile() || !sameIdentity(stat, opened)) throw new Error('Path changed while opening');
    }
    return item;
  }
  function capturePath(path, directory = false, missingAllowed = false) {
    const parts = path.split(sep).filter(Boolean);
    let current = sep;
    record(current, true);
    for (let index = 0; index < parts.length; index++) {
      current = resolve(current, parts[index]);
      record(current, index < parts.length - 1 || directory, index === parts.length - 1 && missingAllowed);
    }
    return records.get(path);
  }
  function capture(path, missingAllowed = false) {
    const rel = relative(treeRoot, path);
    if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || rel.split(sep).includes('.worktrees')) throw new Error('Path outside selected repository tree');
    const item = capturePath(path, false, missingAllowed);
    const parents = rel.split(sep).slice(0, -1);
    let current = treeRoot;
    for (const part of parents) {
      current = resolve(current, part);
      if (!record(resolve(current, '.git'), false, true).missing) throw new Error('Nested repository in inspection path');
    }
    return item;
  }
  function metadata(path) {
    const item = capturePath(path);
    item.bytes ??= sourceInspectionIO.readFileSync(item.fd);
    return item.bytes.toString('utf8').trim();
  }
  function checkedGitDir(root) {
    const gitDir = git(['rev-parse', '--absolute-git-dir'], root).trim();
    const actualCommon = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], root).trim();
    if (actualCommon !== commonDir || git(['rev-parse', '--show-toplevel'], root).trim() !== root) throw new Error('Repository identity mismatch');
    if (root === mainRoot) {
      if (gitDir !== commonDir) throw new Error('Invalid main repository');
      capturePath(commonDir, true);
    } else {
      if (dirname(root) !== resolve(mainRoot, '.worktrees') || dirname(gitDir) !== resolve(commonDir, 'worktrees')) throw new Error('Unregistered worktree location');
      capturePath(gitDir, true);
      if (metadata(resolve(root, '.git')) !== `gitdir: ${gitDir}` || resolve(gitDir, metadata(resolve(gitDir, 'commondir'))) !== commonDir || metadata(resolve(gitDir, 'gitdir')) !== resolve(root, '.git')) throw new Error('Invalid worktree registration');
    }
    return gitDir;
  }
  let guardGitDir;
  let targetGitDir;
  function verifyRepository() {
    if (checkedGitDir(REPO_ROOT) !== guardGitDir || checkedGitDir(treeRoot) !== targetGitDir) throw new Error('Worktree identity changed');
    const registered = git(['worktree', 'list', '--porcelain', '-z'], REPO_ROOT).split('\0');
    if (!registered.includes(`worktree ${REPO_ROOT}`) || !registered.includes(`worktree ${treeRoot}`)) throw new Error('Worktree is not registered');
  }
  function selectTree() {
    commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], REPO_ROOT).trim();
    mainRoot = dirname(commonDir);
    if (commonDir !== resolve(mainRoot, '.git')) throw new Error('Unsupported common repository root');
    capturePath(commonDir, true);
    const rel = relative(mainRoot, target);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Target outside shared repository');
    const parts = rel.split(sep);
    treeRoot = parts[0] === '.worktrees' ? resolve(mainRoot, '.worktrees', parts[1] || '') : mainRoot;
    if (treeRoot === resolve(mainRoot, '.worktrees')) throw new Error('Missing registered task root');
    capturePath(treeRoot, true);
    guardGitDir = checkedGitDir(REPO_ROOT);
    targetGitDir = checkedGitDir(treeRoot);
    verifyRepository();
  }
  function verify() {
    // Child-process queries precede the final joint filesystem observation.
    verifyRepository();
    if (head !== undefined && currentHead() !== head) throw new Error('Repository HEAD changed');
    for (const item of records.values()) {
      if (item.missing) {
        try { sourceInspectionIO.lstatSync(item.path); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        throw new Error('New target appeared during inspection');
      }
      const live = sourceInspectionIO.lstatSync(item.path);
      if (live.isSymbolicLink() || (item.directory ? !live.isDirectory() : !live.isFile()) || !sameIdentity(item.stat, live, item.directory) || sourceInspectionIO.realpathSync(item.path) !== item.path) throw new Error('Inspection path changed');
      if (item.fd !== undefined && !sameIdentity(item.stat, sourceInspectionIO.fstatSync(item.fd))) throw new Error('Inspection file changed');
    }
  }
  function close() {
    for (const item of records.values()) if (item.fd !== undefined) sourceInspectionIO.closeSync(item.fd);
  }
  try { selectTree(); capture(target, allowMissing); } catch (error) { close(); throw error; }
  return {
    treeRoot,
    readTarget() {
      const item = records.get(target);
      const bytes = item.missing ? undefined : sourceInspectionIO.readFileSync(item.fd);
      verify();
      return bytes?.toString('utf8');
    },
    readSource(path) {
      if (head === undefined) head = currentHead();
      const item = capture(path);
      const bytes = item.bytes ??= sourceInspectionIO.readFileSync(item.fd);
      const rel = relative(treeRoot, path);
      const tree = git(['ls-tree', head, '--', rel]);
      const match = /^(100644|100755) blob ([0-9a-f]{40})\t([^\n]+)\n?$/.exec(tree);
      const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (!match || match[2] !== hash || match[3] !== rel) throw new Error('Source is not confirmed at fixed repository HEAD');
      return bytes;
    },
    verify, close,
  };
}

function readConfirmedSource(path, inspection) {
    const bytes = inspection.readSource(path);
    const ast = parse(bytes.toString('utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
    let unsafe = false;
    function checkSource(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier' && ['eval', 'Function'].includes(node.name)) unsafe = true;
      if (node.type === 'ImportExpression') unsafe = true;
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') unsafe = true;
      if (node.type === 'Property' && ['skip', 'only', 'todo'].includes(node.key.name ?? node.key.value)) unsafe = true;
      if (node.type === 'ImportDeclaration' && /^(?:node:)?(?:vm|child_process|worker_threads|module)$/.test(node.source.value)) unsafe = true;
      if (node.type === 'MemberExpression') {
        const key = node.computed ? node.property.value : node.property.name;
        if (['constructor', 'apply', 'call', 'bind', 'skip', 'only', 'todo', 'getBuiltinModule', 'binding', '_linkedBinding', 'dlopen', 'createRequire'].includes(key)) unsafe = true;
      }
      if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier' && node.left.name === 'apply') unsafe = true;
      if (node.type === 'UpdateExpression' && node.argument.type === 'Identifier' && node.argument.name === 'apply') unsafe = true;
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(checkSource);
        else if (value && typeof value === 'object') checkSource(value);
      }
    }
    checkSource(ast);
    if (unsafe) throw new Error('Dynamic source is not a verified public function');
    return { ast, sourceRealPath: path };
}

function resolvePublicPluginImport(filePath, source, inspection) {
  try {
    if (typeof source !== 'string' || !source.startsWith('./') && !source.startsWith('../')) return null;
    const target = resolve(filePath);
    const entryPath = resolve(dirname(target), source);
    const rel = relative(inspection.treeRoot, entryPath);
    if (!/^plugins\/[^/]+\/src\/index\.js$/.test(rel)) return null;
    const entry = readConfirmedSource(entryPath, inspection);
    const statements = entry.ast.body;
    const direct = statements.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration' && node.declaration.id?.name === 'apply');
    if (direct) return { sourceRealPath: entryPath, strictSourceFunction: 'apply' };
    const exported = statements.filter(node => node.type === 'ExportNamedDeclaration' && node.specifiers.some(item => item.exported.name === 'apply'));
    if (exported.length !== 1) return null;
    const declaration = exported[0];
    const specifier = declaration.specifiers.find(item => item.exported.name === 'apply');
    if (specifier.local.name !== 'apply') return null;
    let hostSource = declaration.source?.value;
    if (!hostSource) {
      const imported = statements.find(node => node.type === 'ImportDeclaration' && node.specifiers.some(item => item.type === 'ImportSpecifier' && item.imported.name === 'apply' && item.local.name === 'apply'));
      hostSource = imported?.source.value;
      // An imported binding may only be imported and re-exported, never used as a value.
      const permitted = new Set([specifier, imported?.specifiers.find(item => item.local.name === 'apply')]);
      let invalid = false;
      function check(node, parent) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Identifier' && node.name === 'apply' && !permitted.has(parent)) invalid = true;
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(child => check(child, node));
          else if (value && typeof value === 'object') check(value, node);
        }
      }
      check(entry.ast);
      if (invalid) return null;
    }
    if (hostSource !== './host/apply.js') return null;
    const host = readConfirmedSource(resolve(dirname(entryPath), hostSource), inspection);
    const functions = host.ast.body.filter(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration' && node.declaration.id?.name === 'apply');
    if (functions.length !== 1) return null;
    return { sourceRealPath: entryPath, strictSourceFunction: 'apply' };
  } catch { return null; }
}

/**
 * 核心判定函数
 * @param {object} params
 * @param {string} params.tool - 工具名称 (write|edit)
 * @param {string} params.filePath - 目标文件路径
 * @param {string} params.content - 拟写入/替换的内容
 * @param {string} [params.intent] - 兼容参数，ignored_noauthority
 * @param {Array<object>} [params.exemptions] - 兼容参数，ignored_noauthority
 * @returns {{ permissionDecision: 'allow'|'deny', reason?: string, ruleId?: string }}
 */
export function evaluateAntiCheat(params) {
  return evaluateWithInspection(params);
}

function evaluateWithInspection({ tool, filePath, content, cwd = process.cwd() }) {
  if (tool !== 'write' && tool !== 'edit') {
    return { permissionDecision: 'allow' };
  }

  const normalizedPath = (filePath || '').replace(/\\/g, '/');
  const code = content || '';

  // 任务规格不是可执行测试；文档中的代码示例也不是生产写入。
  if (/\.md$/i.test(normalizedPath)) {
    return { permissionDecision: 'allow' };
  }

  const isTestFile = isTestPath(normalizedPath);
  const isFixtureFile = isFixturePath(normalizedPath);
  // Pure candidates have no trusted before; test intent and approval metadata are not authority.
  if (isTestFile && !isFixtureFile) {
    let snapshot;
    let inspection;
    let unverifiedImport = false;
    try {
      const target = resolve(cwd, normalizedPath);
      inspection = inspectTestAuthoring(code, { resolveImport: source => {
        snapshot ??= createSourceInspection(target, tool === 'write');
        const fact = resolvePublicPluginImport(target, source, snapshot);
        if (!fact) unverifiedImport = true;
        return fact;
      } });
      snapshot?.verify();
      if (unverifiedImport) inspection = { allowed: false };
    } catch { inspection = { allowed: false }; }
    finally { snapshot?.close(); }
    return testDecision(inspection);
  }

  // 2. 门禁 2：生产代码硬编码 Mock/Fake 数据注入拦截
  if (!isTestFile && !isFixtureFile) {
    const mockPattern = /(const|let|var)\s+(mock|fake|dummy|fallback)[A-Za-z0-9_]*\s*=\s*(\[|\{)/i;
    if (mockPattern.test(code)) {
      return {
        permissionDecision: 'deny',
        ruleId: 'RULE-02-ANTI-MOCK-DATA',
        reason: '【硬门禁拦截】生产代码中检测到硬编码 Mock/Fake 数据注入。请对接真实链路或使用阻断上报协议！'
      };
    }
  }

  // 3. 门禁 3：静默吞错与返回虚假成功状态拦截 (Silent Catch Guard)
  if (!isTestFile && !isFixtureFile) {
    // 检测 catch 块中直接返回伪造状态对象（如 { ok: true }, { status: 'mock_healthy' } 等）
    const silentFakeReturnPattern = /catch\s*\([^)]*\)\s*\{[^}]*return\s*\{[^}]*(ok|status|success)[^}]*\}/i;
    if (silentFakeReturnPattern.test(code)) {
      return {
        permissionDecision: 'deny',
        ruleId: 'RULE-03-ANTI-SILENT-CATCH',
        reason: '【硬门禁拦截】检测到静默吞错并返回虚假成功状态。日志不能授权假成功；请向上抛出异常或显式上报阻断！'
      };
    }
  }

  return { permissionDecision: 'allow' };
}

/* ------------------------------------------------------------------ 格式化与输出辅助 */
function formatHookOutput(decision, hookEventName = 'PreToolUse') {
  const output = {
    hookEventName,
    permissionDecision: decision.permissionDecision,
  };
  if (decision.permissionDecision === 'deny') {
    output.permissionDecisionReason = decision.reason || '【硬门禁拦截】命中防造假与合规防御规则。';
  }
  return { hookSpecificOutput: output };
}

function failClosedHookOutput(err, hookEventName = 'PreToolUse') {
  console.error('[guard-anti-cheat] 门禁执行异常 (Fail-Closed):', err);
  return {
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: 'deny',
      permissionDecisionReason: `【硬门禁异常拦截 (Fail-Closed)】防造假门禁执行异常: ${err?.message || '未知错误'}。触发安全阻断。`,
    },
  };
}

export function handle(rawInput) {
  let input = {};
  if (rawInput && rawInput.trim()) {
    input = JSON.parse(rawInput.trim());
  } else if (process.env.DSH_TOOL_INPUT) {
    input = JSON.parse(process.env.DSH_TOOL_INPUT);
  }

  const hookEventName = input.hook_event_name || 'PreToolUse';
  const rawTool = String(input.tool_name || process.env.DSH_TOOL_NAME || 'write').toLowerCase();
  const toolName = rawTool.replace(/^.*:/, '');
  const toolInput = input.tool_input || (input.file_path ? input : {});
  const filePath = toolInput.file_path || input.file_path || '';
  let content = toolInput.content || toolInput.new_string || input.content || input.new_string || '';
  if (toolName === 'write' || toolName === 'edit') {
    const cwd = resolve(input.cwd || process.cwd(), toolInput.workdir || '.');
    const target = resolve(cwd, filePath.replace(/\\/g, '/'));
    if (target === REPO_ROOT) return formatHookOutput({ permissionDecision: 'deny', reason: 'Repository root is not a file target' }, hookEventName);
    const repoPath = path => {
      let root = dirname(path);
      while (dirname(root) !== root) {
        if (existsSync(resolve(root, '.git'))) return relative(root, path).replace(/\\/g, '/');
        root = dirname(root);
      }
      return path;
    };
    const protectedPath = path => { const ownedPath = repoPath(path); return isTestPath(ownedPath) && !isFixturePath(ownedPath); };
    let actualTarget = target;
    if (!protectedPath(target)) {
      try { actualTarget = realpathSync(target); }
      catch (err) { if (err.code !== 'ENOENT' && protectedPath(target)) throw err; }
    }
    if (protectedPath(target) || protectedPath(actualTarget)) {
      let checkedTarget;
      try {
        checkedTarget = createSourceInspection(target, toolName === 'write');
        const source = checkedTarget.readTarget();
        if (toolName === 'edit') {
          const oldString = toolInput.old_string;
          if (typeof source !== 'string' || typeof oldString !== 'string' || !oldString || !source.includes(oldString)) throw new Error('Cannot reconstruct test edit');
          if (!toolInput.replace_all && source.indexOf(oldString) !== source.lastIndexOf(oldString)) throw new Error('Ambiguous test edit');
          const replacement = toolInput.new_string ?? '';
          if (typeof replacement !== 'string') throw new Error('Invalid test replacement');
          content = toolInput.replace_all ? source.split(oldString).join(replacement) : source.replace(oldString, () => replacement);
        } else {
          content = toolInput.content ?? input.content;
          if (typeof content !== 'string') throw new Error('Missing complete test candidate');
        }
        let unverifiedImport = false;
        const trustedFacts = { resolveImport: source => {
          const fact = resolvePublicPluginImport(target, source, checkedTarget);
          if (!fact) unverifiedImport = true;
          return fact;
        } };
        const inspection = typeof source === 'string' ? inspectTestAuthoringDelta(source, content, trustedFacts) : inspectTestAuthoring(content, trustedFacts);
        checkedTarget.verify();

        // 独立评审来源证明：仅当拒绝原因恰为「既有断言被改写」时，才考虑由另一个 Agent 会话放行。
        // 判定要求：存证精确匹配 (file, before, after)，只能被其作者会话使用，且该作者会话未写过业务源码。
        if (!unverifiedImport && !inspection.allowed && PROVENANCE_REASONS.has(inspection.reason) && typeof source === 'string') {
          const treeRoot = treeRootOf(target);
          const relFile = treeRoot ? relative(treeRoot, target).replace(/\\/g, '/') : null;
          const sessionId = process.env.DSH_SESSION_ID || null;
          const proven = verifyAttestation({ root: treeRoot, relFile, beforeText: source, afterText: content, sessionId });
          if (proven.ok) {
            recordAttestationUse({ root: treeRoot, relFile, beforeText: source, afterText: content, sessionId, attestationId: proven.attestationId });
            return formatHookOutput({ permissionDecision: 'allow' }, hookEventName);
          }
          const base = testDecision({ allowed: false });
          return formatHookOutput({
            permissionDecision: 'deny',
            ruleId: base.ruleId,
            reason: `${base.reason}（独立评审来源证明未成立：${proven.reason}）`,
          }, hookEventName);
        }

        return formatHookOutput(testDecision(unverifiedImport ? { allowed: false } : inspection), hookEventName);
      } catch {
        return formatHookOutput({ permissionDecision: 'deny', reason: 'Cannot inspect canonical test target or source' }, hookEventName);
      } finally { checkedTarget?.close(); }
    }
  }
  // 业务源码写入记账：记录 hook 亲observed 的会话身份，供「作者不得自审」判定。
  // 记账失败不影响本次判定（缺账本只会让后续存证无法成立，属 fail-closed）。
  const ledgerSession = process.env.DSH_SESSION_ID || null;
  if (ledgerSession) {
    try {
      const treeRoot = treeRootOf(target);
      const relPath = treeRoot ? relative(treeRoot, target).replace(/\\/g, '/') : null;
      if (treeRoot && relPath) {
        recordBusinessEdit({
          root: treeRoot,
          relPath,
          sessionId: ledgerSession,
          digest: typeof content === 'string' && content ? createHash('sha256').update(content).digest('hex') : null,
        });
      }
    } catch {
      // 账本写入失败不阻断判定
    }
  }
  const decision = evaluateWithInspection({
    tool: toolName,
    filePath,
    content,
    cwd: resolve(input.cwd || process.cwd(), toolInput.workdir || '.'),
  });
  return formatHookOutput(decision, hookEventName);
}

function main() {
  let rawInput = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    rawInput += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const output = handle(rawInput);
      process.stdout.write(JSON.stringify(output) + '\n');
    } catch (err) {
      const fallback = failClosedHookOutput(err);
      process.stdout.write(JSON.stringify(fallback) + '\n');
    }
  });
}

/* ------------------------------------------------------------------ CLI / Hook 运行时入口 */
if (process.argv[1] && process.argv[1].endsWith('guard-anti-cheat.mjs')) {
  main();
}
