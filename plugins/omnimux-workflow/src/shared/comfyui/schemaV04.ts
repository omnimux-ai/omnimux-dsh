/**
 * ComfyUI workflow schema v0.4 (legacy) codec.
 *
 * Root envelope:
 *   { last_node_id, last_link_id, nodes[], links[](6-tuples), groups[],
 *     config{}, extra{ ds:{ offset, scale } }, version }
 *
 * `links` entries are positional tuples
 *   [linkId, origin_id, origin_slot, target_id, target_slot, type]
 * and are normalised to objects internally; extra tuple slots are preserved
 * so a decode/encode round-trip stays lossless.
 *
 * Lossless policy: `nodes` / `links` must be arrays (structural, loud error);
 * declared optional root fields with an unexpected shape keep their original
 * value in `unknown` (re-emitted on encode, reported by the projection as
 * `field-type-mismatch`) instead of being dropped.
 */

import { fail } from './errors.ts';
import {
  asArray,
  asRecord,
  collectUnknown,
  isFiniteNumber,
  isPlainObject,
} from './structure.ts';
import {
  decodeGroup,
  decodeNode,
  encodeGroup,
  encodeNode,
  readOptionalNumber,
  readOptionalPair,
} from './sharedParts.ts';
import type {
  ComfyGroup,
  ComfyLink,
  ComfyNode,
  ComfyV04Extra,
  ComfyWorkflowV04,
} from './types.ts';

export const DECLARED_V04_ROOT_FIELDS: readonly string[] = [
  'last_node_id', 'last_link_id', 'nodes', 'links', 'groups', 'config', 'extra', 'version',
];

const ROOT_KEYS = DECLARED_V04_ROOT_FIELDS;
const EXTRA_KEYS: readonly string[] = ['ds'];
const DS_KEYS: readonly string[] = ['offset', 'scale'];

/** Decode one v0.4 link tuple. */
export function decodeLinkTuple(raw: unknown, path: string): ComfyLink {
  const arr = asArray(raw);
  if (!arr) fail('invalid-structure', path, 'expected a link tuple array');
  if (arr.length < 6) {
    fail('invalid-structure', path, `expected a 6-element link tuple, got ${arr.length}`);
  }
  const [id, originId, originSlot, targetId, targetSlot, type] = arr;
  if (!isFiniteNumber(id)) fail('invalid-structure', `${path}[0]`, 'link id must be a finite number');
  if (!isFiniteNumber(originId)) fail('invalid-structure', `${path}[1]`, 'origin_id must be a finite number');
  if (!isFiniteNumber(originSlot)) fail('invalid-structure', `${path}[2]`, 'origin_slot must be a finite number');
  if (!isFiniteNumber(targetId)) fail('invalid-structure', `${path}[3]`, 'target_id must be a finite number');
  if (!isFiniteNumber(targetSlot)) fail('invalid-structure', `${path}[4]`, 'target_slot must be a finite number');
  const linkType = typeof type === 'string' || isFiniteNumber(type) ? type : null;
  if (linkType === null) fail('invalid-structure', `${path}[5]`, 'link type must be a string or number');
  return {
    id,
    originId,
    originSlot,
    targetId,
    targetSlot,
    type: linkType,
    unknown: {},
    extraTupleSlots: arr.slice(6),
  };
}

/** Encode a normalised link back to the v0.4 tuple form. */
export function encodeLinkTuple(link: ComfyLink): unknown[] {
  return [
    link.id,
    link.originId,
    link.originSlot,
    link.targetId,
    link.targetSlot,
    link.type,
    ...link.extraTupleSlots,
  ];
}

function decodeExtraRecord(record: Record<string, unknown>): ComfyV04Extra {
  const unknown = collectUnknown(record, EXTRA_KEYS);
  const dsValue = record.ds;
  let ds: ComfyV04Extra['ds'];
  if (dsValue !== undefined) {
    const dsRecord = asRecord(dsValue);
    if (!dsRecord) {
      // Unexpected shape (incl. null): preserve verbatim.
      unknown.ds = dsValue;
    } else {
      const dsUnknown = collectUnknown(dsRecord, DS_KEYS);
      const offset = readOptionalPair(dsRecord, 'offset', dsUnknown);
      const scale = readOptionalNumber(dsRecord, 'scale', dsUnknown);
      ds = {
        ...(offset !== undefined ? { offset } : {}),
        ...(scale !== undefined ? { scale } : {}),
        unknown: dsUnknown,
      };
    }
  }
  return {
    ...(ds !== undefined ? { ds } : {}),
    unknown,
  };
}

