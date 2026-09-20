/**
 * @file plugins/omnimux-market/src/expert-presets.ts
 * Agent Preset 落盘的唯一真源：专家市场的硬编码专家与技能市场套件包内的
 * `agents/*.md` 都写这一种形状，避免两处模板各自漂移。
 *
 * 目录名即 preset id，由官方 `@deepseek-ai/dsh-agent-presets` 发现；`preset.yml`
 * 只承载展示元数据（name/description/order），`agent.cordis.yml` 是组合清单。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AgentPresetSpec {
  id: string
  name: string
  description?: string
  order?: number
  persona: string
}

/** YAML 块标量的每一行都要缩进，否则多行 persona 会截断正文。 */
function indentBlock(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  const body = String(text ?? '').replace(/\s+$/, '')
  return body
    .split('\n')
    .map((line) => (line === '' ? '' : pad + line))
    .join('\n')
}

/** 一个 preset 的组合清单：persona + 指令文件发现 + 通用工具面。 */
export function agentPresetCordis(id: string, persona: string): string {
  return `# ${id} Agent Preset
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    prefix: |
${indentBlock(persona, 6)}
- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config:
    maxBytes: 65536
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
- id: tool-pwsh
  name: '@deepseek-ai/dsh-tool-pwsh'
  disabled: !!js process.platform !== 'win32'
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
  config:
    sampleOverCapGlobResults: false
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent
    modelSelectionSettings: true
    backgroundMode: continuable
- id: tool-subagent-fork
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
    toolName: subagent_fork
    backgroundMode: continuable
`
}

/** 写入 `<home>/.agent-presets/<id>/`，返回 preset 目录。 */
export function writeAgentPreset(home: string, preset: AgentPresetSpec): string {
  const dir = join(home, '.agent-presets', preset.id)
  mkdirSync(dir, { recursive: true })
  const presetYml = `name: ${preset.name}\ndescription: ${preset.description ?? ''}\norder: ${preset.order ?? 0}\n`
  writeFileSync(join(dir, 'preset.yml'), presetYml, 'utf8')
  writeFileSync(join(dir, 'agent.cordis.yml'), agentPresetCordis(preset.id, preset.persona), 'utf8')
  return dir
}

/**
 * 对存量 agent.cordis.yml 内容进行模式自愈：
 * 1. 修复缺少 sampleOverCapGlobResults 的 tool-fs-search 配置项（兼容无 config 或已有部分 config）；
 * 2. 修复缺少 provider 的 tool-subagent 配置项；
 * 3. 严格兼容 CRLF 与 LF 跨平台换行。
 */
export function healAgentPresetCordis(content: string): string {
  const isCrlf = content.includes('\r\n')
  const eol = isCrlf ? '\r\n' : '\n'
  const lines = content.replace(/\r\n/g, '\n').split('\n')

  const result: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^-\s+id:\s+tool-fs-search\b/.test(line)) {
      const block: string[] = [line]
      i++
      while (i < lines.length && !/^-\s+id:\s+/.test(lines[i])) {
        block.push(lines[i])
        i++
      }
      const blockText = block.join('\n')
      if (blockText.includes("'@deepseek-ai/dsh-tool-fs-search'") || blockText.includes('"@deepseek-ai/dsh-tool-fs-search"')) {
        if (!blockText.includes('sampleOverCapGlobResults')) {
          const configIndex = block.findIndex((l) => /^\s+config:\s*$/.test(l))
          if (configIndex >= 0) {
            block.splice(configIndex + 1, 0, '    sampleOverCapGlobResults: false')
          } else {
            block.push('  config:', '    sampleOverCapGlobResults: false')
          }
        }
      }
      result.push(...block)
      continue
    }

    if (/^-\s+id:\s+tool-subagent\b/.test(line)) {
      const block: string[] = [line]
      i++
      while (i < lines.length && !/^-\s+id:\s+/.test(lines[i])) {
        block.push(lines[i])
        i++
      }
      const blockText = block.join('\n')
      if (blockText.includes("'@deepseek-ai/dsh-tool-subagent'") || blockText.includes('"@deepseek-ai/dsh-tool-subagent"')) {
        if (!/^\s+provider:\s+/m.test(blockText)) {
          const configIndex = block.findIndex((l) => /^\s+config:\s*$/.test(l))
          if (configIndex >= 0) {
            block.splice(
              configIndex + 1,
              0,
              '    provider: spawn',
              '    toolName: subagent',
              '    modelSelectionSettings: true',
              '    backgroundMode: continuable'
            )
          } else {
            block.push(
              '  config:',
              '    provider: spawn',
              '    toolName: subagent',
              '    modelSelectionSettings: true',
              '    backgroundMode: continuable'
            )
          }
        }
      }
      result.push(...block)
      continue
    }

    result.push(line)
    i++
  }

  return result.join(eol)
}

/**
 * 遍历 `<home>/.agent-presets`，对已存在的 agent.cordis.yml 执行配置格式自愈修补。
 * 忽略 .retired 与非目录项。返回被修补的文件路径列表。
 */
export function healInstalledAgentPresets(home: string): string[] {
  const rootDir = join(home, '.agent-presets')
  if (!existsSync(rootDir)) return []
  const healed: string[] = []
  try {
    const entries = readdirSync(rootDir, { withFileTypes: true })
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue
      const cordisPath = join(rootDir, ent.name, 'agent.cordis.yml')
      if (!existsSync(cordisPath)) continue
      try {
        const raw = readFileSync(cordisPath, 'utf8')
        const fixed = healAgentPresetCordis(raw)
        if (fixed !== raw) {
          writeFileSync(cordisPath, fixed, 'utf8')
          healed.push(cordisPath)
        }
      } catch {}
    }
  } catch {}
  return healed
}
