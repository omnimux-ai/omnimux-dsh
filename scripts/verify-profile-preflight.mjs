#!/usr/bin/env node
/**
 * @file verify-profile-preflight.mjs
 * @description Profile 物化启动预检（Materialize Pre-flight / Dry Run）
 *
 * 在物化脚本写入目标 Profile 之后，模拟真实 DSH/Cordis 插件树加载与 apply(ctx) 执行：
 * 1. 验证目标 Profile 的 package.json 及其依赖拓扑；
 * 2. 模拟真实 Cordis 宿主上下文（含严格的 tools.register 契约门禁）；
 * 3. 动态加载并执行所有 omnimux-* 插件的 apply(ctx)；
 * 4. 若任何插件在 apply 阶段报错（如缺失 output、语法错误、缺失依赖），立即返回退出码 1，触发物化脚本回滚。
 *
 * 宿主包（`@deepseek-ai/*`）只存在于桌面 App 的 `app.asar` 内：Profile 不落地它们，
 * 普通 Node 从 Profile 目录往上找必然解析不到。预检在**解析不到时**按官方
 * `module.registerHooks()` 把它们重定向到一个最小替身。
 *
 * 代际对齐（Issue #3145）：
 * - 宿主代际以**被物化目标应用**的声明为准（`<App>/Contents/Resources/build-info.json`
 *   的 `dsh.packageSpec`，并用该 App 自带的宿主包版本交叉核对）；无法确定目标应用或其声明时
 *   直接报错退出，绝不退回替身。
 * - 若 Profile 侧能真实解析到宿主包（如 Dev profile 的软链农场指向全局 `dsh` CLI），
 *   其代际必须与目标应用一致，否则**指名失败**（哪个包、期望哪一代、实际哪一代、解析到哪里）。
 * - 替身的具名导出面**逐条取自目标应用自带的真实副本**（asar / unpacked），因此不会制造
 *   目标代际并不存在的导出：插件 import 了目标代际没有的名字时，会在解析期响亮失败。
 *   替身只保证签名（`defineTool` 返回带 `name` 与 `output.render` 的工具对象），不做真包的
 *   schema 编译与参数校验。
 */

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const nodeRequire = nodeModule.createRequire(import.meta.url);

/**
 * Electron 接管 `node:fs` 后会把任何含 `.asar` 的路径当作归档**内部**路径解析：
 * 直接探测或读取归档文件本身会得到 `ENOENT ... not found in .../app.asar`
 * 或 `Failed to parse header`。桌面运行时（如 `pnpm` 使用的 Electron node shim）下
 * 对 `.asar` 路径必须走 `original-fs`。
 */
let archiveFsModule = null;
function archiveFs() {
  if (archiveFsModule === null) {
    archiveFsModule = { existsSync, readFileSync };
    if (process.versions.electron) {
      try {
        const originalFs = nodeRequire('original-fs');
        archiveFsModule = { existsSync: originalFs.existsSync, readFileSync: originalFs.readFileSync };
      } catch {
        // 没有 original-fs 时回落到 node:fs
      }
    }
  }
  return archiveFsModule;
}

function archiveExists(asarPath) {
  return archiveFs().existsSync(asarPath);
}

function readArchiveBytes(asarPath) {
  return archiveFs().readFileSync(asarPath);
}

const HOST_PACKAGE_PREFIX = '@deepseek-ai/';
// 三个物化目标 home（`<home>/profiles/omnimux`）各自的宿主 App：
// Dev → OmniMux Dev.app、Prod → OmniMux.app、`--dsh` → 官方 DSH Desktop.app。
const TARGET_APP_BY_HOME_NAME = new Map([
  ['.omnimux-dev', '/Applications/OmniMux Dev.app'],
  ['.omnimux', '/Applications/OmniMux.app'],
  ['.dsh', '/Applications/DSH Desktop.app'],
]);
const TARGET_APP_ENV = 'OMNIMUX_PREFLIGHT_TARGET_APP';

function fail(message) {
  console.error(`❌ [Pre-flight] ${message}`);
  process.exit(1);
}

