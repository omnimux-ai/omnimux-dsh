/**
 * Shared node / group / link-object decoders for the ComfyUI workflow codec.
 *
 * Both schema generations use the same node and group shapes; only the root
 * envelope and the link representation differ (v0.4 tuples vs v1 objects).
 * Keeping this in one place means the two version modules stay thin and the
 * round-trip guarantees are identical.
 *
 * Lossless policy (see `types.ts`):
 * - required structural fields (node id/type/pos, link endpoints, v1 state
 *   counters) must be well-formed: a violation is a loud parse error, never a
 *   default;
 * - declared *optional* fields whose value has an unexpected shape (including
 *   an explicit `null`) keep their original value in the `unknown` bag, so the
 *   encoder re-emits it verbatim and the canvas projection reports it as a
 *   `field-type-mismatch` instead of dropping it silently.
 */

import { fail } from './errors.ts';
import {
  asArray,
  asRecord,
  collectUnknown,
  isFiniteNumber,
  isPlainObject,
  readLinkType,
  readPair,
  readQuad,
} from './structure.ts';
import type {
  ComfyGroup,
  ComfyLink,
  ComfyLinkType,
  ComfyNode,
  ComfyNodeInput,
  ComfyNodeOutput,
  ComfyReroute,
} from './types.ts';

export const DECLARED_NODE_FIELDS: readonly string[] = [
  'id', 'type', 'pos', 'size', 'flags', 'order', 'mode',
  'inputs', 'outputs', 'properties', 'widgets_values', 'color', 'bgcolor', 'title',
];

export const DECLARED_INPUT_FIELDS: readonly string[] = [
  'name', 'type', 'link', 'slot_index', 'widget',
];

export const DECLARED_OUTPUT_FIELDS: readonly string[] = ['name', 'type', 'links', 'slot_index'];

export const DECLARED_GROUP_FIELDS: readonly string[] = [
  'id', 'title', 'bounding', 'color', 'font_size', 'flags',
];

export const DECLARED_LINK_FIELDS: readonly string[] = [
  'id', 'origin_id', 'origin_slot', 'target_id', 'target_slot', 'type', 'parentId',
];

export const DECLARED_REROUTE_FIELDS: readonly string[] = ['id', 'pos', 'linkIds', 'parentId'];

const NODE_KEYS = DECLARED_NODE_FIELDS;
const INPUT_KEYS = DECLARED_INPUT_FIELDS;
const OUTPUT_KEYS = DECLARED_OUTPUT_FIELDS;
const GROUP_KEYS = DECLARED_GROUP_FIELDS;
const LINK_KEYS = DECLARED_LINK_FIELDS;
const REROUTE_KEYS = DECLARED_REROUTE_FIELDS;

// ============================================================================
// Preserving readers for declared optional fields
// ============================================================================

/** Keep an unexpected value verbatim and report "absent" to the caller. */
function preserveRaw(
  unknown: Record<string, unknown>,
  key: string,
  value: unknown,
): undefined {
  unknown[key] = value;
  return undefined;
}

/** Read an optional finite number; unexpected shapes (incl. null) are preserved. */
export function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
  unknown: Record<string, unknown>,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (isFiniteNumber(value)) return value;
  return preserveRaw(unknown, key, value);
}

/** Read an optional string; unexpected shapes (incl. null) are preserved. */
export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  unknown: Record<string, unknown>,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  return preserveRaw(unknown, key, value);
}

/** Read an optional `[a, b]` pair; unexpected shapes (incl. null) are preserved. */
export function readOptionalPair(
  record: Record<string, unknown>,
  key: string,
  unknown: Record<string, unknown>,
): [number, number] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  const pair = readPair(value);
  if (pair) return pair;
  return preserveRaw(unknown, key, value);
}

/** Read an optional `[a, b, c, d]` quad; unexpected shapes (incl. null) are preserved. */
export function readOptionalQuad(
  record: Record<string, unknown>,
  key: string,
  unknown: Record<string, unknown>,
): [number, number, number, number] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  const quad = readQuad(value);
  if (quad) return quad;
  return preserveRaw(unknown, key, value);
}

