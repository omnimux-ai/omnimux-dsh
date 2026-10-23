/**
 * Shared node / group / link-object decoders for the ComfyUI workflow codec.
 *
 * Both schema generations use the same node and group shapes; only the root
 * envelope and the link representation differ (v0.4 tuples vs v1 objects).
 * Keeping this in one place means the two version modules stay thin and the
 * round-trip guarantees are identical.
 */

import { fail } from './errors.ts';
import {
  asArray,
  asRecord,
  collectUnknown,
  isFiniteNumber,
  isPlainObject,
  optionalNumber,
  optionalString,
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

const NODE_KEYS = [
  'id', 'type', 'pos', 'size', 'flags', 'order', 'mode',
  'inputs', 'outputs', 'properties', 'widgets_values', 'color', 'bgcolor', 'title',
] as const;

const INPUT_KEYS = ['name', 'type', 'link', 'slot_index', 'widget'] as const;
const OUTPUT_KEYS = ['name', 'type', 'links', 'slot_index'] as const;
const GROUP_KEYS = ['id', 'title', 'bounding', 'color', 'font_size', 'flags'] as const;
const LINK_KEYS = [
  'id', 'origin_id', 'origin_slot', 'target_id', 'target_slot', 'type', 'parentId',
] as const;
const REROUTE_KEYS = ['id', 'pos', 'linkIds', 'parentId'] as const;

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

function decodeNodeInput(raw: unknown, path: string): ComfyNodeInput {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected an input port object');
  const name = requireString(record.name, `${path}.name`, 'input name');
  const type = readLinkType(record.type);
  if (type === null) fail('invalid-structure', `${path}.type`, 'expected an input type token');
  const linkValue = record.link;
  let link: number | null = null;
  if (linkValue !== undefined && linkValue !== null) {
    link = requireNumber(linkValue, `${path}.link`, 'input link id');
  }
  const slotIndex = optionalNumber(record, 'slot_index');
  const widget = record.widget === undefined || record.widget === null
    ? undefined
    : asRecord(record.widget) ?? fail('invalid-structure', `${path}.widget`, 'expected a widget object');
  return {
    name,
    type,
    link,
    ...(slotIndex !== undefined ? { slotIndex } : {}),
    ...(widget !== undefined ? { widget } : {}),
    unknown: collectUnknown(record, INPUT_KEYS),
  };
}

function decodeNodeOutput(raw: unknown, path: string): ComfyNodeOutput {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected an output port object');
  const name = requireString(record.name, `${path}.name`, 'output name');
  const type = readLinkType(record.type);
  if (type === null) fail('invalid-structure', `${path}.type`, 'expected an output type token');
  const linksValue = record.links;
  let links: number[] | null = null;
  if (linksValue !== undefined && linksValue !== null) {
    const arr = asArray(linksValue);
    if (!arr) fail('invalid-structure', `${path}.links`, 'expected an array of link ids');
    links = arr.map((entry, index) =>
      requireNumber(entry, `${path}.links[${index}]`, 'link id'));
  }
  const slotIndex = optionalNumber(record, 'slot_index');
  return {
    name,
    type,
    links,
    ...(slotIndex !== undefined ? { slotIndex } : {}),
    unknown: collectUnknown(record, OUTPUT_KEYS),
  };
}

export function decodeNode(raw: unknown, path: string): ComfyNode {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a node object');
  const id = requireNumber(record.id, `${path}.id`, 'node id');
  const type = requireString(record.type, `${path}.type`, 'node type');
  const pos = readPair(record.pos);
  if (!pos) fail('invalid-structure', `${path}.pos`, 'expected a [x, y] number pair');

  const size = record.size === undefined || record.size === null
    ? undefined
    : readPair(record.size) ?? fail('invalid-structure', `${path}.size`, 'expected a [width, height] number pair');

  const flags = record.flags === undefined || record.flags === null
    ? undefined
    : asRecord(record.flags) ?? fail('invalid-structure', `${path}.flags`, 'expected a flags object');

  const inputsValue = record.inputs;
  const inputs = inputsValue === undefined || inputsValue === null
    ? undefined
    : (() => {
        const arr = asArray(inputsValue);
        if (!arr) fail('invalid-structure', `${path}.inputs`, 'expected an inputs array');
        return arr.map((entry, index) => decodeNodeInput(entry, `${path}.inputs[${index}]`));
      })();

  const outputsValue = record.outputs;
  const outputs = outputsValue === undefined || outputsValue === null
    ? undefined
    : (() => {
        const arr = asArray(outputsValue);
        if (!arr) fail('invalid-structure', `${path}.outputs`, 'expected an outputs array');
        return arr.map((entry, index) => decodeNodeOutput(entry, `${path}.outputs[${index}]`));
      })();

  const properties = record.properties === undefined || record.properties === null
    ? undefined
    : asRecord(record.properties) ?? fail('invalid-structure', `${path}.properties`, 'expected a properties object');

  const widgetsValue = record.widgets_values;
  const widgetsValues = widgetsValue === undefined || widgetsValue === null
    ? undefined
    : asArray(widgetsValue) ?? fail('invalid-structure', `${path}.widgets_values`, 'expected a widgets_values array');

  const order = optionalNumber(record, 'order');
  const mode = optionalNumber(record, 'mode');
  const color = optionalString(record, 'color');
  const bgcolor = optionalString(record, 'bgcolor');
  const title = optionalString(record, 'title');

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
    unknown: collectUnknown(record, NODE_KEYS),
  };
}