function readJsonFile(path, what) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    fail(`无法读取${what}: ${path}（${error.code || error.message}）`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${what}不是合法 JSON: ${path}（${error.message}）`);
  }
}

// ---------------------------------------------------------------- 目标应用与目标代际

/** 目标应用 Bundle：显式 `--app` / 环境变量优先，否则按 Profile 所属 home 推断。 */
function resolveTargetApp(profileRoot, explicitApp) {
  if (explicitApp) {
    const app = resolve(explicitApp);
    if (!existsSync(app)) fail(`指定的目标应用不存在: ${app}`);
    return app;
  }
  // Profile 形状固定为 `<home>/profiles/<name>`，home 名字决定物化目标 App。
  // `--target` 允许指向同一个 home 的别名路径（`~/x/./.omnimux`、指向 home 的软链），
  // 因此先按原路径判定，再按 realpath 判定。
  const homeCandidates = [dirname(dirname(profileRoot))];
  try {
    homeCandidates.push(dirname(dirname(realpathSync(profileRoot))));
  } catch {
    // 路径不可解析时只按原路径判定
  }
  for (const homeDir of homeCandidates) {
    const inferred = TARGET_APP_BY_HOME_NAME.get(basename(homeDir));
    if (inferred) return inferred;
  }
  const realHome = homedir();
  for (const [name, app] of TARGET_APP_BY_HOME_NAME) {
    const root = join(realHome, name);
    if (profileRoot === root || profileRoot.startsWith(root + sep)) return app;
  }
  return null;
}

/** 目标应用自带的宿主包（用于在缺少 build-info 时确定代际）。 */
const GENERATION_PROBE_PACKAGES = ['@deepseek-ai/dsh', '@deepseek-ai/dsh-settings'];

/**
 * 目标应用的宿主代际：
 * 1. 优先 `Contents/Resources/build-info.json` 的 `dsh.packageSpec`；
 * 2. 无 build-info 时（如未打包的官方 DSH Desktop.app）以该 App 自带宿主包的实际版本为准；
 * 3. 两者都拿不到 → 报错退出，绝不退回替身。
 */
function readTargetGeneration(appPath, host) {
  const buildInfoPath = join(appPath, 'Contents', 'Resources', 'build-info.json');
  let declared = null;
  if (existsSync(buildInfoPath)) {
    const spec = readJsonFile(buildInfoPath, '目标应用 build-info.json')?.dsh?.packageSpec;
    if (typeof spec === 'string' && spec.trim() !== '') declared = spec.trim();
  }

  const bundled = new Set();
  for (const name of GENERATION_PROBE_PACKAGES) {
    const pkg = host.packageJson(name);
    if (pkg && typeof pkg.version === 'string') bundled.add(pkg.version);
  }

  if (declared && bundled.size > 0 && !bundled.has(declared)) {
    fail(`目标应用自身代际不一致: ${appPath} 的 build-info.json 声明 ${declared}，`
      + `但自带宿主包实际为 ${[...bundled].sort().join(', ')}。预检不会用替身掩盖。`);
  }
  if (declared) return declared;
  if (bundled.size === 1) return [...bundled][0];
  if (bundled.size > 1) {
    fail(`无法确定目标应用的宿主代际: ${appPath} 自带宿主包版本互相矛盾（${[...bundled].sort().join(', ')}）。`);
  }
  fail(`无法确定目标应用的宿主代际: ${appPath} 既没有 Contents/Resources/build-info.json 的 dsh.packageSpec，`
    + `也不自带 @deepseek-ai/dsh 宿主包。预检不会退回最小替身。`);
}

// ---------------------------------------------------------------- 目标应用自带宿主包

function openAsar(asarPath) {
  let raw;
  try {
    raw = readArchiveBytes(asarPath);
  } catch (error) {
    fail(`无法读取目标应用归档 ${asarPath}（${error.code || error.message}）`);
  }
  let header;
  let base;
  try {
    const headerSize = raw.readUInt32LE(4);
    const jsonSize = raw.readUInt32LE(12);
    header = JSON.parse(raw.subarray(16, 16 + jsonSize).toString('utf8'));
    base = 8 + headerSize;
  } catch (error) {
    fail(`目标应用归档头部无法解析: ${asarPath}（${error.message}）`);
  }
  return (relativePath) => {
    let node = header;
    for (const part of relativePath.split('/').filter(Boolean)) {
      node = node?.files?.[part];
      if (!node) return null;
    }
    if (!node || node.files) return null;
    const start = base + Number(node.offset);
    return raw.subarray(start, start + Number(node.size)).toString('utf8');
  };
}

/** 目标应用自带的 `@deepseek-ai/*` 副本（app.asar / app.asar.unpacked / 未打包 app 目录）。 */
class TargetHostPackages {
  constructor(appPath) {
    this.resources = join(appPath, 'Contents', 'Resources');
    this.roots = [
      join(this.resources, 'app.asar.unpacked', 'node_modules'),
      join(this.resources, 'app', 'node_modules'),
    ];
    this.asarPath = join(this.resources, 'app.asar');
    this.readAsar = null;
  }

  readPackageFile(packageName, relativePath) {
    for (const root of this.roots) {
      const candidate = join(root, packageName, relativePath);
      if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    }
    if (this.readAsar === null) {
      this.readAsar = archiveExists(this.asarPath) ? openAsar(this.asarPath) : false;
    }
    return this.readAsar ? this.readAsar(`node_modules/${packageName}/${relativePath}`) : null;
  }

  packageJson(packageName) {
    const raw = this.readPackageFile(packageName, 'package.json');
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** 解析 specifier 对应的包内入口文件（含 exports 子路径映射）。 */
  entryFile(packageName, subpath) {
    const pkg = this.packageJson(packageName);
    if (!pkg) return null;
    const target = resolveExportsTarget(pkg, subpath);
    if (!target) return null;
    const relativePath = String(target).replace(/^\.\//, '');
    return this.readPackageFile(packageName, relativePath) === null ? null : relativePath;
  }
}

function splitSpecifier(specifier) {
  const parts = specifier.split('/');
  const packageName = parts.slice(0, 2).join('/');
  return { packageName, subpath: parts.slice(2).join('/') };
}

function resolveExportsTarget(pkg, subpath) {
  const exportsField = pkg.exports;
  const key = subpath ? `./${subpath}` : '.';
  let target = null;
  if (typeof exportsField === 'string') {
    target = subpath ? null : exportsField;
  } else if (exportsField && typeof exportsField === 'object') {
    target = exportsField[key];
    if (target === undefined) {
      for (const [pattern, value] of Object.entries(exportsField)) {
        if (!pattern.includes('*')) continue;
        const [prefix, suffix] = pattern.split('*');
        if (key.startsWith(prefix) && key.endsWith(suffix)) {
          const captured = key.slice(prefix.length, key.length - suffix.length);
          target = typeof value === 'string' ? value.replace('*', captured) : value;
          break;
        }
      }
    }
    if (target && typeof target === 'object') {
      target = target.default ?? target.import ?? target.require ?? null;
    }
  }
  if (target === null && subpath === '') target = pkg.main || 'index.js';
  return target ? String(target) : null;
}

// ---------------------------------------------------------------- 导出面解析

const JS_RESERVED = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

const isExportableName = (name) => /^[A-Za-z_$][\w$]*$/.test(name) && !JS_RESERVED.has(name);

function parseExportStatements(source) {
  const names = new Set();
  const reexports = new Set();
  let hasDefault = false;

  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    if (isExportableName(match[1])) names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const piece of match[1].split(',')) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const aliased = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(trimmed);
      const name = aliased ? aliased[1] : trimmed.split(/\s+/)[0];
      if (name === 'default') hasDefault = true;
      else if (isExportableName(name)) names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const piece of match[1].split(',')) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const aliased = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(trimmed);
      const name = aliased ? aliased[1] : trimmed.split(/\s+/)[0];
      if (name === 'default') hasDefault = true;
      else if (isExportableName(name)) names.add(name);
    }
    reexports.add(match[2]);
  }
  for (const match of source.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    reexports.add(match[1]);
  }
  if (/export\s+default\b/.test(source)) hasDefault = true;
  return { names, hasDefault, reexports };
}

