/**
 * @file plugins/omnimux-market/src/expert-presets.ts
 * Agent Preset 落盘的唯一真源：专家市场的硬编码专家与技能市场套件包内的
 * `agents/*.md` 都写这一种形状，避免两处模板各自漂移。
 *
 * 目录名即 preset id，由官方 `@deepseek-ai/dsh-agent-presets` 发现；`preset.yml`
 * 只承载展示元数据（name/description/order），`agent.cordis.yml` 是组合清单。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/** YAML 块标量的每一行都要缩进，否则多行 persona 会截断正文。 */
function indentBlock(text, spaces) {
    const pad = ' '.repeat(spaces);
    const body = String(text ?? '').replace(/\s+$/, '');
    return body
        .split('\n')
        .map((line) => (line === '' ? '' : pad + line))
        .join('\n');
}
/** 一个 preset 的组合清单：persona + 指令文件发现 + 通用工具面。 */
export function agentPresetCordis(id, persona) {
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
- id: tool-subagent
  name: '@deepseek-ai/dsh-tool-subagent'
- id: tool-subagent-fork
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: fork
    toolName: subagent_fork
    backgroundMode: continuable
`;
}
/** 写入 `<home>/.agent-presets/<id>/`，返回 preset 目录。 */
export function writeAgentPreset(home, preset) {
    const dir = join(home, '.agent-presets', preset.id);
    mkdirSync(dir, { recursive: true });
    const presetYml = `name: ${preset.name}\ndescription: ${preset.description ?? ''}\norder: ${preset.order ?? 0}\n`;
    writeFileSync(join(dir, 'preset.yml'), presetYml, 'utf8');
    writeFileSync(join(dir, 'agent.cordis.yml'), agentPresetCordis(preset.id, preset.persona), 'utf8');
    return dir;
}
