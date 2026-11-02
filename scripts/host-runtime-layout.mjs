import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readAsarHeader } from './lib/asar-integrity-engine.mjs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseAllDocuments, stringify } from 'yaml';

/**
 * 宿主安装布局解析 + 隔离 profile 的 agent-preset 声明合成。
 *
 * 背景（Issue #3871）：桌面壳从 `asar: smartUnpack` 改成 `asar: false` 后，脚本入口从
 * `Contents/Resources/app.asar/lib/desktop-cli.js` 变成 `Contents/Resources/app/lib/desktop-cli.js`。
 * 验收链路里凡是写死 `app.asar` 的地方都会在新型 App 上直接失败，因此把「布局」收敛成
 * 一处探测，并让 appAnchor 推导跟着实际布局走。
 *
 * 同一代际变化还有第二个后果：壳启动时会向 profile 注入 `@deepseek-ai/dsh-agent-preset`
 * 声明行，而隔离启动走 `desktop-cli.js` 绕过了壳，于是新建会话报 `agent-preset/not-found`。
 * 这里按壳的同一套规则（跳过上游已声明 id、丢弃无法解析的包行、裁剪 rc.3 拒绝字段）
 * 合成等价声明，只写一次性隔离 profile。
 */

/** 宿主 App 包名（固定安装位置，与既有脚本一致）。 */
export const DEV_APP_BUNDLE = '/Applications/OmniMux Dev.app';

/** 两种打包布局的入口相对路径；探测顺序：asar:false 优先，旧 asar 回退。 */
const WRAPPER_CANDIDATES = Object.freeze([
  'Contents/Resources/app/lib/desktop-cli.js',
  'Contents/Resources/app.asar/lib/desktop-cli.js',
]);

const PRESET_DECLARATION_PACKAGE = '@deepseek-ai/dsh-agent-preset';
const PRESET_ROW_ID_PREFIX = 'omnimux-preset-';
const PRESET_ROOT = 'preset/agent-presets';
const UPSTREAM_PRESET_DIR = 'node_modules/@deepseek-ai/dsh-web-app/presets';
/** rc.3 内核会直接抛错的字段：一个字段炸掉整个 preset，所以合成就先裁掉。 */
const REJECTED_SUBAGENT_FIELDS = ['persona', 'toolFilter'];

const isDirectory = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/**
 * 读 asar 归档的目录表（header 里的 JSON 文件树）。
 *
 * `app.asar` 是单个归档文件：普通 Node 对它 `readdirSync` 必 `ENOTDIR`，
 * Electron 里才被当作目录。判据因此不能靠目录 API，只能读归档目录表。
 * @param {string} archivePath
 * @returns {object} 归档文件树（`files` 嵌套结构）
 */
export function readAsarTree(archivePath) {
  const header = readAsarHeader(archivePath);
  let tree;
  try {
    tree = JSON.parse(header.toString('utf8'));
  } catch (error) {
    throw Object.assign(new Error(`asar 目录表不是合法 JSON：${archivePath}`), { code: 'ASAR_HEADER_INVALID', cause: error });
  }
  if (!tree || typeof tree !== 'object' || !tree.files || typeof tree.files !== 'object') {
    throw Object.assign(new Error(`asar 目录表缺少 files 根节点：${archivePath}`), { code: 'ASAR_HEADER_INVALID' });
  }
  return tree;
}

/**
 * 在归档文件树里按路径查节点。
 * @param {object} tree `readAsarTree` 的返回值
 * @param {string} relativePath 例如 `preset/agent-presets`
 * @returns {object|null}
 */
export function asarEntry(tree, relativePath) {
  let node = tree;
  for (const part of relativePath.split('/')) {
    const files = node && typeof node === 'object' ? node.files : undefined;
    if (!files || typeof files !== 'object' || !Object.hasOwn(files, part)) return null;
    node = files[part];
  }
  return node ?? null;
}

