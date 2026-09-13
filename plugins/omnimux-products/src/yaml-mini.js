/**
 * Minimal YAML reader for model-authored reports.
 *
 * The brand-strategy v2 playbook answers with one flat YAML document: nested
 * maps, scalar lists, and lists of maps. That is a small, fixed grammar, so this
 * module reads it directly instead of taking a runtime dependency on a full YAML
 * engine — the plugin stays self-contained, and nothing new has to be installed
 * into a user profile.
 *
 * The reader is strict on purpose: an input outside the supported subset throws
 * instead of being guessed at, so a half-read report can never be mistaken for a
 * complete one. Unsupported by design: anchors and aliases, multi-document
 * streams, explicit tags, block scalars, and flow collections spanning lines.
 */

/** `1`, `-2.5`, `1e3` — a plain YAML number. */
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

export class YamlMiniError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message)
    this.name = 'YamlMiniError'
  }
}

/**
 * Every fenced block in one answer, in document order. An unlabelled fence
 * counts as a candidate too — models often drop the language tag.
 *
 * @param {unknown} text
 * @returns {{ lang: string, body: string }[]}
 */
export function fencedBlocks(text) {
  const source = String(text ?? '')
  const pattern = /```([A-Za-z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g
  const out = []
  let match = pattern.exec(source)
  while (match) {
    const body = match[2].trim()
    if (body !== '') out.push({ lang: (match[1] || '').toLowerCase(), body })
    match = pattern.exec(source)
  }
  return out
}

/**
 * The body of the first fenced block labelled with one of `languages` (an
 * unlabelled fence is always accepted); when no label matches, the first fenced
 * block whatever its label; else the whole trimmed text.
 *
 * @param {unknown} text
 * @param {string[]} [languages]
 * @returns {string}
 */
export function stripCodeFence(text, languages = ['yaml', 'yml']) {
  const blocks = fencedBlocks(text)
  for (const block of blocks) {
    if (block.lang === '' || languages.includes(block.lang)) return block.body
  }
  if (blocks.length > 0) return blocks[0].body
  return String(text ?? '').trim()
}

/**
 * @param {unknown} text
 * @returns {{ indent: number, text: string }[]}
 */
function toLines(text) {
  const out = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (!raw.trim()) continue
    if (/^\s*#/.test(raw)) continue
    if (/^\s*(?:---|\.\.\.)\s*$/.test(raw)) continue
    const indent = raw.length - raw.replace(/^\s*/, '').length
    out.push({ indent, text: raw.trim() })
  }
  return out
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isSequenceItem(text) {
  return text === '-' || /^-\s/.test(text)
}

/**
 * Split `key: value` on the first unquoted colon that ends a key.
 *
 * @param {string} text
 * @returns {{ key: string, rest: string } | null}
 */
function splitKey(text) {
  let single = false
  let double = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === "'" && !double) single = !single
    else if (char === '"' && !single) double = !double
    else if (char === ':' && !single && !double) {
      const next = text[index + 1]
      if (next === undefined || next === ' ' || next === '\t') {
        return { key: unquoteKey(text.slice(0, index).trim()), rest: text.slice(index + 1).trim() }
      }
    }
  }
  return null
}

/**
 * @param {string} text
 * @returns {string}
 */
function unquoteKey(text) {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return unescapeDouble(text.slice(1, -1))
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'")
  return text
}

/**
 * @param {string} text
 * @returns {string}
 */
function unescapeDouble(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

/**
 * Split a flow sequence on its top-level commas.
 * @param {string} text
 * @returns {string[]}
 */
function splitFlow(text) {
  const rows = []
  let current = ''
  let quote = ''
  let depth = 0
  for (const char of String(text ?? '')) {
    if (quote) {
      current += char
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      rows.push(current)
      current = ''
      continue
    }
    current += char
  }
  rows.push(current)
  return rows.map((row) => row.trim()).filter((row) => row !== '')
}

/**
 * A trailing `# note` belongs to the reader, not to the value — but only when it
 * starts a word outside quotes, so `C#7` and `"a # b"` survive intact.
 * @param {string} text
 * @returns {string}
 */
function stripTrailingComment(text) {
  let quote = ''
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === '\\' && quote === '"') index += 1
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '#' && (index === 0 || /\s/.test(text[index - 1]))) return text.slice(0, index).trim()
  }
  return text.trim()
}

/**
 * @param {string} raw
 * @returns {unknown}
 */