/** Read an optional object; unexpected shapes (incl. null) are preserved. */
export function readOptionalRecord(
  record: Record<string, unknown>,
  key: string,
  unknown: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  const nested = asRecord(value);
  if (nested) return nested;
  return preserveRaw(unknown, key, value);
}

/** Read an optional array; unexpected shapes (incl. null) are preserved. */
export function readOptionalArray(
  record: Record<string, unknown>,
  key: string,
  unknown: Record<string, unknown>,
): unknown[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  const arr = asArray(value);
  if (arr) return arr;
  return preserveRaw(unknown, key, value);
}

/** Read an optional nullable number (`null` is a valid, preserved value). */
export function readOptionalNullableNumber(
  record: Record<string, unknown>,
  key: string,
  unknown: Record<string, unknown>,
): number | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (isFiniteNumber(value)) return value;
  return preserveRaw(unknown, key, value);
}

// ============================================================================
// Required readers (loud failures)
// ============================================================================

function requireNumber(value: unknown, path: string, what: string): number {
  if (!isFiniteNumber(value)) {
    fail('invalid-structure', path, `expected ${what} to be a finite number`);
  }
  return value;
}

function requireString(value: unknown, path: string, what: string): string {
  if (typeof value !== 'string') {
    fail('invalid-structure', path, `expected ${what} to be a string`);
  }
  return value;
}

// ============================================================================
// Decoders
// ============================================================================

function decodeNodeInput(raw: unknown, path: string): ComfyNodeInput {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected an input port object');
  const unknown = collectUnknown(record, INPUT_KEYS);
  const name = requireString(record.name, `${path}.name`, 'input name');
  const type = readLinkType(record.type);
  if (type === null) fail('invalid-structure', `${path}.type`, 'expected an input type token');
  const linkValue = record.link;
  let link: number | null = null;
  if (linkValue !== undefined && linkValue !== null) {
    // A link id is structural: a wrong type is a loud error, never "unconnected".
    link = requireNumber(linkValue, `${path}.link`, 'input link id');
  }
  const slotIndex = readOptionalNumber(record, 'slot_index', unknown);
  const widget = readOptionalRecord(record, 'widget', unknown);
  return {
    name,
    type,
    link,
    ...(slotIndex !== undefined ? { slotIndex } : {}),
    ...(widget !== undefined ? { widget } : {}),
    unknown,
  };
}

function decodeNodeOutput(raw: unknown, path: string): ComfyNodeOutput {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected an output port object');
  const unknown = collectUnknown(record, OUTPUT_KEYS);
  const name = requireString(record.name, `${path}.name`, 'output name');
  const type = readLinkType(record.type);
  if (type === null) fail('invalid-structure', `${path}.type`, 'expected an output type token');
  const linksValue = record.links;
  let links: number[] | null = null;
  if (linksValue !== undefined) {
    if (linksValue === null) {
      links = null;
    } else {
      const arr = asArray(linksValue);
      if (!arr) {
        // Unexpected shape: preserve it verbatim instead of dropping the field.
        preserveRaw(unknown, 'links', linksValue);
      } else {
        links = arr.map((entry, index) =>
          requireNumber(entry, `${path}.links[${index}]`, 'link id'));
      }
    }
  }
  const slotIndex = readOptionalNumber(record, 'slot_index', unknown);
  return {
    name,
    type,
    links,
    ...(slotIndex !== undefined ? { slotIndex } : {}),
    unknown,
  };
}