/**
 * 归档布局是否真的可用。
 *
 * 判据是「归档目录表里有非空的 `preset/agent-presets`」——这正是隔离 profile
 * 需要的唯一东西。归档缺失/损坏/没有该目录都返回 false，让上层响亮报
 * `RUNTIME_MISSING`，而不是给一个「可用但下游全空」的布局。
 */
function probeArchive(io, archive) {
  if (typeof io.existsSync !== 'function') {
    throw new TypeError('resolveHostRuntimeLayout: io.existsSync is required to probe an asar layout');
  }
  if (!io.existsSync(archive)) return { available: false, reason: 'archive-missing' };
  // 注入 io 必须自带解析能力：回落模块内实现等于绕过注入方，读的是真实 fs。
  const readTree = io.readAsarTree;
  if (typeof readTree !== 'function') {
    throw new TypeError('resolveHostRuntimeLayout: io.readAsarTree is required to probe an asar layout');
  }
  let tree;
  try {
    tree = readTree(archive);
  } catch (error) {
    // 带原因返回：上层能区分「没装」与「归档坏了」。
    return { available: false, reason: error?.code ?? 'asar-unreadable', message: error?.message ?? String(error) };
  }
  const presets = asarEntry(tree, 'preset/agent-presets');
  if (!presets || !presets.files || Object.keys(presets.files).length === 0) {
    return { available: false, reason: 'preset-root-missing' };
  }
  // 「可用」还要求脚本入口真的在归档里：只有 preset 而没有 desktop-cli 的归档
  // 判为可用会让下游在启动阶段才失败。
  if (!asarEntry(tree, 'lib/desktop-cli.js')) {
    return { available: false, reason: 'wrapper-missing-in-archive' };
  }
  // 与 resolvePresetRoot 同口径：归档内 preset 内容普通 Node 读不到，实际要靠
  // 旁边的 app.asar.unpacked。没有 unpacked 就判不可用，别把错误推迟到下游。
  // 判据同样走注入 io，不直接读真实 fs（与上面的约定一致）。
  const unpackedPresetRoot = join(dirname(archive), `${basename(archive)}.unpacked`, PRESET_ROOT);
  const unpackedProbe = io.isDirectory ?? isDirectory;
  if (unpackedProbe(unpackedPresetRoot) !== true) {
    return { available: false, reason: 'preset-content-not-unpacked' };
  }
  return { available: true, reason: null };
}

/**
 * 探测宿主安装布局。
 * @param {{ bundle?: string }} [options]
 * @returns {{ bundle: string, executable: string, wrapper: string, appRoot: string, layout: 'app' | 'app.asar', candidates: string[] }}
 */
export function resolveHostRuntimeLayout(options = {}) {
  const bundle = options.bundle ?? DEV_APP_BUNDLE;
  const resources = join(bundle, 'Contents/Resources');
  const candidates = WRAPPER_CANDIDATES.map((relative) => join(bundle, relative));
  // 调用方可以注入 fs（测试用 stub）：验收脚本本身走真实 fs，测试不依赖本机装没装 App。
  const io = options.io ?? { statSync, readdirSync, existsSync, readAsarTree };
  const probe = (path) => {
    // 探测能力缺失是调用方错误，不是「布局可用」的证据：显式报错，别静默当成存在。
    if (typeof io.statSync !== 'function') {
      throw new TypeError('resolveHostRuntimeLayout: io.statSync is required to probe the host layout');
    }
    try {
      return io.statSync(path).isFile();
    } catch {
      return false;
    }
  };
  /**
   * 两种布局的判据不同：
   * - `Resources/app` 是目录，脚本入口是真实文件，按文件探测；
   * - `Resources/app.asar` 是单个归档文件，入口在归档内部，stat 内部路径只会得到
   *   `ENOENT`/`ENOTDIR`。这里按归档本身是否为文件判定，路径仍交给 Electron 去读。
   */
  const modernWrapper = join(resources, 'app', 'lib', 'desktop-cli.js');
  const legacyArchive = join(resources, 'app.asar');
  let wrapper;
  let archiveProbe = null;
  if (probe(modernWrapper)) wrapper = modernWrapper;
  else {
    archiveProbe = probeArchive(io, legacyArchive);
    if (archiveProbe.available) wrapper = join(legacyArchive, 'lib', 'desktop-cli.js');
  }
  if (!wrapper) {
    const error = new Error(`TEST_ENV_RUNTIME_MISSING: 宿主 App 缺少 desktop-cli 入口：${candidates.join(' / ')}`);
    error.code = 'TEST_ENV_RUNTIME_MISSING';
    error.hint = `候选入口都不存在：${candidates.join(' / ')}`
      + (archiveProbe ? `；归档探测原因 ${archiveProbe.reason}${archiveProbe.message ? `（${archiveProbe.message}）` : ''}` : '');
    error.detail = { candidates, legacyArchive, archiveProbe };
    throw error;
  }
  const appRoot = dirname(dirname(wrapper));
  return {
    bundle,
    executable: join(bundle, 'Contents/MacOS/OmniMux'),
    wrapper,
    appRoot,
    layout: basename(appRoot) === 'app.asar' ? 'app.asar' : 'app',
    candidates,
  };
}

