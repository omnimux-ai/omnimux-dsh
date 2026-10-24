/**
 * 预设 YAML 的仓库内解析器。
 *
 * `scripts/verify-agent-presets.test.mjs` 原先通过 `python3 -c "import yaml ..."` 解析预设，
 * 这要求本机 Python 装有三方库 PyYAML；而该测试不在 CI 清单里、CI 也不安装 PyYAML，
 * 于是本机 PATH 上的 `python3` 缺库时整片用例恒挂。
 *
 * 这里用仓库已直接依赖的 `yaml` 包提供等价解析，作为「本机没有 PyYAML」时的兜底；
 * Python 可用时仍走原路径，行为不变。
 */
import { spawnSync } from 'node:child_process'
import { parseAllDocuments } from 'yaml'

/**
 * `!js` 在预设里标记可执行 JS 片段。原 Python 实现的 SafeLoader 构造器把它解析成 False，
 * 这里保持一致，避免同一份 YAML 在两种实现下得到不同值。
 */
const JS_TAG = { tag: '!js', resolve: () => false }

/** 解析 YAML 文档序列；语法错误抛成 `<rel> yaml parse failed`。 */
export function parsePresetDocuments(rel, text) {
  const documents = parseAllDocuments(text, { customTags: [JS_TAG] })
  return documents.map(document => {
    const error = document.errors[0]
    if (error) throw new Error(`${rel} yaml parse failed:\n${error.message}`)
    return document.toJS()
  })
}

/** 行数口径：`docs[0]` 必须是序列，返回其长度（与原 Python `len(docs[0])` 一致）。 */
export function rowsFromText(rel, text) {
  const data = parsePresetDocuments(rel, text)[0]
  if (!Array.isArray(data)) throw new Error(`${rel} yaml parse failed: expected a sequence, got ${typeof data}`)
  return data.length
}

/** persona 行口径：恰好一行 `id: persona`，其 `config` 必须是映射。 */
export function personaConfigFromText(rel, text) {
  const data = parsePresetDocuments(rel, text)[0]
  if (!Array.isArray(data)) throw new Error(`${rel} persona config parse failed: expected a sequence, got ${typeof data}`)
  const rows = data.filter(row => row && typeof row === 'object' && row.id === 'persona')
  if (rows.length !== 1) throw new Error(`${rel} persona config parse failed: expected exactly one persona row, got ${rows.length}`)
  const cfg = rows[0].config
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new Error(`${rel} persona config parse failed: persona config must be a mapping, got ${cfg === null ? 'null' : typeof cfg}`)
  }
  const prefix = cfg.prefix
  return {
    keys: Object.keys(cfg).sort(),
    prefixIsString: typeof prefix === 'string',
    prefixLength: typeof prefix === 'string' ? prefix.length : 0,
    prefixPresent: Object.prototype.hasOwnProperty.call(cfg, 'prefix'),
    prefix,
  }
}

let pythonYamlCache = null

/** 本机 PATH 上的 `python3` 是否具备 PyYAML；只探测一次。 */
export function pythonYamlAvailable() {
  if (pythonYamlCache !== null) return pythonYamlCache
  const probe = spawnSync('python3', ['-c', 'import yaml'], { encoding: 'utf8' })
  pythonYamlCache = probe.status === 0
  return pythonYamlCache
}
