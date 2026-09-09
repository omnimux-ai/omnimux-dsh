/**
 * plugins/omnimux-apps/src/shared/schemaValidator.ts
 *
 * Validation engine for ApplicationManifest, RestrictedJsonSchema, and Form Input Data.
 * Enforces strict fail-closed constraints per docs/contracts/workflow-app-boundary.md.
 */

import type {
  ApplicationManifest,
  ApplicationCategory,
  FormWidgetType,
  FieldMappingType,
  RestrictedJsonSchema,
  FormPropertySchema,
  FieldMappingEntry,
  ShowcaseItem,
} from './manifest.ts';

export const VALID_CATEGORIES: readonly ApplicationCategory[] = ['video', 'image', 'audio'] as const;

export const VALID_WIDGETS: readonly FormWidgetType[] = [
  'media-extractor',
  'media-uploader',
  'input-text',
  'textarea',
  'select-single',
  'select-grid-pair',
  'ratio-cards',
  'slider-range',
  'switch-boolean',
] as const;

export const VALID_MAPPING_TYPES: readonly FieldMappingType[] = ['text', 'param', 'slot', 'media'] as const;

export const VALID_SHOWCASE_MODES = ['carousel', 'gallery', 'comparison'] as const;

const FORBIDDEN_SCHEMA_KEYWORDS = ['$ref', 'allOf', 'anyOf', 'oneOf', 'not', 'dependencies', 'patternProperties'];

/** Validation outcome interface */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an ApplicationManifest against the OmniMux L1 contract.
 */