/** Parse an already-JSON-parsed v0.4 document. Throws `ComfyWorkflowCodecError`. */
export function decodeV04(raw: Record<string, unknown>): ComfyWorkflowV04 {
  const unknown = collectUnknown(raw, ROOT_KEYS);

  const versionRaw = raw.version;
  const version = isFiniteNumber(versionRaw) ? versionRaw : 0.4;
  if (versionRaw !== undefined && !isFiniteNumber(versionRaw)) {
    // A non-numeric version cannot be represented in the typed field; keep it
    // verbatim so the encoder restores the original token.
    unknown.version = versionRaw;
  }

  const nodesRaw = raw.nodes;
  if (nodesRaw === undefined) fail('missing-field', 'nodes', 'v0.4 workflow is missing the nodes array');
  const nodesArr = asArray(nodesRaw);
  if (!nodesArr) fail('invalid-structure', 'nodes', 'expected the nodes field to be an array');

  const linksRaw = raw.links;
  if (linksRaw === undefined) fail('missing-field', 'links', 'v0.4 workflow is missing the links array');
  const linksArr = asArray(linksRaw);
  if (!linksArr) fail('invalid-structure', 'links', 'expected the links field to be an array');

  const groupsRaw = raw.groups;
  const groupsArr = groupsRaw === undefined || groupsRaw === null ? [] : asArray(groupsRaw);
  if (!groupsArr) fail('invalid-structure', 'groups', 'expected the groups field to be an array');

  const configRaw = raw.config;
  let config: Record<string, unknown> = {};
  if (configRaw !== undefined) {
    const configRecord = asRecord(configRaw);
    if (configRecord) config = configRecord;
    else unknown.config = configRaw;
  }

  const extraRaw = raw.extra;
  let extra: ComfyV04Extra = { unknown: {} };
  if (extraRaw !== undefined) {
    const extraRecord = asRecord(extraRaw);
    if (extraRecord) extra = decodeExtraRecord(extraRecord);
    else unknown.extra = extraRaw;
  }

  const nodes: ComfyNode[] = nodesArr.map((entry, index) => decodeNode(entry, `nodes[${index}]`));
  const links: ComfyLink[] = linksArr.map((entry, index) => decodeLinkTuple(entry, `links[${index}]`));
  const groups: ComfyGroup[] = groupsArr.map((entry, index) => decodeGroup(entry, `groups[${index}]`));

  const lastNodeIdRaw = raw.last_node_id;
  let lastNodeId: number;
  if (isFiniteNumber(lastNodeIdRaw)) {
    lastNodeId = lastNodeIdRaw;
  } else {
    if (lastNodeIdRaw !== undefined) unknown.last_node_id = lastNodeIdRaw;
    lastNodeId = nodes.reduce((max, node) => Math.max(max, node.id), 0);
  }
  const lastLinkIdRaw = raw.last_link_id;
  let lastLinkId: number;
  if (isFiniteNumber(lastLinkIdRaw)) {
    lastLinkId = lastLinkIdRaw;
  } else {
    if (lastLinkIdRaw !== undefined) unknown.last_link_id = lastLinkIdRaw;
    lastLinkId = links.reduce((max, link) => Math.max(max, link.id), 0);
  }

  return {
    format: 'v0.4',
    version,
    lastNodeId,
    lastLinkId,
    nodes,
    links,
    groups,
    config,
    extra,
    unknown,
  };
}

/** Encode a v0.4 document back to a JSON-safe plain object. */
export function encodeV04(document: ComfyWorkflowV04): Record<string, unknown> {
  const out: Record<string, unknown> = {
    last_node_id: document.lastNodeId,
    last_link_id: document.lastLinkId,
    nodes: document.nodes.map(encodeNode),
    links: document.links.map(encodeLinkTuple),
    groups: document.groups.map(encodeGroup),
    config: document.config,
    extra: encodeExtra(document.extra),
    version: document.version,
  };
  for (const [key, value] of Object.entries(document.unknown)) out[key] = value;
  return out;
}

function encodeExtra(extra: ComfyV04Extra): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (extra.ds !== undefined) {
    const ds: Record<string, unknown> = {};
    if (extra.ds.offset !== undefined) ds.offset = [...extra.ds.offset];
    if (extra.ds.scale !== undefined) ds.scale = extra.ds.scale;
    for (const [key, value] of Object.entries(extra.ds.unknown)) ds[key] = value;
    out.ds = ds;
  }
  for (const [key, value] of Object.entries(extra.unknown)) out[key] = value;
  return out;
}

/** Create an empty v0.4 document skeleton (used when exporting a canvas). */
export function createEmptyV04(): ComfyWorkflowV04 {
  return {
    format: 'v0.4',
    version: 0.4,
    lastNodeId: 0,
    lastLinkId: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    extra: { unknown: {} },
    unknown: {},
  };
}

/** Structural version check used by the dispatcher. */
export function looksLikeV04(raw: Record<string, unknown>): boolean {
  if (isFiniteNumber(raw.version)) return raw.version < 1;
  if (isPlainObject(raw.state) && raw.last_node_id === undefined) return false;
  return isFiniteNumber(raw.last_node_id) || Array.isArray(raw.nodes);
}
