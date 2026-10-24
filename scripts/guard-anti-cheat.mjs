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
import { inspectTestAuthoring, inspectTestStandardChange, parseOldStandardDeclarations, matchOldStandardDeclarations } from './test-authoring-inspection.mjs';
import { taskSpecs, readSpecSections, SPEC_SECTION_MIN_CHARS } from './guard-quality-loop.mjs';

const isTestPath = path => /(^|\/)(tests?|specs?|__tests__)(\/|$)|\.(test|spec)\.[a-zA-Z0-9]+$/i.test(path.replace(/\\/g, '/')) && !/\.md$/i.test(path);
const isFixturePath = path => /(^|\/)(fixtures?|mocks?|test-data)(\/|$)|(\.|\/)(fixture|mock)\.[a-zA-Z0-9]+$/i.test(path.replace(/\\/g, '/'));

/**
 * 受评估契约保护的路径：测试文件且非夹具。
 * hook 与 CI 侧声明校验共用同一判定，避免两处口径漂移。
 */
export function isProtectedTestPath(path) {
  return isTestPath(path) && !isFixturePath(path);
}
/**
 * 解析不了的新增测试文件里，仍可用字面模式拦住最典型的三类风险：
 * 跳过/聚焦选择、动态执行、外部执行来源。只匹配「调用形态」而不是裸关键字，
 * 避免把 `test('skips invalid input')` 这类正常命名误伤。
 */