export function validateApplicationManifest(manifest: unknown): ValidationResult {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['Manifest must be a non-null object'] };
  }

  const m = manifest as Partial<ApplicationManifest>;

  // 1. Top-level identifiers
  if (typeof m.appId !== 'string' || !m.appId.trim()) {
    errors.push('appId must be a non-empty string');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(m.appId)) {
    errors.push(`appId contains invalid characters: "${m.appId}". Allowed: [a-zA-Z0-9_-]`);
  }

  if (typeof m.version !== 'string' || !m.version.trim()) {
    errors.push('version must be a non-empty string');
  } else if (!/^\d+\.\d+\.\d+([+-][a-zA-Z0-9_.-]+)?$/.test(m.version)) {
    errors.push(`version must follow semantic versioning (e.g. "1.0.0"): "${m.version}"`);
  }

  if (m.schemaVersion !== '1.0') {
    errors.push(`schemaVersion must be strictly "1.0", received "${m.schemaVersion}"`);
  }

  if (typeof m.createdAt !== 'string' || isNaN(Date.parse(m.createdAt))) {
    errors.push(`createdAt must be a valid ISO date string: "${m.createdAt}"`);
  }

  // 2. Metadata validation
  if (!m.metadata || typeof m.metadata !== 'object') {
    errors.push('metadata must be an object');
  } else {
    if (typeof m.metadata.name !== 'string' || !m.metadata.name.trim()) {
      errors.push('metadata.name must be a non-empty string');
    }
    if (!VALID_CATEGORIES.includes(m.metadata.category as any)) {
      errors.push(
        `metadata.category must be one of [video, image, audio], received "${m.metadata.category}". Note: "agent" category is strictly prohibited.`,
      );
    }
    if (typeof m.metadata.iconSvg !== 'string' || !m.metadata.iconSvg.trim()) {
      errors.push('metadata.iconSvg must be a non-empty SVG string');
    } else if (!m.metadata.iconSvg.includes('<svg') && !m.metadata.iconSvg.includes('<path')) {
      errors.push('metadata.iconSvg must contain valid SVG markup');
    }
    if (m.metadata.description !== undefined && typeof m.metadata.description !== 'string') {
      errors.push('metadata.description must be a string');
    }
    if (m.metadata.coverUrl !== undefined && typeof m.metadata.coverUrl !== 'string') {
      errors.push('metadata.coverUrl must be a string');
    }
  }

  // 3. WorkflowBinding validation
  if (!m.workflowBinding || typeof m.workflowBinding !== 'object') {
    errors.push('workflowBinding must be an object');
  } else {
    if (typeof m.workflowBinding.workspaceId !== 'string' || !m.workflowBinding.workspaceId.trim()) {
      errors.push('workflowBinding.workspaceId must be a non-empty string');
    }
    if (typeof m.workflowBinding.workflowHash !== 'string' || !m.workflowBinding.workflowHash.trim()) {
      errors.push('workflowBinding.workflowHash must be a non-empty string');
    }
    if (!m.workflowBinding.snapshot || typeof m.workflowBinding.snapshot !== 'object') {
      errors.push('workflowBinding.snapshot must be an object');
    } else {
      if (!Array.isArray(m.workflowBinding.snapshot.nodes)) {
        errors.push('workflowBinding.snapshot.nodes must be an array');
      }
      if (!Array.isArray(m.workflowBinding.snapshot.edges)) {
        errors.push('workflowBinding.snapshot.edges must be an array');
      }
    }
  }

  // 4. FormSchema validation
  const schemaRes = validateFormSchema(m.formSchema);
  if (!schemaRes.valid) {
    errors.push(...schemaRes.errors.map((e) => `formSchema.${e}`));
  }

  // 5. FieldMappings validation
  if (!m.fieldMappings || typeof m.fieldMappings !== 'object' || Array.isArray(m.fieldMappings)) {
    errors.push('fieldMappings must be an object map');
  } else if (m.formSchema && typeof m.formSchema === 'object' && m.formSchema.properties) {
    const schemaKeys = new Set(Object.keys(m.formSchema.properties));
    const mappingKeys = new Set(Object.keys(m.fieldMappings));

    for (const key of schemaKeys) {
      if (!mappingKeys.has(key)) {
        errors.push(`Missing fieldMapping for form property: "${key}"`);
      }
    }

    for (const [key, mapping] of Object.entries(m.fieldMappings)) {
      if (!schemaKeys.has(key)) {
        errors.push(`Orphan fieldMapping "${key}" has no matching property in formSchema`);
        continue;
      }

      if (!mapping || typeof mapping !== 'object') {
        errors.push(`fieldMappings["${key}"] must be an object`);
        continue;
      }

      if (typeof mapping.nodeId !== 'string' || !mapping.nodeId.trim()) {
        errors.push(`fieldMappings["${key}"].nodeId must be a non-empty string`);
      }
      if (typeof mapping.targetField !== 'string' || !mapping.targetField.trim()) {
        errors.push(`fieldMappings["${key}"].targetField must be a non-empty string`);
      }
      if (!VALID_MAPPING_TYPES.includes(mapping.mappingType as any)) {
        errors.push(
          `fieldMappings["${key}"].mappingType must be one of [${VALID_MAPPING_TYPES.join(', ')}], received "${mapping.mappingType}"`,
        );
      }
      if (!VALID_WIDGETS.includes(mapping.widget as any)) {
        errors.push(
          `fieldMappings["${key}"].widget must be one of [${VALID_WIDGETS.join(', ')}], received "${mapping.widget}"`,
        );
      }
    }
  }

  // 6. Showcase validation
  if (!m.showcase || typeof m.showcase !== 'object') {
    errors.push('showcase must be an object');
  } else {
    if (!VALID_SHOWCASE_MODES.includes(m.showcase.mode as any)) {
      errors.push(
        `showcase.mode must be one of [${VALID_SHOWCASE_MODES.join(', ')}], received "${m.showcase.mode}"`,
      );
    }
    if (!Array.isArray(m.showcase.items)) {
      errors.push('showcase.items must be an array');
    } else {
      m.showcase.items.forEach((item: ShowcaseItem, idx: number) => {
        if (!item || typeof item !== 'object') {
          errors.push(`showcase.items[${idx}] must be an object`);
          return;
        }
        if (typeof item.id !== 'string' || !item.id.trim()) {
          errors.push(`showcase.items[${idx}].id must be a non-empty string`);
        }
        if (!VALID_CATEGORIES.includes(item.mediaType as any)) {
          errors.push(`showcase.items[${idx}].mediaType must be one of [video, image, audio]`);
        }
        if (typeof item.mediaUrl !== 'string' || !item.mediaUrl.trim()) {
          errors.push(`showcase.items[${idx}].mediaUrl must be a non-empty string`);
        }
      });
    }
  }

  // 7. DemoSnapshot validation
  if (!m.demoSnapshot || typeof m.demoSnapshot !== 'object' || Array.isArray(m.demoSnapshot)) {
    errors.push('demoSnapshot must be an object');
  } else if (schemaRes.valid && m.formSchema) {
    const demoRes = validateFormData(m.formSchema, m.demoSnapshot);
    if (!demoRes.valid) {
      errors.push(...demoRes.errors.map((e) => `demoSnapshot.${e}`));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate RestrictedJsonSchema Draft-07 subset.
 */
export function validateFormSchema(schema: unknown): ValidationResult {
  const errors: string[] = [];

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { valid: false, errors: ['Schema must be an object'] };
  }

  const s = schema as Record<string, unknown>;

  // Check forbidden keywords
  for (const kw of FORBIDDEN_SCHEMA_KEYWORDS) {
    if (kw in s) {
      errors.push(`Unsupported keyword "${kw}". Remote references and compound schemas are rejected.`);
    }
  }

  if (s.type !== 'object') {
    errors.push(`Root schema type must be "object", received "${s.type}"`);
  }

  if (s.additionalProperties !== false) {
    errors.push(`additionalProperties must be explicitly set to false`);
  }

  if (!Array.isArray(s.required)) {
    errors.push('required must be an array of string property keys');
  }

  if (!s.properties || typeof s.properties !== 'object' || Array.isArray(s.properties)) {
    errors.push('properties must be a non-empty object map');
    return { valid: errors.length === 0, errors };
  }

  const propEntries = Object.entries(s.properties as Record<string, unknown>);
  const propKeys = new Set(Object.keys(s.properties as Record<string, unknown>));

  if (Array.isArray(s.required)) {
    for (const reqKey of s.required) {
      if (typeof reqKey !== 'string' || !propKeys.has(reqKey)) {
        errors.push(`required property "${reqKey}" does not exist in schema properties`);
      }
    }
  }

  for (const [propName, propDef] of propEntries) {
    validatePropertySchema(propName, propDef, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validatePropertySchema(propName: string, prop: unknown, errors: string[]): void {
  if (!prop || typeof prop !== 'object' || Array.isArray(prop)) {
    errors.push(`property "${propName}" must be an object`);
    return;
  }

  const p = prop as Record<string, unknown>;

  for (const kw of FORBIDDEN_SCHEMA_KEYWORDS) {
    if (kw in p) {
      errors.push(`property "${propName}" contains forbidden keyword "${kw}"`);
    }
  }

  const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
  if (typeof p.type !== 'string' || !validTypes.includes(p.type)) {
    errors.push(`property "${propName}".type must be one of [${validTypes.join(', ')}], received "${p.type}"`);
  }

  if (p.enum !== undefined) {
    if (!Array.isArray(p.enum) || p.enum.length === 0) {
      errors.push(`property "${propName}".enum must be a non-empty array`);
    }
  }

  if (p.minimum !== undefined && typeof p.minimum !== 'number') {
    errors.push(`property "${propName}".minimum must be a number`);
  }
  if (p.maximum !== undefined && typeof p.maximum !== 'number') {
    errors.push(`property "${propName}".maximum must be a number`);
  }
  if (p.minimum !== undefined && p.maximum !== undefined && (p.minimum as number) > (p.maximum as number)) {
    errors.push(`property "${propName}".minimum cannot be greater than maximum`);
  }

  if (p.minLength !== undefined && (typeof p.minLength !== 'number' || p.minLength < 0)) {
    errors.push(`property "${propName}".minLength must be a non-negative number`);
  }
  if (p.maxLength !== undefined && (typeof p.maxLength !== 'number' || p.maxLength < 0)) {
    errors.push(`property "${propName}".maxLength must be a non-negative number`);
  }

  if (p.pattern !== undefined) {
    if (typeof p.pattern !== 'string') {
      errors.push(`property "${propName}".pattern must be a string regex`);
    } else {
      try {
        new RegExp(p.pattern);
      } catch {
        errors.push(`property "${propName}".pattern is an invalid regular expression: "${p.pattern}"`);
      }
    }
  }

  if (p.widget !== undefined && !VALID_WIDGETS.includes(p.widget as any)) {
    errors.push(`property "${propName}".widget must be one of [${VALID_WIDGETS.join(', ')}]`);
  }

  if (p.type === 'array') {
    if (!p.items || typeof p.items !== 'object') {
      errors.push(`array property "${propName}" must define an "items" schema`);
    } else {
      validatePropertySchema(`${propName}.items`, p.items, errors);
    }
  }

  if (p.type === 'object' && p.properties) {
    if (p.additionalProperties !== false) {
      errors.push(`nested object property "${propName}" must set additionalProperties: false`);
    }
    for (const [subKey, subDef] of Object.entries(p.properties as Record<string, unknown>)) {
      validatePropertySchema(`${propName}.${subKey}`, subDef, errors);
    }
  }
}

/**
 * Validate input form data against the RestrictedJsonSchema.
 */
export function validateFormData(schema: RestrictedJsonSchema, data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['Input data must be a non-null object'] };
  }

  const payload = data as Record<string, unknown>;
  const allowedKeys = new Set(Object.keys(schema.properties));

  // 1. Required field verification
  for (const reqKey of schema.required) {
    const val = payload[reqKey];
    if (val === undefined || val === null) {
      errors.push(`Missing required field: "${reqKey}"`);
    } else if (typeof val === 'string' && val.trim() === '') {
      errors.push(`Required field "${reqKey}" cannot be empty`);
    }
  }

  // 2. Disallow additional properties
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Property "${key}" is not permitted (additionalProperties: false)`);
    }
  }

  // 3. Validate property values
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const val = payload[key];
    if (val === undefined || val === null) {
      continue; // Handled by required check if applicable
    }

    validatePropertyValue(key, val, propSchema, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validatePropertyValue(key: string, val: unknown, schema: FormPropertySchema, errors: string[]): void {
  // Type checking
  switch (schema.type) {
    case 'string':
      if (typeof val !== 'string') {
        errors.push(`Field "${key}" must be a string, received ${typeof val}`);
        return;
      }
      if (schema.minLength !== undefined && val.length < schema.minLength) {
        errors.push(`Field "${key}" length (${val.length}) is less than minLength (${schema.minLength})`);
      }
      if (schema.maxLength !== undefined && val.length > schema.maxLength) {
        errors.push(`Field "${key}" length (${val.length}) exceeds maxLength (${schema.maxLength})`);
      }
      if (schema.pattern !== undefined) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(val)) {
          errors.push(`Field "${key}" does not match pattern "${schema.pattern}"`);
        }
      }
      break;

    case 'number':
      if (typeof val !== 'number' || isNaN(val)) {
        errors.push(`Field "${key}" must be a valid number`);
        return;
      }
      if (schema.minimum !== undefined && val < schema.minimum) {
        errors.push(`Field "${key}" (${val}) is less than minimum (${schema.minimum})`);
      }
      if (schema.maximum !== undefined && val > schema.maximum) {
        errors.push(`Field "${key}" (${val}) exceeds maximum (${schema.maximum})`);
      }
      break;

    case 'integer':
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        errors.push(`Field "${key}" must be an integer`);
        return;
      }
      if (schema.minimum !== undefined && val < schema.minimum) {
        errors.push(`Field "${key}" (${val}) is less than minimum (${schema.minimum})`);
      }
      if (schema.maximum !== undefined && val > schema.maximum) {
        errors.push(`Field "${key}" (${val}) exceeds maximum (${schema.maximum})`);
      }
      break;

    case 'boolean':
      if (typeof val !== 'boolean') {
        errors.push(`Field "${key}" must be a boolean, received ${typeof val}`);
        return;
      }
      break;

    case 'array':
      if (!Array.isArray(val)) {
        errors.push(`Field "${key}" must be an array`);
        return;
      }
      if (schema.minItems !== undefined && val.length < schema.minItems) {
        errors.push(`Field "${key}" item count (${val.length}) is less than minItems (${schema.minItems})`);
      }
      if (schema.maxItems !== undefined && val.length > schema.maxItems) {
        errors.push(`Field "${key}" item count (${val.length}) exceeds maxItems (${schema.maxItems})`);
      }
      if (schema.items) {
        val.forEach((item, idx) => {
          validatePropertyValue(`${key}[${idx}]`, item, schema.items!, errors);
        });
      }
      break;

    case 'object':
      if (typeof val !== 'object' || val === null || Array.isArray(val)) {
        errors.push(`Field "${key}" must be an object`);
        return;
      }
      if (schema.properties) {
        const subSchema: RestrictedJsonSchema = {
          type: 'object',
          properties: schema.properties,
          required: schema.required || [],
          additionalProperties: false,
        };
        const subRes = validateFormData(subSchema, val);
        if (!subRes.valid) {
          errors.push(...subRes.errors.map((e) => `${key}.${e}`));
        }
      }
      break;
  }

  // Enum checking
  if (schema.enum && !schema.enum.includes(val as any)) {
    errors.push(
      `Field "${key}" value "${val}" is not in allowed enum: [${schema.enum.join(', ')}]`,
    );
  }
}