/**
 * 默认布局（`asar: false`）：不探测文件系统，供单测 stub 与文档引用使用。
 * @param {{ bundle?: string }} [options]
 */
export function defaultHostLayout(options = {}) {
  const bundle = options.bundle ?? DEV_APP_BUNDLE;
  const wrapper = join(bundle, WRAPPER_CANDIDATES[0]);
  const appRoot = dirname(dirname(wrapper));
  return { bundle, executable: join(bundle, 'Contents/MacOS/OmniMux'), wrapper, appRoot, layout: 'app', candidates: WRAPPER_CANDIDATES.map((relative) => join(bundle, relative)) };
}

/**
 * 宿主包锚点：`<Resources>/<app|app.asar>/node_modules/@deepseek-ai/dsh/package.json`。
 * @param {string} wrapper desktop-cli 入口绝对路径
 */
export function appAnchorFor(wrapper) {
  return resolve(dirname(wrapper), '..', 'node_modules/@deepseek-ai/dsh/package.json');
}

/** 该布局下宿主包实际所在根目录（用于「peer 是否解析在宿主内」这类判断）。 */
export function appPackageRootFor(wrapper) {
  return dirname(appAnchorFor(wrapper));
}

/** Loader 的 `!!js` 标签：解析时保留为数据，序列化时原样写回。 */
const loaderJsTag = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value) => ({ __jsExpr: value }),
  identify: (value) => value !== null && typeof value === 'object' && Object.hasOwn(value, '__jsExpr'),
  // yaml v2 传给 stringify 的是 Scalar 节点，表达式在 `node.value.__jsExpr`；
  // 早期实现直接读 `item.__jsExpr`，结果把 68 处平台条件写成 `!!js undefined`。
  // 表达式按「双引号标量」写回：裸字符串会被 yaml 当 plain scalar，含 `#`、`: `、
  // 行首 `-`/`!`/`&` 或多行时会截断或直接抛错。双引号能安全承载任意表达式文本。
  stringify: (item) => JSON.stringify(item?.value?.__jsExpr ?? item?.__jsExpr ?? ''),
};

/** 读一份 YAML/JSON 文档，保留 loader 的 `!!js` 表达式。 */
export function readStructuredFile(path) {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) return JSON.parse(text);
  const [document] = parseAllDocuments(text, { customTags: [loaderJsTag] });
  if (!document || document.errors.length) throw new Error(`cannot parse ${path}: ${document?.errors?.[0]?.message ?? 'empty'}`);
  return document.toJS();
}

/** 把合成结果写回 YAML（`!!js` 表达式保持为 loader 可求值形态）。 */
export function stringifyStructuredFile(value) {
  return stringify(value, { customTags: [loaderJsTag] });
}

