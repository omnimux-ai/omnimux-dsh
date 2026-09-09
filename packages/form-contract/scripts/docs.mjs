import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { z } from 'zod';
import { FormDefinitionSchema, AttachmentSchema, FIELD_SCHEMAS, PROTOCOL_VERSION } from '../src/schema.ts';
import { ERROR_DESCRIPTIONS } from '../src/index.ts';
import { commands } from './commands.mjs';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const json = value => `${JSON.stringify(value, null, 2)}\n`;

export function generatedFiles() {
  const schema = z.toJSONSchema(FormDefinitionSchema, { target: 'draft-2020-12', io: 'input' });
  const attachmentSchema = z.toJSONSchema(AttachmentSchema, { target: 'draft-2020-12', io: 'input' });
  const fields = Object.entries(FIELD_SCHEMAS).map(([name, field]) => {
    const object = z.toJSONSchema(field, { io: 'input' });
    return `| ${name} | ${object.description} | ${Object.keys(object.properties).join(', ')} |`;
  }).join('\n');
  const errors = Object.entries(ERROR_DESCRIPTIONS).map(([code, description]) => `| ${code} | ${description} |`).join('\n');
  const commandTable = Object.values(commands).map(command => `| \`pnpm --config.verify-deps-before-run=false form: ${command.usage}\` | ${command.description} |`).join('\n');
  const template = readFileSync(new URL('../templates/video-deconstruct/definition.json', import.meta.url), 'utf8').trim();
  return new Map([
    ['generated/form.schema.json', json(schema)],
    ['generated/attachment.schema.json', json(attachmentSchema)],
    ['generated/reference.md', `# 表单协议参考（自动生成）\n\n由契约结构、错误定义、命令目录及官方样例生成。请修改对应真源，再运行 \`pnpm --config.verify-deps-before-run=false form: docs\`。\n\n协议版本：${PROTOCOL_VERSION}。JSON Schema 仅表达结构约束；引用、覆盖、默认值、范围关系及填写语义还必须通过公开校验接口。\n\n## 字段\n\n| type | 含义 | 属性 |\n| --- | --- | --- |\n${fields}\n\n完整字段类型、必填与默认值见 [配置 Schema](form.schema.json)；附件对象见 [附件 Schema](attachment.schema.json)。\n\n## 命令\n\n| 命令 | 行为 |\n| --- | --- |\n${commandTable}\n\n## 错误码\n\n| code | 含义 |\n| --- | --- |\n${errors}\n\n## 配置实例\n\n此代码块取自官方视频拆解模板，校验由 \`pnpm --config.verify-deps-before-run=false verify:forms\` 执行。\n\n\`\`\`json\n${template}\n\`\`\`\n`],
  ]);
}

export function updateDocs({ check = false, root = packageRoot } = {}) {
  const stale = [];
  for (const [relative, expected] of generatedFiles()) {
    const target = join(root, relative);
    if (check) {
      let actual;
      try { actual = readFileSync(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (actual !== expected) stale.push(relative);
    } else writeFileSync(target, expected);
  }
  return stale;
}
