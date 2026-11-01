import { readdirSync, readFileSync, statSync } from 'node:fs';
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
 * 探测宿主安装布局。
 * @param {{ bundle?: string }} [options]
 * @returns {{ bundle: string, executable: string, wrapper: string, appRoot: string, layout: 'app' | 'app.asar', candidates: string[] }}
 */
export function resolveHostRuntimeLayout(options = {}) {
  const bundle = options.bundle ?? DEV_APP_BUNDLE;
  const candidates = WRAPPER_CANDIDATES.map((relative) => join(bundle, relative));
  // 调用方可以注入 fs（测试用 stub）：验收脚本本身走真实 fs，测试不依赖本机装没装 App。
  const io = options.io ?? { statSync };
  const isFile = (path) => {
    // 注入的 fs 可能只实现少量方法（单测 stub）：缺少探测能力时按默认布局放行，
    // 由后续 accessSync(executable) 与真实运行暴露缺件，而不是在这里静默失败。
    if (typeof io.statSync !== 'function') return true;
    try {
      return io.statSync(path).isFile();
    } catch {
      return false;
    }
  };
  const wrapper = candidates.find((path) => isFile(path));
  if (!wrapper) {
    const error = new Error(`TEST_ENV_RUNTIME_MISSING: 宿主 App 缺少 desktop-cli 入口：${candidates.join(' / ')}`);
    error.code = 'TEST_ENV_RUNTIME_MISSING';
    error.hint = `候选入口都不存在：${candidates.join(' / ')}`;
    error.detail = { candidates };
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
  stringify: (item) => item.__jsExpr,
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

/** 裁剪 rc.3 会拒绝的 subagent 字段；返回新数组，不改原对象。 */
export function pruneRejectedFields(plugins) {
  if (!Array.isArray(plugins)) return { plugins: [], reduced: false };
  let reduced = false;
  const next = plugins.map((row) => {
    if (!row || typeof row !== 'object') return row;
    if (row.name !== '@deepseek-ai/dsh-tool-subagent') return row;
    const config = row.config;
    if (!config || typeof config !== 'object') return row;
    const offending = REJECTED_SUBAGENT_FIELDS.filter((field) => Object.hasOwn(config, field));
    if (!offending.length) return row;
    reduced = true;
    const clean = { ...config };
    for (const field of offending) delete clean[field];
    return { ...row, config: clean };
  });
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
  for (const row of Array.isArray(plugins) ? plugins : []) {
    const name = row && typeof row === 'object' ? row.name : undefined;
    const loaderBuiltin = typeof name === 'string' && name.startsWith('cordis:');
    if (typeof name === 'string' && name.length > 0 && !loaderBuiltin && typeof resolvable === 'function' && !resolvable(name)) {
      dropped.push(name);
      continue;
    }
    kept.push(row);
  }
  return { plugins: kept, dropped };
}

/** 上游 bundle 已经声明过的 preset id：重复声明会让 Loader 直接拒绝启动。 */
export function upstreamPresetIds(appRoot, options = {}) {
  const directory = options.directory ?? join(appRoot, UPSTREAM_PRESET_DIR);
  const ids = new Set();
  if (!isDirectory(directory)) return ids;
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
 * 合成与壳等价的 preset 声明行。
 * @param {{ appRoot: string, resolvable?: (name: string) => boolean, presetRoot?: string, upstreamDirectory?: string }} options
 */
export function composeAgentPresetRows(options) {
  const presetRoot = options.presetRoot ?? join(options.appRoot, PRESET_ROOT);
  if (!isDirectory(presetRoot)) {
    return { rows: [], skippedPresetIds: [], droppedPackages: [], reducedPresetIds: [] };
  }
  const upstream = upstreamPresetIds(options.appRoot, { directory: options.upstreamDirectory });
  const rows = [];
  const skippedPresetIds = [];
  const droppedPackages = [];
  const reducedPresetIds = [];
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
    } catch {
      plugins = undefined;
    }
    if (!Array.isArray(plugins)) continue;
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
  };
}

/** 是否存在需要声明的预设根目录（旧 App 没有这个目录）。 */
export function hasShippedPresetRoot(appRoot, presetRoot) {
  return isDirectory(presetRoot ?? join(appRoot, PRESET_ROOT));
}