/**
 * 裁剪 rc.3 会拒绝的 subagent 字段；返回新数组，不改原对象。
 *
 * 壳的实现（宿主 `profile-*.js` 的 `reduceSubagentRow`）会**递归进 `config` 数组**：
 * 预设里的 `delegation` 组内嵌了多条 `tool-subagent` 行，只裁顶层会让这些行带着
 * `persona` 交给 rc.3 内核，内核直接 throw，整个预设被标 broken。
 */
export function pruneRejectedFields(plugins) {
  let reduced = false;

  const pruneRow = (row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    let next = row;
    const config = row.config;
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      let removedField = false;
      const cleaned = { ...config };
      if (next.name === '@deepseek-ai/dsh-tool-subagent') {
        for (const field of REJECTED_SUBAGENT_FIELDS) {
          if (Object.hasOwn(cleaned, field)) {
            delete cleaned[field];
            removedField = true;
            reduced = true;
          }
        }
      }
      // 没有真删字段就先不复制，保持「无改动返回同一引用」的语义。
      if (removedField) next = { ...next, config: cleaned };
    }
    // 递归：`cordis:group` 的 config 本身可能就是行数组（preset 的 delegation 组就是这样）。
    const configAfter = next.config;
    if (Array.isArray(configAfter)) {
      const prunedArray = pruneRows(configAfter);
      if (prunedArray !== configAfter) next = { ...next, config: prunedArray };
    } else if (configAfter && typeof configAfter === 'object') {
      let changed = false;
      const nested = { ...configAfter };
      for (const [key, value] of Object.entries(configAfter)) {
        if (!Array.isArray(value)) continue;
        const prunedArray = pruneRows(value);
        if (prunedArray !== value) {
          nested[key] = prunedArray;
          changed = true;
        }
      }
      if (changed) next = { ...next, config: nested };
    }
    return next;
  };

  const pruneRows = (rows) => {
    let changed = false;
    const next = rows.map((row) => {
      const pruned = pruneRow(row);
      if (pruned !== row) changed = true;
      return pruned;
    });
    return changed ? next : rows;
  };

  if (!Array.isArray(plugins)) return { plugins: [], reduced: false };
  const next = pruneRows(plugins);
  return { plugins: next, reduced };
}

/**
 * 丢弃宿主解析不到的包行（例如为别的 harness 版本写的 preset）。
 *
 * `cordis:` 前缀是 Loader 的内建别名（`cordis:group` 等），不是 npm 包名，
 * 解析器当然解析不到，必须放过，否则整个预设会被误删。
 */
export function pruneUnresolvable(plugins, resolvable) {
  const dropped = [];
  const kept = [];
  for (const row of pruneRows(Array.isArray(plugins) ? plugins : [], resolvable, dropped)) kept.push(row);
  return { plugins: kept, dropped };
}

/** 递归遍历行数组：`cordis:group` 的 config 里还挂着同构行，壳也是递归处理的。 */
function pruneRows(rows, resolvable, dropped) {
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const name = row.name;
    const needsResolution = typeof name === 'string' && name.startsWith('@');
    if (needsResolution && typeof resolvable === 'function' && !resolvable(name)) {
      dropped.push(name);
      return PRUNE_DROP;
    }
    const config = row.config;
    if (Array.isArray(config)) {
      const pruned = pruneRows(config, resolvable, dropped);
      if (pruned !== config) return { ...row, config: pruned };
    } else if (config && typeof config === 'object') {
      let changed = false;
      const nested = { ...config };
      for (const [key, value] of Object.entries(config)) {
        if (!Array.isArray(value)) continue;
        const pruned = pruneRows(value, resolvable, dropped);
        if (pruned !== value) { nested[key] = pruned; changed = true; }
      }
      if (changed) return { ...row, config: nested };
    }
    return row;
  }).filter((row) => row !== PRUNE_DROP);
}

/** 哨兵：被丢弃的行（filter 阶段剔除）。 */
const PRUNE_DROP = Symbol('prune-drop');