const UNPARSEABLE_RISK_PATTERNS = [
  /(?:^|[^.\w$])(?:test|it|describe|suite)\.(?:skip|only|todo)\s*\(/,
  // vitest 也支持对象选项写法：test('a', { skip: true }, fn)
  // 旧式跳过/聚焦别名（jasmine / mocha / jest）：与结构化检查保持同一族。前置字符不含 `.`，
  // 所以 `obj.fit(` 不命中；命名空间前缀另列一条。
  /(?:^|[^.\w$])(?:xit|xtest|xdescribe|xcontext|xspecify|fit|ftest|fdescribe)\s*\(/,
  /\b(?:globalThis|window|self|this|jasmine)\s*\.\s*(?:xit|xtest|xdescribe|xcontext|xspecify|fit|ftest|fdescribe)\s*\(/,
  /\{\s*(?:skip|only|todo)\s*:\s*true\b/,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\brequire\s*\(/,
  /(?:^|[^.\w$])import\s*\(/,
  /['"]node:(?:vm|child_process|worker_threads)['"]/,
  /\bprocess\.binding\s*\(/,
];
function unparseableNewFileRisk(content) {
  const text = String(content ?? '');
  return UNPARSEABLE_RISK_PATTERNS.some(pattern => pattern.test(text));
}

function testDecision(inspection) {
  return inspection.allowed ? { permissionDecision: 'allow' } : {
    permissionDecision: 'deny',
    ruleId: 'RULE-01-TEST-IMMUTABLE',
    reason: '【硬门禁拦截】测试用例与断言属于只读评估契约：禁止删除/改写已有测试用例或断言（新增用例、追加断言放行）；不可新增执行风险；旧标准变更仍须独立审查。'
  };
}

/** `## 旧标准变更` 声明节；只有具名用例的削弱才可进入该通道。 */
export const OLD_STANDARD_SECTION = '旧标准变更';
/**
 * 唯一可经 spec 声明放行的拒绝原因。其余（跳过、聚焦、动态执行、公共绑定逃逸、
 * 解析失败等）恒为硬拒绝。CI 侧校验复用本集合，避免两处各写一份而漂移。
 */
export const DECLARABLE_TEST_STANDARD_REASONS = new Set(['test-assertion-removed-or-rewritten', 'test-case-removed-or-renamed']);

/**
 * 汇总本任务 spec 中「## 旧标准变更」的声明条目。
 *
 * 复用 `guard-quality-loop.mjs` 的 `taskSpecs` / `readSpecSections`，不引入第二套
 * 「什么算任务规格」的判定。声明节必须实质存在（≥20 非空白字符），避免空标题占位。
 */
export function collectOldStandardDeclarations(root = REPO_ROOT) {
  const declarations = [];
  for (const spec of taskSpecs(root)) {
    let text = '';
    try { text = readFileSync(spec.path, 'utf8'); } catch { continue; }
    const section = readSpecSections(text).get(OLD_STANDARD_SECTION) ?? '';
    if (section.replace(/\s+/g, '').length < SPEC_SECTION_MIN_CHARS) continue;
    declarations.push(...parseOldStandardDeclarations(section));
  }
  return declarations;
}

/**
 * 旧标准变更通道：被 spec 逐条点名的既有用例削弱可放行。
 *
 * 通道只判定「是否被点名」，不判定理由是否成立——后者交给审查者。痕迹由三处承载：
 * spec 声明（受版本管理）、diff、以及 `scripts/test-change-review.mjs` 的评估域清单
 * （该清单目前是独立工具，其 `scan` 尚未接入 CI）。
 * 未命中声明时返回 null，调用方沿用原拒绝信息，行为与开启通道前完全一致。
 *
 * 不落在具名 `test`/`it` 内的断言削弱（`changedCases` 为空）不开放通道：
 * 没有可点名的稳定对象，就没有可审查的声明。
 */
export function decideOldStandardDeclaration({ filePath, inspection, declarations, root = REPO_ROOT }) {
  if (!inspection || inspection.allowed) return null;
  if (!DECLARABLE_TEST_STANDARD_REASONS.has(inspection.reason)) return null;
  const changedCases = Array.isArray(inspection.changedCases) ? inspection.changedCases : [];
  if (changedCases.length === 0) return null;
  const declared = Array.isArray(declarations) ? declarations : collectOldStandardDeclarations(root);
  const { ok, missing } = matchOldStandardDeclarations({ declarations: declared, filePath, changedCases });
  if (ok) return { permissionDecision: 'allow' };
  return {
    permissionDecision: 'deny',
    ruleId: 'RULE-01-TEST-IMMUTABLE',
    reason: `【硬门禁拦截】测试用例与断言属于只读评估契约：${filePath} 的既有用例被削弱，但本任务 spec 的「## ${OLD_STANDARD_SECTION}」未逐条点名。缺声明：${missing.map(name => `\`${name}\``).join('、')}。请按 \`- \\\`${filePath}\\\` :: \\\`<用例名>\\\`\` 逐条声明，并写明原断言、必须改的理由与新期望证据。`
  };
}

// Repository identity starts at this guard's checkout, never at tool-supplied cwd.
const REPO_ROOT = realpathSync(fileURLToPath(new URL('../', import.meta.url)));

/** 包含该路径的仓库/工作树根；找不到 `.git` 时返回 null。 */
function repoRootOf(path) {
  let root = dirname(path);
  while (dirname(root) !== root) {
    if (existsSync(resolve(root, '.git'))) return root;
    root = dirname(root);
  }
  return null;
}

/** 仓库相对路径；找不到 `.git` 时原样返回（声明匹配因此不会误命中）。 */
function repoRelativePath(path) {
  const root = repoRootOf(path);
  return root === null ? path : relative(root, path).replace(/\\/g, '/');
}

/** 目标已存在时的磁盘现状；缺失、目录或符号链接一律视为「没有可比对的 before」。 */
function readExistingSource(path) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return readFileSync(path, 'utf8');
  } catch { return null; }
}

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
    // 中间组件可以整条缺失（新建 `plugins/x/tests/` 这类目录是常规动作），但一旦出现
    // 缺失组件，其后所有组件必须同样缺失：缺失层之下又出现实体说明是符号链接、并发创建
    // 或路径构造异常，一律 fail closed。存在的组件仍逐个做 realpath 与类型检查。
    let missingSeen = false;
    for (let index = 0; index < parts.length; index++) {
      current = resolve(current, parts[index]);
      const last = index === parts.length - 1;
      const item = record(current, !last || directory, last ? missingAllowed : true);
      if (item?.missing) { missingSeen = true; continue; }
      if (missingSeen) throw new Error('Noncanonical or nonregular inspection path');
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
  // 目标已存在时必须与磁盘现状比较：否则导出的评估入口看不出断言被削弱，
  // 会对同一份候选内容给出比 hook 路径更宽松的结论。
  // 注意一致性是**单向**的：本入口比 `handle()` 更保守——它不参与「无 baseline 的
  // 新增文件解析失败即放行」那条放宽，同一份新增 TS 候选在这里仍然拒绝。
  // 本入口只被单测使用，hook 与 CI 都走 `handle()` 的 CLI，所以不影响运行路径。
  if (isTestFile && !isFixtureFile) {
    let snapshot;
    let inspection;
    let unverifiedImport = false;
    let target;
    try {
      target = resolve(cwd, normalizedPath);
      const before = readExistingSource(target);
      inspection = before === null
        ? inspectTestAuthoring(code, { resolveImport: source => {
          snapshot ??= createSourceInspection(target, tool === 'write');
          const fact = resolvePublicPluginImport(target, source, snapshot);
          if (!fact) unverifiedImport = true;
          return fact;
        } })
        : inspectTestStandardChange(before, code, { resolveImport: source => {
          snapshot ??= createSourceInspection(target, tool === 'write');
          const fact = resolvePublicPluginImport(target, source, snapshot);
          if (!fact) unverifiedImport = true;
          return fact;
        } });
      snapshot?.verify();
      if (unverifiedImport) inspection = { allowed: false };
    } catch { inspection = { allowed: false }; }
    finally { snapshot?.close(); }
    if (inspection.allowed !== true && target) {
      const declared = decideOldStandardDeclaration({ filePath: repoRelativePath(target), inspection, root: repoRootOf(target) ?? REPO_ROOT });
      if (declared) return declared;
    }
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
    const repoPath = repoRelativePath;
    const protectedPath = path => isProtectedTestPath(repoPath(path));
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
        const inspection = typeof source === 'string' ? inspectTestStandardChange(source, content, trustedFacts) : inspectTestAuthoring(content, trustedFacts);
        checkedTarget.verify();
        if (unverifiedImport) return formatHookOutput(testDecision({ allowed: false }), hookEventName);
        if (inspection.allowed) return formatHookOutput({ permissionDecision: 'allow' }, hookEventName);
        // 无 baseline = 纯新增：磁盘上没有既有文件，就没有既有标准可削弱。此时若唯一原因是
        // acorn 解析不了候选内容（`source` 为 null 说明目标不存在），放行——与 CI 侧
        // `change.before === null` 的「纯加法」口径一致。但解析不了就等于放弃了结构化检查，
        // 所以仍用字面模式拦最典型的风险（跳过/聚焦、动态执行、外部执行来源）；命中即沿用
        // 拒绝，且这些原因不可经声明放行。
        if (typeof source !== 'string' && inspection.reason === 'unsupported-or-incomplete-test-syntax'
          && !unparseableNewFileRisk(content)) {
          return formatHookOutput({ permissionDecision: 'allow' }, hookEventName);
        }
        // 旧标准变更通道：仅对「被 spec 逐条点名的具名用例削弱」放行。
        // 规格在被改文件所属的工作树里，不能用门禁自己的检出根去找。
        const declared = decideOldStandardDeclaration({ filePath: repoPath(target), inspection, root: repoRootOf(target) ?? REPO_ROOT });
        return formatHookOutput(declared ?? testDecision(inspection), hookEventName);
      } catch {
        return formatHookOutput({ permissionDecision: 'deny', reason: 'Cannot inspect canonical test target or source' }, hookEventName);
      } finally { checkedTarget?.close(); }
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