export function decodeNode(raw: unknown, path: string): ComfyNode {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a node object');
  const unknown = collectUnknown(record, NODE_KEYS);
  const id = requireNumber(record.id, `${path}.id`, 'node id');
  const type = requireString(record.type, `${path}.type`, 'node type');
  const pos = readPair(record.pos);
  if (!pos) fail('invalid-structure', `${path}.pos`, 'expected a [x, y] number pair');

  const size = readOptionalPair(record, 'size', unknown);
  const flags = readOptionalRecord(record, 'flags', unknown);
  const order = readOptionalNumber(record, 'order', unknown);
  const mode = readOptionalNumber(record, 'mode', unknown);
  const properties = readOptionalRecord(record, 'properties', unknown);
  const widgetsValues = readOptionalArray(record, 'widgets_values', unknown);
  const color = readOptionalString(record, 'color', unknown);
  const bgcolor = readOptionalString(record, 'bgcolor', unknown);
  const title = readOptionalString(record, 'title', unknown);

  const inputsValue = record.inputs;
  let inputs: ComfyNodeInput[] | undefined;
  if (inputsValue !== undefined) {
    const arr = asArray(inputsValue);
    if (!arr) {
      preserveRaw(unknown, 'inputs', inputsValue);
    } else {
      inputs = arr.map((entry, index) => decodeNodeInput(entry, `${path}.inputs[${index}]`));
    }
  }

  const outputsValue = record.outputs;
  let outputs: ComfyNodeOutput[] | undefined;
  if (outputsValue !== undefined) {
    const arr = asArray(outputsValue);
    if (!arr) {
      preserveRaw(unknown, 'outputs', outputsValue);
    } else {
      outputs = arr.map((entry, index) => decodeNodeOutput(entry, `${path}.outputs[${index}]`));
    }
  }

  return {
    id,
    type,
    pos,
    ...(size !== undefined ? { size } : {}),
    ...(flags !== undefined ? { flags } : {}),
    ...(order !== undefined ? { order } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(inputs !== undefined ? { inputs } : {}),
    ...(outputs !== undefined ? { outputs } : {}),
    ...(properties !== undefined ? { properties } : {}),
    ...(widgetsValues !== undefined ? { widgetsValues } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(bgcolor !== undefined ? { bgcolor } : {}),
    ...(title !== undefined ? { title } : {}),
    unknown,
  };
}

export function decodeGroup(raw: unknown, path: string): ComfyGroup {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a group object');
  const unknown = collectUnknown(record, GROUP_KEYS);
  const id = readOptionalNumber(record, 'id', unknown);
  const title = readOptionalString(record, 'title', unknown);
  const bounding = readOptionalQuad(record, 'bounding', unknown);
  const color = readOptionalString(record, 'color', unknown);
  const fontSize = readOptionalNumber(record, 'font_size', unknown);
  const flags = readOptionalRecord(record, 'flags', unknown);
  return {
    ...(id !== undefined ? { id } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(bounding !== undefined ? { bounding } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(flags !== undefined ? { flags } : {}),
    unknown,
  };
}

/** Decode the v1 object link form. */
export function decodeLinkObject(raw: unknown, path: string): ComfyLink {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a link object');
  const unknown = collectUnknown(record, LINK_KEYS);
  const id = requireNumber(record.id, `${path}.id`, 'link id');
  const originId = requireNumber(record.origin_id, `${path}.origin_id`, 'link origin_id');
  const originSlot = requireNumber(record.origin_slot, `${path}.origin_slot`, 'link origin_slot');
  const targetId = requireNumber(record.target_id, `${path}.target_id`, 'link target_id');
  const targetSlot = requireNumber(record.target_slot, `${path}.target_slot`, 'link target_slot');
  const type = readLinkType(record.type);
  if (type === null) fail('invalid-structure', `${path}.type`, 'expected a link type token');
  const parentId = readOptionalNullableNumber(record, 'parentId', unknown);
  return {
    id,
    originId,
    originSlot,
    targetId,
    targetSlot,
    type,
    ...(parentId !== undefined ? { parentId } : {}),
    unknown,
    extraTupleSlots: [],
  };
}

export function decodeReroute(raw: unknown, path: string): ComfyReroute {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a reroute object');
  const unknown = collectUnknown(record, REROUTE_KEYS);
  const id = requireNumber(record.id, `${path}.id`, 'reroute id');
  const pos = readPair(record.pos);
  if (!pos) fail('invalid-structure', `${path}.pos`, 'expected a [x, y] number pair');
  const linkIdsRaw = record.linkIds;
  let linkIds: number[] = [];
  if (linkIdsRaw !== undefined && linkIdsRaw !== null) {
    const arr = asArray(linkIdsRaw);
    if (!arr) {
      preserveRaw(unknown, 'linkIds', linkIdsRaw);
    } else {
      linkIds = arr.map((entry, index) =>
        requireNumber(entry, `${path}.linkIds[${index}]`, 'reroute link id'));
    }
  }
  const parentId = readOptionalNullableNumber(record, 'parentId', unknown);
  return {
    id,
    pos,
    linkIds,
    ...(parentId !== undefined ? { parentId } : {}),
    unknown,
  };
}

// ============================================================================
// Encoders
// ============================================================================

function ordered(
  known: Array<[string, unknown]>,
  unknown: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of known) {
    if (value !== undefined) out[key] = value;
  }
  for (const [key, value] of Object.entries(unknown)) out[key] = value;
  return out;
}

export function encodeNode(node: ComfyNode): Record<string, unknown> {
  return ordered([
    ['id', node.id],
    ['type', node.type],
    ['pos', [node.pos[0], node.pos[1]]],
    ['size', node.size ? [node.size[0], node.size[1]] : undefined],
    ['flags', node.flags],
    ['order', node.order],
    ['mode', node.mode],
    ['inputs', node.inputs?.map(encodeNodeInput)],
    ['outputs', node.outputs?.map(encodeNodeOutput)],
    ['properties', node.properties],
    ['widgets_values', node.widgetsValues],
    ['color', node.color],
    ['bgcolor', node.bgcolor],
    ['title', node.title],
  ], node.unknown);
}

export function encodeNodeInput(input: ComfyNodeInput): Record<string, unknown> {
  return ordered([
    ['name', input.name],
    ['type', input.type],
    ['link', input.link],
    ['slot_index', input.slotIndex],
    ['widget', input.widget],
  ], input.unknown);
}

export function encodeNodeOutput(output: ComfyNodeOutput): Record<string, unknown> {
  return ordered([
    ['name', output.name],
    ['type', output.type],
    ['links', output.links === null ? null : [...output.links]],
    ['slot_index', output.slotIndex],
  ], output.unknown);
}

export function encodeGroup(group: ComfyGroup): Record<string, unknown> {
  return ordered([
    ['id', group.id],
    ['title', group.title],
    ['bounding', group.bounding ? [...group.bounding] : undefined],
    ['color', group.color],
    ['font_size', group.fontSize],
    ['flags', group.flags],
  ], group.unknown);
}

/** Encode the v1 object link form. */
export function encodeLinkObject(link: ComfyLink): Record<string, unknown> {
  return ordered([
    ['id', link.id],
    ['origin_id', link.originId],
    ['origin_slot', link.originSlot],
    ['target_id', link.targetId],
    ['target_slot', link.targetSlot],
    ['type', link.type],
    ['parentId', link.parentId],
  ], link.unknown);
}

export function encodeReroute(reroute: ComfyReroute): Record<string, unknown> {
  return ordered([
    ['id', reroute.id],
    ['pos', [reroute.pos[0], reroute.pos[1]]],
    ['linkIds', [...reroute.linkIds]],
    ['parentId', reroute.parentId],
  ], reroute.unknown);
}

/** Shape label used by the projection's `field-type-mismatch` detail. */
export function describeJsonShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

/** Declared fields present in `unknown` are malformed-value preservations. */
export function malformedDeclaredFields(
  unknown: Record<string, unknown>,
  declared: readonly string[],
): string[] {
  return Object.keys(unknown).filter((key) => declared.includes(key)).sort();
}

export type { ComfyLinkType };
export { isPlainObject };
