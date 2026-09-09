import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
const fieldId = z.string().regex(/^[a-z][a-z0-9_]*$/).max(64)
  .describe('字段标识；字母开头，仅小写字母、数字和下划线');
const text = z.string().trim().min(1).max(500);
const common = {
  id: fieldId,
  label: text,
  description: z.string().max(2000).optional(),
  required: z.boolean().default(false),
};
const textProperties = {
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  default: z.string().optional(),
};
const numericProperties = {
  min: z.number(),
  max: z.number(),
  step: z.number().positive().default(1),
  default: z.number().optional(),
};
const choiceProperties = {
  options: z.array(z.strictObject({ value: text, label: text })).min(1).max(32),
  default: z.string().optional(),
};
const mimePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/(?:[a-z0-9][a-z0-9!#$&^_.+-]*|\*)$/;

export const FIELD_SCHEMAS = {
  text: z.strictObject({ ...common, type: z.literal('text'), ...textProperties })
    .describe('单行文本；不接受换行符'),
  textarea: z.strictObject({ ...common, type: z.literal('textarea'), ...textProperties })
    .describe('多行文本；原样保留换行及特殊字符'),
  file: z.strictObject({
    ...common, type: z.literal('file'),
    accept: z.array(z.string().regex(mimePattern)).min(1),
    maxFiles: z.number().int().positive().max(20),
    maxBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }).describe('文件元数据及不透明素材引用；不执行上传或探测资源'),
  number: z.strictObject({ ...common, type: z.literal('number'), ...numericProperties })
    .describe('数字步进；范围及相对 min 的 step 必须满足'),
  slider: z.strictObject({ ...common, type: z.literal('slider'), ...numericProperties })
    .describe('滑块；规则与数字步进一致'),
  select: z.strictObject({ ...common, type: z.literal('select'), ...choiceProperties })
    .describe('单选卡片；输出选项的 value，label 仅用于显示'),
  'aspect-ratio': z.strictObject({ ...common, type: z.literal('aspect-ratio'),
    ...choiceProperties,
    options: z.array(z.strictObject({
      value: z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/), label: text,
    })).min(1).max(32),
  }).describe('比例选择；配置正整数宽高比选项，不是媒体容器'),
};

export const FieldSchema = z.discriminatedUnion('type', [
  FIELD_SCHEMAS.text, FIELD_SCHEMAS.textarea, FIELD_SCHEMAS.file,
  FIELD_SCHEMAS.number, FIELD_SCHEMAS.slider, FIELD_SCHEMAS.select,
  FIELD_SCHEMAS['aspect-ratio'],
]);

export const FormDefinitionSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(80),
  templateVersion: z.string().regex(/^[1-9]\d*\.\d+\.\d+$/)
    .describe('模板内容版本，与协议版本分开维护'),
  title: text,
  description: z.string().trim().min(1).max(2000),
  examples: z.array(z.strictObject({
    ref: text, title: text, kind: z.enum(['image', 'video']),
  })).min(1).max(8).describe('左侧案例引用；离线不验证资源存在性'),
  fields: z.array(FieldSchema).min(1).max(64),
  prompt: z.string().trim().min(1).max(20000)
    .describe('固定文字与 {{field_id}} 占位符；替换一次，不执行表达式'),
  attachments: z.array(fieldId).default([])
    .describe('文件字段标识；按此顺序输出独立素材引用'),
});

export const AttachmentSchema = z.strictObject({
  ref: text.describe('已有素材的不透明引用；不是上传成功凭证'),
  name: text,
  mimeType: z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/),
  sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export type FormDefinition = z.output<typeof FormDefinitionSchema>;
export type Field = z.output<typeof FieldSchema>;
export type Attachment = z.output<typeof AttachmentSchema>;
export type Values = Record<string, string | number | Attachment[]>;