/**
 * 目标应用自带副本的具名导出面。递归跟随 `export * from` / `export { … } from`，
 * 相对路径按包内文件解析，裸 `@deepseek-ai/*` 按同一目标应用解析。
 *
 * @returns {{ names: Set<string>, hasDefault: boolean } | null} null 表示目标应用并不提供该模块。
 */
function resolveTargetFace(host, specifier) {
  const names = new Set();
  let hasDefault = false;
  let found = false;
  const seen = new Set();
  const queue = [{ specifier, baseDir: null }];

  while (queue.length > 0) {
    const current = queue.shift();
    let source;
    let relativePath = null;
    let packageName;
    if (current.baseDir !== null) {
      packageName = current.packageName;
      relativePath = current.baseDir;
      source = host.readPackageFile(packageName, relativePath);
    } else {
      ({ packageName } = splitSpecifier(current.specifier));
      const { subpath } = splitSpecifier(current.specifier);
      relativePath = host.entryFile(packageName, subpath);
      source = relativePath === null ? null : host.readPackageFile(packageName, relativePath);
    }
    if (source === null) continue;
    const key = `${packageName}:${relativePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found = true;

    const parsed = parseExportStatements(source);
    for (const name of parsed.names) names.add(name);
    if (parsed.hasDefault) hasDefault = true;

    const dir = dirname(relativePath);
    for (const target of parsed.reexports) {
      if (target.startsWith('.')) {
        const joined = join(dir, target).split(sep).join('/');
        for (const candidate of [joined, `${joined}.js`, `${joined}/index.js`]) {
          if (host.readPackageFile(packageName, candidate) !== null) {
            queue.push({ baseDir: candidate, packageName });
            break;
          }
        }
      } else if (target.startsWith(HOST_PACKAGE_PREFIX)) {
        queue.push({ specifier: target, baseDir: null });
      }
    }
  }

  return found ? { names, hasDefault } : null;
}

// ---------------------------------------------------------------- 最小替身（按目标代际投影）

function schemaNodeSource(indent) {
  return [
    `${indent}function makeSchemaNode() {`,
    `${indent}  const fn = (...args) => makeSchemaNode();`,
    `${indent}  fn.default = () => fn;`,
    `${indent}  fn.description = () => fn;`,
    `${indent}  fn.min = () => fn;`,
    `${indent}  fn.max = () => fn;`,
    `${indent}  fn.step = () => fn;`,
    `${indent}  fn.role = () => fn;`,
    `${indent}  fn.hidden = () => fn;`,
    `${indent}  return fn;`,
    `${indent}}`,
  ].join('\n');
}

/** 已知宿主面的最小签名实现；未列入的具名导出退化为无副作用函数（只保签名）。 */
function stubImplementationSource(name) {
  switch (name) {
    case 'defineTool':
      return 'defineToolImpl';
    case 'Schema':
    case 'z':
      return 'new Proxy(makeSchemaNode(), { get: (target, prop) => (prop in target ? target[prop] : makeSchemaNode()) })';
    case 'createUserMessage':
    case 'createAssistantMessage':
    case 'createSystemMessage':
    case 'createMessage':
    case 'createToolResultMessage':
      return '(options) => options';
    case 'installSettingsSection':
      return '(...args) => () => {}';
    case 'settingsNamespace':
      return '(name) => name';
    case 'dshHomePath':
    case 'dshProfilePath':
    case 'canonicalPath':
    case 'expandHomePath':
    case 'resolveDshHome':
      return '(...args) => String(args[0] ?? "")';
    case 'SessionId':
    case 'MessageId':
    case 'ToolCallId':
    case 'CallId':
    case 'AttachmentId':
    case 'ImageVariantId':
    case 'LlmAttemptId':
    case 'ProviderRequestId':
    case 'ReasoningEffortId':
      return '(id) => id';
    default:
      break;
  }
  if (/Error$/.test(name)) return `class ${name} extends Error {}`;
  return `function ${name}() {}`;
}

/**
 * 生成替身模块源码：具名导出面**完全等于**目标应用自带副本的导出面，
 * 不额外制造任何目标代际没有的名字。
 */
function buildStubSource(face) {
  const lines = [
    'export function defineToolImpl(options) {',
    '  const output = options && options.output ? options.output : {};',
    '  return {',
    '    name: options && options.name,',
    '    description: options && options.description,',
    '    parameters: options && options.parameters,',
    '    output: {',
    '      schema: output.schema,',
    '      render: typeof output.render === "function" ? output.render : () => "",',
    '    },',
    '  };',
    '}',
    schemaNodeSource(''),
  ];
  for (const name of [...face.names].sort()) {
    lines.push(`export const ${name} = ${stubImplementationSource(name)};`);
  }
  if (face.hasDefault) {
    const entries = [...face.names].sort().map((name) => `${name}: ${name}`).join(', ');
    lines.push(`const stubNamespace = { ${entries} };`);
    lines.push('export default new Proxy(stubNamespace, { get: (target, prop) => (prop in target ? target[prop] : makeSchemaNode()) });');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- 真实解析审计

/** 从 Profile 目录向上，收集 Node 真实解析会命中的 `@deepseek-ai/*` 包（就近优先）。 */
function collectResolvableHostPackages(profileRoot) {
  const found = new Map();
  let current = profileRoot;
  for (;;) {
    const scopeDir = join(current, 'node_modules', '@deepseek-ai');
    if (existsSync(scopeDir)) {
      let entries = [];
      try {
        entries = readdirSync(scopeDir);
      } catch {
        entries = [];
      }
      for (const name of entries) {
        if (name.startsWith('.')) continue;
        const packageName = `@deepseek-ai/${name}`;
        if (found.has(packageName)) continue;
        const pkg = readJsonFileSafe(join(scopeDir, name, 'package.json'));
        if (pkg && typeof pkg.version === 'string') {
          const located = join(scopeDir, name);
          let reported = located;
          try {
            reported = realpathSync(located);
          } catch {
            reported = located;
          }
          found.set(packageName, { version: pkg.version, path: reported });
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return found;
}

function readJsonFileSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 真实解析与目标代际一致性审计：只审「目标应用自带且版本等于目标代际」的宿主包，
 * 公共依赖（如 `@deepseek-ai/schemastery`）按各自版本走，不参与代际比对。
 */
function auditResolvableGenerations(profileRoot, host, targetGeneration) {
  const mismatches = [];
  for (const [packageName, resolved] of collectResolvableHostPackages(profileRoot)) {
    if (resolved.version === targetGeneration) continue;
    const appPkg = host.packageJson(packageName);
    if (!appPkg || appPkg.version !== targetGeneration) continue;
    mismatches.push({ packageName, expected: appPkg.version, actual: resolved.version, path: resolved.path });
  }
  return mismatches;
}

// ---------------------------------------------------------------- 替身注入

let hostStubHits = 0;
const stubbedSpecifiers = new Set();
const stubUrlCache = new Map();

function hostStubUrl(specifier) {
  if (stubUrlCache.has(specifier)) return stubUrlCache.get(specifier);
  const face = resolveTargetFace(targetHostPackages, specifier);
  if (face === null) {
    throw new Error(
      `宿主包 ${specifier} 既无法从 Profile 真实解析，目标应用 ${targetAppPath} 也不提供它`
      + `（目标代际 ${targetGeneration}）。预检不会为该模块制造替身。`,
    );
  }
  const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(buildStubSource(face))}`;
  stubUrlCache.set(specifier, url);
  return url;
}

function installHostPackageStub() {
  if (typeof nodeModule.registerHooks !== 'function') {
    console.warn('⚠ [Pre-flight] 当前 Node 不支持 module.registerHooks，宿主包缺失的插件仍会加载失败');
    return;
  }
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      let resolved = null;
      let notFound = null;
      try {
        resolved = nextResolve(specifier, context);
      } catch (error) {
        notFound = error;
      }
      if (resolved) {
        if (typeof specifier === 'string' && specifier.startsWith(HOST_PACKAGE_PREFIX)) {
          assertResolvedGeneration(specifier, resolved.url);
        }
        return resolved;
      }
      if (typeof specifier === 'string'
        && specifier.startsWith(HOST_PACKAGE_PREFIX)
        && notFound?.code === 'ERR_MODULE_NOT_FOUND') {
        hostStubHits += 1;
        stubbedSpecifiers.add(specifier);
        return { url: hostStubUrl(specifier), shortCircuit: true };
      }
      throw notFound;
    },
  });
}

/** 真实解析命中的宿主包若与目标代际不一致，就地指名失败（覆盖农场以外的解析路径）。 */
function assertResolvedGeneration(specifier, resolvedUrl) {
  if (!resolvedUrl.startsWith('file:')) return;
  const { packageName } = splitSpecifier(specifier);
  const appPkg = targetHostPackages.packageJson(packageName);
  if (!appPkg || appPkg.version !== targetGeneration) return;
  let dir = dirname(resolvedUrl.slice('file://'.length));
  for (;;) {
    const pkg = readJsonFileSafe(join(dir, 'package.json'));
    if (pkg && pkg.name === packageName) {
      if (pkg.version !== targetGeneration) {
        fail(`宿主包代际不一致: ${packageName} 期望 ${targetGeneration}（目标应用 ${targetAppPath} 声明），`
          + `实际 ${pkg.version}（真实解析到 ${dir}）。预检不会用替身掩盖该差异。`);
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

// ---------------------------------------------------------------- 入口

const rawArgs = process.argv.slice(2);
let explicitApp = process.env[TARGET_APP_ENV] || null;
let profileArg = null;
for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--app') {
    explicitApp = rawArgs[index + 1] || null;
    index += 1;
  } else if (arg.startsWith('--app=')) {
    explicitApp = arg.slice('--app='.length);
  } else if (profileArg === null) {
    profileArg = arg;
  }
}

const targetProfile = profileArg ? resolve(profileArg) : null;

if (!targetProfile || !existsSync(targetProfile)) {
  console.error(`❌ [Pre-flight] 目标 Profile 目录不存在: ${targetProfile}`);
  process.exit(1);
}

const targetAppPath = resolveTargetApp(targetProfile, explicitApp);
if (!targetAppPath) {
  fail(`无法确定被物化目标应用: Profile ${targetProfile} 不是 <home>/profiles/<name> 形态，`
    + `或 <home> 不是 ${[...TARGET_APP_BY_HOME_NAME.keys()].join(' / ')}。`
    + `请用 --app <应用路径> 或 ${TARGET_APP_ENV} 显式指定。预检不会退回最小替身。`);
}
if (!existsSync(targetAppPath)) {
  fail(`目标应用不存在: ${targetAppPath}（Profile ${targetProfile} 对应的物化目标）。`);
}

const targetHostPackages = new TargetHostPackages(targetAppPath);
const targetGeneration = readTargetGeneration(targetAppPath, targetHostPackages);

const pkgPath = join(targetProfile, 'package.json');
if (!existsSync(pkgPath)) {
  console.error(`❌ [Pre-flight] 目标 Profile 缺少 package.json: ${pkgPath}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const plugins = Object.keys(pkg.dependencies || {}).filter((k) => k.startsWith('omnimux'));

console.log(`\n🚀 [Pre-flight] 启动 Profile 物化演练校验: ${targetProfile}`);
console.log(`ℹ 物化目标应用: ${targetAppPath}（声明宿主代际 ${targetGeneration}）`);
console.log(`ℹ 检测到待预检物化插件 (${plugins.length} 个): ${plugins.join(', ')}`);

const generationMismatches = auditResolvableGenerations(targetProfile, targetHostPackages, targetGeneration);
if (generationMismatches.length > 0) {
  console.error(`❌ [Pre-flight] 宿主包代际与目标应用不一致，已阻断物化（目标应用 ${targetAppPath} 声明 ${targetGeneration}）:`);
  for (const mismatch of generationMismatches.slice(0, 10)) {
    console.error(`  ✖ ${mismatch.packageName}: 期望代际 ${mismatch.expected}，实际代际 ${mismatch.actual}（解析到 ${mismatch.path}）`);
  }
  if (generationMismatches.length > 10) {
    console.error(`  … 另有 ${generationMismatches.length - 10} 个同源不一致（同一解析树，非逐个列举）`);
  }
  console.error('  处理：把该解析树（如 Dev profile 的宿主包软链农场）指向与目标应用同代际的副本，或改用目标应用自带副本。');
  process.exit(1);
}

installHostPackageStub();

let totalErrors = 0;
let totalToolsVerified = 0;

for (const name of plugins) {
  const pluginDir = join(targetProfile, 'node_modules', name);
  if (!existsSync(pluginDir)) {
    console.error(`❌ [Pre-flight] 插件已在 dependencies 声明但未在 node_modules 物化: ${name}`);
    totalErrors++;
    continue;
  }

  const pPkgPath = join(pluginDir, 'package.json');
  if (!existsSync(pPkgPath)) {
    console.error(`❌ [Pre-flight] 插件缺少 package.json: ${name}`);
    totalErrors++;
    continue;
  }

  const pPkg = JSON.parse(readFileSync(pPkgPath, 'utf8'));
  const entry = pPkg.main || 'index.js';
  const entryPath = resolve(pluginDir, entry);
  if (!existsSync(entryPath)) {
    console.error(`❌ [Pre-flight] 插件入口文件缺失: ${name} → ${entry}`);
    totalErrors++;
    continue;
  }

  try {
    const mod = await import(pathToFileURL(entryPath).href);
    if (typeof mod.apply === 'function') {
      const registeredTools = [];
      const makeCtx = () => {
        const c = {
          tools: {
            register: (tool) => {
              if (!tool || typeof tool !== 'object') {
                throw new TypeError(`[${name}] tool register payload must be an object`);
              }
              if (!tool.name || typeof tool.name !== 'string') {
                throw new TypeError(`[${name}] tool must declare a non-empty name`);
              }
              if (!tool.output || typeof tool.output !== 'object' || typeof tool.output.render !== 'function') {
                throw new TypeError(
                  `[${name}] tool "${tool.name}" must declare output { schema, render, presentationMeta? }`,
                );
              }
              registeredTools.push(tool.name);
            },
            get: () => null,
            has: () => false,
          },
          inject: (deps, cb) => {
            try {
              const innerCtx = makeCtx();
              cb(innerCtx);
            } catch (err) {
              throw err;
            }
          },
          effect: (cb) => {
            try { cb(); } catch {}
          },
          provide: () => {},
          // 插件在 apply 阶段直接使用的上下文面：演练只调用 apply(ctx)，
          // 因此只给签名与安全空值（订阅返回解绑函数、广播与日志无操作、服务为鸭子对象）。
          logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
          fs: {
            resolve: async (path) => path,
            stat: async () => ({ size: 0, version: '0', isFile: true, isDirectory: false }),
            readBytes: async () => new Uint8Array(0),
            processPath: (path) => path,
          },
          on: () => () => {},
          once: () => () => {},
          off: () => {},
          emit: () => {},
          agents: { get: () => null, list: () => [] },
          connection: { get: () => null, list: () => [] },
          textComplete: { complete: async () => '' },
          workspaceRegistry: { get: () => null, list: () => [] },
          plugin: () => {},
          loader: { import: async () => ({ apply: () => {} }) },
          clientModules: { graph: () => ({ entries: [] }) },
          webServer: { get: () => {}, use: () => {}, post: () => {}, register: () => {} },
          betterSidebar: { registerFileViewer: () => () => {}, openTab: () => {} },
          commands: { register: () => () => {} },
          systemPrompt: { section: () => () => {} },
          settings: { register: () => () => {} },
          omnimux: {},
          get: (s) => c[s] || ({ register: () => {}, get: () => {}, use: () => {}, graph: () => ({ entries: [] }), section: () => {} }),
        };
        return c;
      };

      const ctx = makeCtx();
      mod.apply(ctx, { apiBase: 'http://localhost' });
      totalToolsVerified += registeredTools.length;
      console.log(`  ✔ [${name}] apply(ctx) 演练成功 (注册 ${registeredTools.length} 个合规工具)`);
    } else {
      console.log(`  ✔ [${name}] 模块加载正常 (未导出 apply 方法)`);
    }
  } catch (err) {
    totalErrors++;
    console.error(`  ✖ [${name}] 启动预检演练失败:`, err.message || err);
  }
}

const stubNote = hostStubHits > 0
  ? `；其中 ${hostStubHits} 次宿主包解析使用最小替身（仅保签名，导出面取自目标代际 ${targetGeneration}：${[...stubbedSpecifiers].sort().join(', ')}）`
  : '';

if (totalErrors > 0) {
  console.error(`\n❌ [Pre-flight] 物化演练预检失败: 发现 ${totalErrors} 个异常！已阻断提交并触发回滚${stubNote}。`);
  process.exit(1);
}

console.log(`\n✔ [Pre-flight] 物化演练预检 100% 通过: 全部 ${plugins.length} 个插件加载正常，共核验 ${totalToolsVerified} 个工具契约${stubNote}`);
process.exit(0);
