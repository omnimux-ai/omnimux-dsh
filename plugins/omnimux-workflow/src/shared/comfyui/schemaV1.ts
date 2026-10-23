/**
 * ComfyUI workflow schema v1 codec.
 *
 * Root envelope:
 *   { version: 1, state{ lastGroupId, lastNodeId, lastLinkId, lastRerouteId },
 *     groups[], nodes[], links[](objects), floatingLinks[], reroutes[],
 *     extra{}, definitions? }
 *
 * Links are objects `{ id, origin_id, origin_slot, target_id, target_slot,
 * type, parentId? }`. `definitions` (subgraphs) is preserved verbatim and is
 * never materialised into canvas nodes — the projection reports it explicitly.
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
  decodeLinkObject,
  decodeNode,
  decodeReroute,
  encodeGroup,
  encodeLinkObject,
  encodeNode,
  encodeReroute,
} from './sharedParts.ts';
import type {
  ComfyGroup,
  ComfyLink,
  ComfyNode,
  ComfyReroute,
  ComfyV1State,
  ComfyWorkflowV1,
} from './types.ts';

const ROOT_KEYS = [
  'version', 'state', 'groups', 'nodes', 'links', 'floatingLinks', 'reroutes', 'extra', 'definitions',
] as const;

const STATE_KEYS = ['lastGroupId', 'lastNodeId', 'lastLinkId', 'lastRerouteId'] as const;

function decodeState(raw: unknown, path: string): ComfyV1State {
  const record = asRecord(raw);
  if (!record) fail('invalid-structure', path, 'expected a state object');
  const numbers: Record<string, number> = {};
  for (const key of STATE_KEYS) {
    const value = record[key];
    if (!isFiniteNumber(value)) {
      fail('missing-field', `${path}.${key}`, `v1 state is missing the numeric ${key} field`);
    }
    numbers[key] = value;
  }
  return {
    lastGroupId: numbers.lastGroupId as number,
    lastNodeId: numbers.lastNodeId as number,
    lastLinkId: numbers.lastLinkId as number,
    lastRerouteId: numbers.lastRerouteId as number,
    unknown: collectUnknown(record, STATE_KEYS),
  };
}

/** Parse an already-JSON-parsed v1 document. Throws `ComfyWorkflowCodecError`. */
export function decodeV1(raw: Record<string, unknown>): ComfyWorkflowV1 {
  const stateRaw = raw.state;
  if (stateRaw === undefined) fail('missing-field', 'state', 'v1 workflow is missing the state block');
  const state = decodeState(stateRaw, 'state');

  const nodesRaw = raw.nodes;
  if (nodesRaw === undefined) fail('missing-field', 'nodes', 'v1 workflow is missing the nodes array');
  const nodesArr = asArray(nodesRaw);
  if (!nodesArr) fail('invalid-structure', 'nodes', 'expected the nodes field to be an array');

  const linksRaw = raw.links;
  if (linksRaw === undefined) fail('missing-field', 'links', 'v1 workflow is missing the links array');
  const linksArr = asArray(linksRaw);
  if (!linksArr) fail('invalid-structure', 'links', 'expected the links field to be an array');

  const groupsRaw = raw.groups;
  const groupsArr = groupsRaw === undefined || groupsRaw === null ? [] : asArray(groupsRaw);
  if (!groupsArr) fail('invalid-structure', 'groups', 'expected the groups field to be an array');

  const floatingRaw = raw.floatingLinks;
  const floatingArr = floatingRaw === undefined || floatingRaw === null ? [] : asArray(floatingRaw);
  if (!floatingArr) fail('invalid-structure', 'floatingLinks', 'expected the floatingLinks field to be an array');

  const reroutesRaw = raw.reroutes;
  const reroutesArr = reroutesRaw === undefined || reroutesRaw === null ? [] : asArray(reroutesRaw);
  if (!reroutesArr) fail('invalid-structure', 'reroutes', 'expected the reroutes field to be an array');

  const extraRaw = raw.extra;
  const extra = extraRaw === undefined || extraRaw === null
    ? {}
    : asRecord(extraRaw) ?? fail('invalid-structure', 'extra', 'expected the extra field to be an object');

  const definitionsRaw = raw.definitions;
  const definitions = definitionsRaw === undefined || definitionsRaw === null
    ? undefined
    : isPlainObject(definitionsRaw) || Array.isArray(definitionsRaw)
      ? definitionsRaw
      : fail('invalid-structure', 'definitions', 'expected the definitions field to be an object or array');

  const nodes: ComfyNode[] = nodesArr.map((entry, index) => decodeNode(entry, `nodes[${index}]`));
  const links: ComfyLink[] = linksArr.map((entry, index) => decodeLinkObject(entry, `links[${index}]`));
  const groups: ComfyGroup[] = groupsArr.map((entry, index) => decodeGroup(entry, `groups[${index}]`));
  const reroutes: ComfyReroute[] = reroutesArr.map((entry, index) => decodeReroute(entry, `reroutes[${index}]`));

  return {
    format: 'v1',
    version: 1,
    state,
    groups,
    nodes,
    links,
    floatingLinks: floatingArr,
    reroutes,
    extra,
    ...(definitions !== undefined ? { definitions } : {}),
    unknown: collectUnknown(raw, ROOT_KEYS),
  };
}

/** Encode a v1 document back to a JSON-safe plain object. */
export function encodeV1(document: ComfyWorkflowV1): Record<string, unknown> {
  const state: Record<string, unknown> = {
    lastGroupId: document.state.lastGroupId,
    lastNodeId: document.state.lastNodeId,
    lastLinkId: document.state.lastLinkId,
    lastRerouteId: document.state.lastRerouteId,
  };
  for (const [key, value] of Object.entries(document.state.unknown)) state[key] = value;

  const out: Record<string, unknown> = {
    version: 1,
    state,
    groups: document.groups.map(encodeGroup),
    nodes: document.nodes.map(encodeNode),
    links: document.links.map(encodeLinkObject),
    floatingLinks: [...document.floatingLinks],
    reroutes: document.reroutes.map(encodeReroute),
    extra: { ...document.extra },
  };
  if (document.definitions !== undefined) out.definitions = document.definitions;
  for (const [key, value] of Object.entries(document.unknown)) out[key] = value;
  return out;
}

/** Create an empty v1 document skeleton (used when exporting a canvas). */
export function createEmptyV1(): ComfyWorkflowV1 {
  return {
    format: 'v1',
    version: 1,
    state: { lastGroupId: 0, lastNodeId: 0, lastLinkId: 0, lastRerouteId: 0, unknown: {} },
    groups: [],
    nodes: [],
    links: [],
    floatingLinks: [],
    reroutes: [],
    extra: {},
    unknown: {},
  };
}

/** Structural version check used by the dispatcher. */
export function looksLikeV1(raw: Record<string, unknown>): boolean {
  if (isFiniteNumber(raw.version)) return raw.version >= 1;
  return isPlainObject(raw.state);
}