export function decodeGroup(raw: unknown, path: string): ComfyGroup {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a group object');
  const id = optionalNumber(record, 'id');
  const title = optionalString(record, 'title');
  const bounding = record.bounding === undefined || record.bounding === null
    ? undefined
    : readQuad(record.bounding)
      ?? fail('invalid-structure', `${path}.bounding`, 'expected a [x, y, width, height] number quad');
  const color = optionalString(record, 'color');
  const fontSize = optionalNumber(record, 'font_size');
  const flags = record.flags === undefined || record.flags === null
    ? undefined
    : asRecord(record.flags) ?? fail('invalid-structure', `${path}.flags`, 'expected a flags object');
  return {
    ...(id !== undefined ? { id } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(bounding !== undefined ? { bounding } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(flags !== undefined ? { flags } : {}),
    unknown: collectUnknown(record, GROUP_KEYS),
  };
}

/** Decode the v1 object link form. */
export function decodeLinkObject(raw: unknown, path: string): ComfyLink {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a link object');
  const id = requireNumber(record.id, `${path}.id`, 'link id');
  const originId = requireNumber(record.origin_id, `${path}.origin_id`, 'link origin_id');
  const originSlot = requireNumber(record.origin_slot, `${path}.origin_slot`, 'link origin_slot');
  const targetId = requireNumber(record.target_id, `${path}.target_id`, 'link target_id');
  const targetSlot = requireNumber(record.target_slot, `${path}.target_slot`, 'link target_slot');
  const type = readLinkType(record.type);
  if (type === null) fail('invalid-structure', `${path}.type`, 'expected a link type token');
  const parentIdValue = record.parentId;
  let parentId: number | null | undefined;
  if (parentIdValue !== undefined) {
    parentId = parentIdValue === null
      ? null
      : requireNumber(parentIdValue, `${path}.parentId`, 'link parentId');
  }
  return {
    id,
    originId,
    originSlot,
    targetId,
    targetSlot,
    type,
    ...(parentId !== undefined ? { parentId } : {}),
    unknown: collectUnknown(record, LINK_KEYS),
    extraTupleSlots: [],
  };
}

export function decodeReroute(raw: unknown, path: string): ComfyReroute {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a reroute object');
  const id = requireNumber(record.id, `${path}.id`, 'reroute id');
  const pos = readPair(record.pos);
  if (!pos) fail('invalid-structure', `${path}.pos`, 'expected a [x, y] number pair');
  const linkIdsRaw = record.linkIds;
  const linkIdsArr = linkIdsRaw === undefined || linkIdsRaw === null ? [] : asArray(linkIdsRaw);
  if (!linkIdsArr) fail('invalid-structure', `${path}.linkIds`, 'expected an array of link ids');
  const linkIds = linkIdsArr.map((entry, index) =>
    requireNumber(entry, `${path}.linkIds[${index}]`, 'reroute link id'));
  const parentIdValue = record.parentId;
  let parentId: number | null | undefined;
  if (parentIdValue !== undefined) {
    parentId = parentIdValue === null
      ? null
      : requireNumber(parentIdValue, `${path}.parentId`, 'reroute parentId');
  }
  return {
    id,
    pos,
    linkIds,
    ...(parentId !== undefined ? { parentId } : {}),
    unknown: collectUnknown(record, REROUTE_KEYS),
  };
}

// ============================================================================
// Encoders
// ============================================================================

function ordered(known: Array<[string, unknown]>, unknown: Record<string, unknown>): Record<string, unknown> {
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

export type { ComfyLinkType };
