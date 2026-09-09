import { z } from 'zod';
import {
  FormDefinitionSchema, AttachmentSchema, PROTOCOL_VERSION,
  type FormDefinition, type Field, type Attachment, type Values,
} from './schema.ts';

export { FormDefinitionSchema, AttachmentSchema, PROTOCOL_VERSION };
export type { FormDefinition, Field, Attachment, Values };

export const ERROR_DESCRIPTIONS = {
  INVALID_DEFINITION: '配置结构、属性或组件不符合协议',
  UNSUPPORTED_VERSION: '协议版本不受支持；需要显式迁移',
  DUPLICATE_FIELD: '字段标识重复',
  INVALID_RANGE: '字段范围或步长无效',
  DUPLICATE_OPTION: '选项值重复',
  INVALID_DEFAULT: '默认值不符合字段规则',
  INVALID_PLACEHOLDER: 'Prompt 占位符格式不合法',
  UNKNOWN_REFERENCE: 'Prompt 或附件映射引用不存在的字段',
  INVALID_MAPPING: '文本与附件映射类型不匹配或重复',
  UNMAPPED_FIELD: '用户字段未参与 Prompt 或附件输出',
  INVALID_VALUES: '填写数据必须是字段值对象',
  UNKNOWN_FIELD: '填写数据包含未定义字段',
  REQUIRED: '必填字段为空',
  INVALID_VALUE: '填写值类型或格式错误',
  OUT_OF_RANGE: '填写值长度、范围或步长不合规',
  INVALID_OPTION: '填写值不在允许选项内',
  INVALID_ATTACHMENT: '附件元数据不合规',
} as const;
export type ErrorCode = keyof typeof ERROR_DESCRIPTIONS;
export type ValidationError = { code: ErrorCode; path: (string | number)[]; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };
export type Draft = {
  protocolVersion: typeof PROTOCOL_VERSION;
  templateId: string;
  templateVersion: string;
  prompt: string;
  attachments: (Attachment & { fieldId: string })[];
};

const PLACEHOLDER = /(?<!\{)\{\{([a-z][a-z0-9_]*)\}\}(?!\})/g;

function error(code: ErrorCode, path: (string | number)[], detail = ''): ValidationError {
  return { code, path, message: `${ERROR_DESCRIPTIONS[code]}${detail ? `：${detail}` : ''}` };
}
function schemaErrors(issues: z.core.$ZodIssue[], code: ErrorCode, prefix: (string | number)[] = []): ValidationError[] {
  return issues.flatMap(issue => {
    const path = [...prefix, ...issue.path.map(key => typeof key === 'number' ? key : String(key))];
    return issue.code === 'unrecognized_keys'
      ? issue.keys.map(key => error(code, [...path, key], '未知属性'))
      : [error(code, path, issue.message)];
  });
}
function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function onStep(value: number, min: number, step: number): boolean {
  const quotient = (value - min) / step;
  return Number.isFinite(quotient) && Math.abs(quotient - Math.round(quotient)) <= Math.min(1e-7, 1e-9 * Math.max(1, Math.abs(quotient)));
}
function mimeMatches(mime: string, accept: string[]): boolean {
  return accept.some(pattern => pattern.endsWith('/*') ? mime.startsWith(pattern.slice(0, -1)) : mime === pattern);
}

function fieldErrors(field: Field, value: unknown, path: (string | number)[]): ValidationError[] {
  const empty = value === undefined || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
  if (empty && field.required) return [error('REQUIRED', path)];
  if (value === undefined) return [];
  switch (field.type) {
    case 'text':
    case 'textarea': {
      if (typeof value !== 'string' || (field.type === 'text' && /[\r\n\u2028\u2029]/.test(value))) return [error('INVALID_VALUE', path)];
      if ((field.minLength !== undefined && value.length < field.minLength) || (field.maxLength !== undefined && value.length > field.maxLength)) return [error('OUT_OF_RANGE', path)];
      return [];
    }
    case 'number':
    case 'slider':
      if (typeof value !== 'number' || !Number.isFinite(value)) return [error('INVALID_VALUE', path)];
      return value < field.min || value > field.max || !onStep(value, field.min, field.step)
        ? [error('OUT_OF_RANGE', path)] : [];
    case 'select':
    case 'aspect-ratio':
      if (typeof value !== 'string') return [error('INVALID_VALUE', path)];
      return field.options.some(option => option.value === value) ? [] : [error('INVALID_OPTION', path)];
    case 'file': {
      if (!Array.isArray(value)) return [error('INVALID_VALUE', path)];
      const errors: ValidationError[] = [];
      if (value.length > field.maxFiles) errors.push(error('OUT_OF_RANGE', path, `最多 ${field.maxFiles} 个附件`));
      const refs = new Set<string>();
      value.forEach((input, index) => {
        const parsed = AttachmentSchema.safeParse(input);
        if (!parsed.success) {
          errors.push(...schemaErrors(parsed.error.issues, 'INVALID_ATTACHMENT', [...path, index]));
          return;
        }
        const attachment = parsed.data;
        if (attachment.sizeBytes > field.maxBytes) errors.push(error('INVALID_ATTACHMENT', [...path, index, 'sizeBytes'], '超过单文件大小限制'));
        if (!mimeMatches(attachment.mimeType, field.accept)) errors.push(error('INVALID_ATTACHMENT', [...path, index, 'mimeType'], '文件类型不在允许范围'));
        if (refs.has(attachment.ref)) errors.push(error('INVALID_ATTACHMENT', [...path, index, 'ref'], '同一字段重复引用附件'));
        refs.add(attachment.ref);
      });
      return errors;
    }
  }
}