/** 上游 bundle 已经声明过的 preset id：重复声明会让 Loader 直接拒绝启动。 */
export function upstreamPresetIds(appRoot, options = {}) {
  const directory = options.directory ?? resolveUnpackedPath(appRoot, UPSTREAM_PRESET_DIR);
  const ids = new Set();
  if (!directory || !isDirectory(directory)) return ids;
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.patch.yml') && !entry.endsWith('.patch.yaml')) continue;
    let document;
    try {
      document = readStructuredFile(join(directory, entry));
    } catch {
      continue;
    }
    if (!Array.isArray(document)) continue;
    for (const patch of document) {
      const insert = patch && typeof patch === 'object' ? patch.insert : undefined;
      if (!Array.isArray(insert)) continue;
      for (const row of insert) {
        if (!row || typeof row !== 'object') continue;
        if (row.name !== PRESET_DECLARATION_PACKAGE) continue;
        const id = row.config && typeof row.config === 'object' ? row.config.id : undefined;
        if (typeof id === 'string' && id.length > 0) ids.add(id);
      }
    }
  }
  return ids;
}

/**
 * 归档布局下判断某个包能否解析。
 *
 * 普通 Node 的 `createRequire('<app.asar>/lib/desktop-cli.js')` 读不到归档里的包，
 * 直接用它做 `resolvable` 会把 25 个 `@deepseek-ai/*` 行全当「解析不到」丢掉，
 * 合成出只剩空壳的 preset（评审阻断）。归档目录表里这些包是存在的，
 * 因此改为查目录表：`node_modules/<name>/package.json` 在即视为可解析。
 *
 * @param {object} tree `readAsarTree` 的返回值
 * @param {(name: string) => boolean} [fallback] 非 `@` 名字或目录表缺项时的兜底
 * @returns {(name: string) => boolean}
 */
export function archiveResolvable(tree, fallback) {
  return (name) => {
    if (typeof name !== 'string' || name.length === 0) return false;
    // 先按整名查（普通包名）。
    if (asarEntry(tree, `node_modules/${name}/package.json`)) return true;
    // 再按「包 + exports 子路径」查：`@scope/pkg/sub/path` 这类行在 app 布局下由
    // Node 的 exports 解析，归档目录表里没有对应 package.json。这里要求**子路径在
    // 归档里真的有对应文件**（exports 目标或同名路径），否则 `pkg/typo` 会被一律放行，
    // 比 app 布局的 Node resolver 更宽松（评审建议 4）。
    const parts = name.split('/');
    const packageName = name.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    if (packageName !== name) {
      // 子路径行（`@scope/pkg/sub`）：归档目录表里没有对应 package.json，
      // 但包目录存在时，允许在包内按「最后一段」找同名文件（exports 目标通常
      // 是 `lib/**/<last>.js`）。找不到就交给 fallback，避免把拼错的子路径放行。
      const pkgDir = `node_modules/${packageName}`;
      if (asarEntry(tree, `${pkgDir}/package.json`)) {
        const subpath = name.slice(packageName.length + 1);
        if (asarEntry(tree, `${pkgDir}/${subpath}`)) return true;
        const leaf = subpath.split('/').pop();
        if (leaf && asarEntry(tree, `${pkgDir}/lib/types/${leaf}.js`)) return true;
        if (leaf && asarEntry(tree, `${pkgDir}/lib/${leaf}.js`)) return true;
      }
    }
    return typeof fallback === 'function' ? fallback(name) : false;
  };
}

/**
 * 合成与壳等价的 preset 声明行。
 * @param {{ appRoot: string, resolvable?: (name: string) => boolean, presetRoot?: string, upstreamDirectory?: string }} options
 */