function parseScalar(raw) {
  const text = stripTrailingComment(String(raw ?? ''))
  if (text === '') return null
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) return unescapeDouble(text.slice(1, -1))
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'")
  if (text.startsWith('[') && text.endsWith(']')) return splitFlow(text.slice(1, -1)).map((row) => parseScalar(row))
  if (text.startsWith('{') && text.endsWith('}')) {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const row of splitFlow(text.slice(1, -1))) {
      const entry = splitKey(row)
      if (!entry) continue
      out[entry.key] = entry.rest === '' ? null : parseScalar(entry.rest)
    }
    return out
  }
  const lower = text.toLowerCase()
  if (lower === 'null' || text === '~') return null
  if (lower === 'true') return true
  if (lower === 'false') return false
  if (NUMBER.test(text)) {
    const value = Number(text)
    if (Number.isFinite(value)) return value
  }
  return text
}

/**
 * @param {{ indent: number, text: string }[]} lines
 * @param {number} index
 * @param {number} indent
 * @returns {[unknown, number]}
 */
function parseNode(lines, index, indent) {
  if (index >= lines.length) return [null, index]
  if (lines[index].indent !== indent) {
    throw new YamlMiniError(`unexpected indentation at line ${String(index + 1)}`)
  }
  if (isSequenceItem(lines[index].text)) return parseSequence(lines, index, indent)
  return parseMapping(lines, index, indent)
}

/**
 * @param {{ indent: number, text: string }[]} lines
 * @param {number} index
 * @param {number} indent
 * @returns {[unknown[], number]}
 */
function parseSequence(lines, index, indent) {
  const out = []
  let cursor = index
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent < indent) break
    if (line.indent > indent) throw new YamlMiniError(`unexpected indentation inside a list at line ${String(cursor + 1)}`)
    if (!isSequenceItem(line.text)) break
    const body = line.text.replace(/^-\s*/, '').trim()
    if (body === '') {
      const next = lines[cursor + 1]
      if (next && next.indent > indent) {
        const [child, resume] = parseNode(lines, cursor + 1, next.indent)
        out.push(child)
        cursor = resume
        continue
      }
      out.push(null)
      cursor += 1
      continue
    }
    if (!splitKey(body)) {
      out.push(parseScalar(body))
      cursor += 1
      continue
    }
    // `- key: value` opens a map item. The item's remaining keys sit deeper than
    // the dash, at the column where the first key starts.
    const keyColumn = line.indent + (line.text.length - body.length)
    const collected = [{ indent: keyColumn, text: body }]
    let scan = cursor + 1
    while (scan < lines.length && lines[scan].indent > indent) {
      collected.push(lines[scan])
      scan += 1
    }
    const [child] = parseNode(collected, 0, keyColumn)
    out.push(child)
    cursor = scan
  }
  return [out, cursor]
}

/**
 * @param {{ indent: number, text: string }[]} lines
 * @param {number} index
 * @param {number} indent
 * @returns {[Record<string, unknown>, number]}
 */
function parseMapping(lines, index, indent) {
  /** @type {Record<string, unknown>} */
  const out = {}
  let cursor = index
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent < indent) break
    if (line.indent > indent) throw new YamlMiniError(`unexpected indentation inside a mapping at line ${String(cursor + 1)}`)
    if (isSequenceItem(line.text)) break
    const entry = splitKey(line.text)
    if (!entry) throw new YamlMiniError(`not a "key: value" line: ${line.text}`)
    if (entry.rest !== '') {
      out[entry.key] = parseScalar(entry.rest)
      cursor += 1
      continue
    }
    const next = lines[cursor + 1]
    if (next && next.indent > indent) {
      const [child, resume] = parseNode(lines, cursor + 1, next.indent)
      out[entry.key] = child
      cursor = resume
      continue
    }
    // YAML allows a block sequence to sit at the same indent as its own key.
    if (next && next.indent === indent && isSequenceItem(next.text)) {
      const [child, resume] = parseSequence(lines, cursor + 1, indent)
      out[entry.key] = child
      cursor = resume
      continue
    }
    out[entry.key] = null
    cursor += 1
  }
  return [out, cursor]
}

/**
 * Read one YAML document into plain JS values. Returns null for empty input.
 *
 * @param {unknown} text
 * @returns {unknown}
 * @throws {YamlMiniError} the input is outside the supported subset
 */
export function parseYamlMini(text) {
  const lines = toLines(text)
  if (lines.length === 0) return null
  const [value] = parseNode(lines, 0, lines[0].indent)
  return value
}
