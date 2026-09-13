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
 * streams, explicit tags, and flow collections spanning lines.
 *
 * Models write prose, and prose arrives as a block scalar (`description: |` with
 * the sentences indented under it) or as a one-line flow collection whose quoted
 * values carry their own colons. Both are read here; neither may turn a whole
 * report into a refusal.
 */

/** `1`, `-2.5`, `1e3` — a plain YAML number. */
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

/** `|`, `>`, `|-`, `>+`, `|2-` — the header that opens a block scalar. */
const BLOCK_HEADER = /^([|>])([-+]?\d*|\d*[-+]?)$/

/**
 * One logical line. A block scalar is folded into `literal` while the lines are
 * read, so the node parsers below only ever see a value they can take as-is.
 *
 * @typedef {{ indent: number, text: string, literal?: string }} YamlLine
 */

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
 * @param {string} line
 * @returns {number}
 */
function indentOf(line) {
  return line.length - line.replace(/^\s*/, '').length
}

/**
 * The value one line carries: what follows its `key:`, what follows its `-`,
 * else the line itself. A block-scalar header is spotted wherever it can sit.
 *
 * @param {string} text
 * @returns {string}
 */
function lineValue(text) {
  const entry = splitKey(text)
  if (entry) return entry.rest
  if (isSequenceItem(text)) return text.replace(/^-\s*/, '').trim()
  return text
}

/**
 * The block scalar a naked value opens (`|`, `>`, `|-`, `>+`, `|2-`…), or null
 * when the value is plain.
 *
 * @param {string} value
 * @returns {{ folded: boolean, chomp: 'clip' | 'strip' | 'keep', indent: number | null } | null}
 */
function blockScalarHeader(value) {
  const match = BLOCK_HEADER.exec(stripTrailingComment(String(value ?? '')))
  if (!match) return null
  const flags = match[2]
  // `+-` and `12` are not headers — refuse the shape rather than guess at it.
  if ((flags.match(/[+-]/g) ?? []).length > 1) return null
  if ((flags.match(/\d/g) ?? []).length > 1) return null
  const digit = flags.match(/\d/)
  return {
    folded: match[1] === '>',
    chomp: flags.includes('-') ? 'strip' : flags.includes('+') ? 'keep' : 'clip',
    indent: digit ? Number(digit[0]) : null,
  }
}

/**
 * Join the body rows of a block scalar, without its line-break chomping.
 *
 * @param {string[]} rows
 * @param {{ folded: boolean }} header
 * @returns {string}
 */
function joinBlock(rows, header) {
  if (!header.folded) return rows.join('\n')
  let out = ''
  for (const row of rows) {
    if (row === '') out += '\n'
    else if (out === '' || out.endsWith('\n')) out += row
    else out += ` ${row}`
  }
  return out
}

/**
 * The value of one block scalar body, following YAML's folding and chomping
 * rules for the styles a report uses.
 *
 * @param {string[]} rows body lines, already stripped of the content indent
 * @param {{ folded: boolean, chomp: 'clip' | 'strip' | 'keep' }} header
 * @returns {string}
 */
function foldBlockScalar(rows, header) {
  let end = rows.length
  while (end > 0 && rows[end - 1] === '') end -= 1
  if (header.chomp === 'keep') return rows.length === 0 ? '' : `${joinBlock(rows, header)}\n`
  const value = joinBlock(rows.slice(0, end), header)
  if (header.chomp === 'strip') return value
  // The default clip keeps exactly one trailing line break.
  return value === '' ? '' : `${value}\n`
}

/**
 * Consume the body of one block scalar, starting on the line after its header.
 *
 * @param {string[]} raw
 * @param {number} start
 * @param {number} headerIndent
 * @param {{ folded: boolean, chomp: 'clip' | 'strip' | 'keep', indent: number | null }} header
 * @returns {{ literal: string, next: number }} `next` is the first unconsumed line
 */