export function composeAgentPresetRows(options) {
  const presetRoot = resolvePresetRoot(options.appRoot, options.presetRoot);
  if (presetRoot === null) {
    return { rows: [], skippedPresetIds: [], droppedPackages: [], reducedPresetIds: [], unreadablePresetIds: [], unreadablePresetReasons: [] };
  }
  const upstream = upstreamPresetIds(options.appRoot, { directory: options.upstreamDirectory });
  const rows = [];
  const skippedPresetIds = [];
  const droppedPackages = [];
  const reducedPresetIds = [];
  const unreadablePresetIds = [];
  const unreadablePresetReasons = [];
  const ids = readdirSync(presetRoot)
    .filter((entry) => !entry.startsWith('.') && isDirectory(join(presetRoot, entry)))
    .sort();
  for (const id of ids) {
    if (upstream.has(id)) {
      skippedPresetIds.push(id);
      continue;
    }
    const cordisPath = join(presetRoot, id, 'agent.cordis.yml');
    let plugins;
    try {
      plugins = isFile(cordisPath) ? readStructuredFile(cordisPath) : undefined;
    } catch (error) {
      // 壳在同样情况下会抛错。这里不静默丢：记进诊断，由调用方决定是否响亮失败。
      unreadablePresetIds.push(id);
      unreadablePresetReasons.push(`${id}: ${error?.message ?? error}`);
      continue;
    }
    if (!Array.isArray(plugins)) {
      unreadablePresetIds.push(id);
      unreadablePresetReasons.push(`${id}: agent.cordis.yml 不是行数组`);
      continue;
    }
    const pruned = pruneUnresolvable(plugins, options.resolvable);
    droppedPackages.push(...pruned.dropped);
    const reduced = pruneRejectedFields(pruned.plugins);
    if (reduced.reduced) reducedPresetIds.push(id);
    const manifestPath = join(presetRoot, id, 'preset.yml');
    let manifest;
    try {
      manifest = isFile(manifestPath) ? readStructuredFile(manifestPath) : undefined;
    } catch {
      manifest = undefined;
    }
    const config = { id, plugins: reduced.plugins };
    for (const field of ['name', 'description', 'order']) {
      const value = manifest && typeof manifest === 'object' ? manifest[field] : undefined;
      if (value !== undefined) config[field] = value;
    }
    rows.push({ id: `${PRESET_ROW_ID_PREFIX}${id}`, name: PRESET_DECLARATION_PACKAGE, config });
  }
  return {
    rows,
    skippedPresetIds: [...new Set(skippedPresetIds)].sort(),
    droppedPackages: [...new Set(droppedPackages)].sort(),
    reducedPresetIds: [...new Set(reducedPresetIds)].sort(),
    unreadablePresetIds: [...new Set(unreadablePresetIds)].sort(),
    unreadablePresetReasons,
  };
}

/**
 * 解析预设根的实际可读位置。
 *
 * - `app` 布局：`<appRoot>/preset/agent-presets` 就是真实目录；
 * - `app.asar` 布局：归档内路径普通 Node 读不了，但 Electron 打包时把 preset 标成
 *   unpacked 的，内容就在 `<Resources>/app.asar.unpacked/preset/agent-presets`，可直接读。
 *
 * @param {string} appRoot
 * @param {string} [presetRoot]
 * @returns {string|null} 可读的预设根目录；读不到返回 null
 */
export function resolvePresetRoot(appRoot, presetRoot) {
  if (presetRoot !== undefined) return isDirectory(presetRoot) ? presetRoot : null;
  const direct = join(appRoot, PRESET_ROOT);
  if (isDirectory(direct)) return direct;
  // 归档布局：同名内容通常以 unpacked 形式落在归档旁边。
  const unpacked = join(appRoot, '..', `${basename(appRoot)}.unpacked`, PRESET_ROOT);
  return isDirectory(unpacked) ? unpacked : null;
}

/** 归档布局下把归档内路径映射到 unpacked 目录（存在才返回）。 */
export function resolveUnpackedPath(appRoot, relativePath) {
  const direct = join(appRoot, relativePath);
  if (isDirectory(direct)) return direct;
  const unpacked = join(appRoot, '..', `${basename(appRoot)}.unpacked`, relativePath);
  return isDirectory(unpacked) ? unpacked : null;
}

/** 是否存在可读的预设根目录（旧 App 没有这个目录时返回 false）。 */
export function hasShippedPresetRoot(appRoot, presetRoot) {
  return resolvePresetRoot(appRoot, presetRoot) !== null;
}