/** Structural validation plus cross-field references, defaults and output coverage. */
export function validateDefinition(input: unknown): Result<FormDefinition> {
  if (record(input) && input.protocolVersion !== undefined && input.protocolVersion !== PROTOCOL_VERSION) {
    return { ok: false, errors: [error('UNSUPPORTED_VERSION', ['protocolVersion'])] };
  }
  const parsed = FormDefinitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error.issues, 'INVALID_DEFINITION') };
  const definition = parsed.data;
  const errors: ValidationError[] = [];
  const fields = new Map<string, Field>();
  definition.fields.forEach((field, index) => {
    const path = ['fields', index];
    if (fields.has(field.id)) errors.push(error('DUPLICATE_FIELD', [...path, 'id']));
    fields.set(field.id, field);
    if ((field.type === 'text' || field.type === 'textarea') && field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) {
      errors.push(error('INVALID_RANGE', path));
    }
    if ((field.type === 'number' || field.type === 'slider') && (field.min > field.max || !Number.isFinite((field.max - field.min) / field.step))) errors.push(error('INVALID_RANGE', path));
    if (field.type === 'select' || field.type === 'aspect-ratio') {
      const seen = new Set<string>();
      field.options.forEach((option, optionIndex) => {
        if (seen.has(option.value)) errors.push(error('DUPLICATE_OPTION', [...path, 'options', optionIndex, 'value']));
        seen.add(option.value);
      });
    }
    if ('default' in field && field.default !== undefined && fieldErrors(field, field.default, []).length) errors.push(error('INVALID_DEFAULT', [...path, 'default']));
  });
  const mapped = new Set<string>();
  // Only this exact grammar is interpolated; expressions and malformed braces fail closed.
  const residue = definition.prompt.replace(PLACEHOLDER, (_, id: string) => {
    const field = fields.get(id);
    if (!field) errors.push(error('UNKNOWN_REFERENCE', ['prompt'], id));
    else if (field.type === 'file') errors.push(error('INVALID_MAPPING', ['prompt'], '文件字段须通过 attachments 输出'));
    else mapped.add(id);
    return '';
  });
  if (residue.includes('{{') || residue.includes('}}')) errors.push(error('INVALID_PLACEHOLDER', ['prompt']));
  const attachmentIds = new Set<string>();
  definition.attachments.forEach((id, index) => {
    const field = fields.get(id);
    if (!field) errors.push(error('UNKNOWN_REFERENCE', ['attachments', index], id));
    else if (field.type !== 'file' || attachmentIds.has(id)) errors.push(error('INVALID_MAPPING', ['attachments', index]));
    else mapped.add(id);
    attachmentIds.add(id);
  });
  definition.fields.forEach((field, index) => {
    if (!mapped.has(field.id)) errors.push(error('UNMAPPED_FIELD', ['fields', index, 'id']));
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: definition };
}

function validateKnownValues(definition: FormDefinition, input: unknown): Result<Values> {
  if (!record(input)) return { ok: false, errors: [error('INVALID_VALUES', ['values'])] };
  const errors: ValidationError[] = [];
  const values: Values = Object.create(null);
  const ids = new Set(definition.fields.map(field => field.id));
  for (const key of Object.keys(input)) if (!ids.has(key)) errors.push(error('UNKNOWN_FIELD', ['values', key]));
  for (const field of definition.fields) {
    const raw = Object.hasOwn(input, field.id) ? input[field.id] : undefined;
    const value = raw === undefined && 'default' in field ? field.default : raw;
    const failures = fieldErrors(field, value, ['values', field.id]);
    errors.push(...failures);
    if (!failures.length && value !== undefined) {
      values[field.id] = field.type === 'file'
        ? (value as unknown[]).map(item => AttachmentSchema.parse(item))
        : value as string | number;
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: values };
}

/** Validate raw JSON values; apply configured defaults only for absent fields. */
export function validateValues(definition: unknown, input: unknown): Result<Values> {
  const checked = validateDefinition(definition);
  return checked.ok ? validateKnownValues(checked.value, input) : checked;
}

/** Generate plain text and independent attachment references. Never perform I/O. */
export function buildDraft(definition: unknown, input: unknown): Result<Draft> {
  const checked = validateDefinition(definition);
  if (!checked.ok) return checked;
  const values = validateKnownValues(checked.value, input);
  if (!values.ok) return values;
  const attachments = checked.value.attachments.flatMap(fieldId =>
    ((values.value[fieldId] ?? []) as Attachment[]).map(attachment => ({ ...attachment, fieldId })));
  const prompt = checked.value.prompt.replace(PLACEHOLDER, (_, id: string) => String(values.value[id] ?? ''));
  return { ok: true, value: { protocolVersion: PROTOCOL_VERSION, templateId: checked.value.id, templateVersion: checked.value.templateVersion, prompt, attachments } };
}