function readBlockScalar(raw, start, headerIndent, header) {
  let contentIndent = header.indent === null ? null : headerIndent + header.indent
  if (contentIndent === null) {
    for (let scan = start; scan < raw.length; scan += 1) {
      if (raw[scan].trim() === '') continue
      if (indentOf(raw[scan]) <= headerIndent) break
      contentIndent = indentOf(raw[scan])
      break
    }
  }
  // `key: |` with nothing indented under it is an empty value, not an error.
  if (contentIndent === null) return { literal: '', next: start }

  const rows = []
  let cursor = start
  while (cursor < raw.length) {
    const line = raw[cursor]
    if (line.trim() === '') {
      rows.push('')
      cursor += 1
      continue
    }
    // A line back at the outer indent ends the block.
    if (indentOf(line) < contentIndent) break
    rows.push(line.slice(contentIndent).replace(/\s+$/, ''))
    cursor += 1
  }
  return { literal: foldBlockScalar(rows, header), next: cursor }
}

/**
 * `[a, b]` / `{a: 1}` written on one line — the only flow shape the reader takes.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isFlowCollection(text) {
  const body = stripTrailingComment(text)
  if (body.length < 2) return false
  const first = body[0]
  const last = body[body.length - 1]
  return (first === '[' && last === ']') || (first === '{' && last === '}')
}

/**
 * @param {unknown} text
 * @returns {YamlLine[]}
 */
function toLines(text) {
  const raw = String(text ?? '').split(/\r?\n/)
  // The empty tail a trailing line break leaves behind is not a content line —
  // `|+` counts the breaks that are really there.
  if (raw.length > 1 && raw[raw.length - 1] === '') raw.pop()
  const out = []
  for (let index = 0; index < raw.length; index += 1) {
    const line = raw[index]
    const body = line.trim()
    if (!body) continue
    if (/^#/.test(body)) continue
    if (/^(?:---|\.\.\.)$/.test(body)) continue
    const indent = indentOf(line)
    const header = blockScalarHeader(lineValue(body))
    if (header) {
      const block = readBlockScalar(raw, index + 1, indent, header)
      // Blank lines and `#` lines inside the block are content, so the body is
      // folded here — after this, the rest of the reader sees one line.
      out.push({ indent, text: body, literal: block.literal })
      index = block.next - 1
      continue
    }
    out.push({ indent, text: body })
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
 * Split `key: value` on the first colon that ends a key: outside quotes, and
 * outside any inline collection, so `{title: "成本: 焦虑"}` keeps its value whole.
 *
 * @param {string} text
 * @returns {{ key: string, rest: string } | null}
 */
function splitKey(text) {
  let single = false
  let double = false
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (single || double) {
      if (char === '\\' && double) index += 1
      else if (char === "'" && single) single = false
      else if (char === '"' && double) double = false
      continue
    }
    if (char === "'") single = true
    else if (char === '"') double = true
    else if (char === '[' || char === '{') depth += 1
    else if (char === ']' || char === '}') depth -= 1
    else if (char === ':' && depth === 0) {
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
 * @param {YamlLine[]} lines
 * @param {number} index
 * @param {number} indent
 * @returns {[unknown, number]}
 */
function parseNode(lines, index, indent) {
  if (index >= lines.length) return [null, index]
  const line = lines[index]
  if (line.indent !== indent) {
    throw new YamlMiniError(`unexpected indentation at line ${String(index + 1)}`)
  }
  if (isSequenceItem(line.text)) return parseSequence(lines, index, indent)
  // A value written on its own line: one flow collection, or a block scalar.
  if (isFlowCollection(line.text)) return [parseScalar(line.text), index + 1]
  if (line.literal !== undefined && splitKey(line.text) === null) return [line.literal, index + 1]
  return parseMapping(lines, index, indent)
}

/**
 * @param {YamlLine[]} lines
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
      out.push(line.literal === undefined ? parseScalar(body) : line.literal)
      cursor += 1
      continue
    }
    // `- key: value` opens a map item. The item's remaining keys sit deeper than
    // the dash, at the column where the first key starts.
    const keyColumn = line.indent + (line.text.length - body.length)
    /** @type {YamlLine} */
    const head = { indent: keyColumn, text: body }
    if (line.literal !== undefined) head.literal = line.literal
    const collected = [head]
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
 * @param {YamlLine[]} lines
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
      out[entry.key] = line.literal === undefined ? parseScalar(entry.rest) : line.literal
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
