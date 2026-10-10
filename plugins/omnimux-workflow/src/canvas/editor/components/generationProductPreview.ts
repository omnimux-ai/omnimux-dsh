export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export interface GenerationAlternative {
  status: 'available' | 'pending';
  inputs: JsonValue;
  inputGroups: JsonValue;
  parameters: Record<string, JsonValue>;
  output: JsonValue;
  constraints: JsonValue;
}
export interface GenerationIntent {
  intent: string;
  label: string;
  status: 'available' | 'pending' | 'rejected' | 'indeterminate';
  alternatives: GenerationAlternative[];
}
export interface GenerationProduct {
  productId: string;
  label: string;
  status: GenerationIntent['status'];
  intents: GenerationIntent[];
}
export interface GenerationRequest {
  schemaVersion: 1;
  currentFingerprint: string;
  productId: string;
  intent: string;
  parameters: Record<string, JsonPrimitive>;
  assets: Record<string, JsonValue>[];
  prompt?: string;
}
export interface GenerationPreview {
  schemaVersion: 1;
  currentFingerprint: string;
  requestFingerprint?: string;
  status: 'ready' | 'pending' | 'rejected' | 'indeterminate';
  executable: false;
  issues: { code: string; field?: string; assetIndex?: number }[];
}
export interface GenerationDirectory {
  schemaVersion: 1;
  currentFingerprint: string;
  products: GenerationProduct[];
}

export type ParameterMode = 'unset' | 'text' | 'number' | 'boolean' | 'null';
export interface ParameterEntry { mode: ParameterMode; text: string }
function publicRecord(value: JsonValue, keys: string[], optional: string[] = []): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && keys.every(key => has(value, key)) && Object.keys(value).every(key => keys.includes(key) || optional.includes(key));
}
export function readDirectory(value: unknown): GenerationDirectory {
  const data = copyTransport(value);
  const statuses = ['available', 'pending', 'rejected', 'indeterminate'];
  if (!publicRecord(data, ['schemaVersion', 'currentFingerprint', 'products']) || data.schemaVersion !== 1
    || typeof data.currentFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.currentFingerprint)
    || !Array.isArray(data.products) || data.products.length !== 2) throw new TypeError('invalid_directory');
  const ids: string[] = [];
  for (const product of data.products) {
    if (!publicRecord(product, ['productId', 'label', 'status', 'intents']) || typeof product.productId !== 'string'
      || !['generation.image', 'generation.video'].includes(product.productId) || ids.includes(product.productId)
      || typeof product.label !== 'string' || !product.label || typeof product.status !== 'string' || !statuses.includes(product.status)
      || !Array.isArray(product.intents)) throw new TypeError('invalid_directory');
    ids.push(product.productId);
    const intents: string[] = [];
    for (const intent of product.intents) {
      if (!publicRecord(intent, ['intent', 'label', 'status', 'alternatives']) || typeof intent.intent !== 'string' || !intent.intent || intents.includes(intent.intent)
        || typeof intent.label !== 'string' || !intent.label || typeof intent.status !== 'string' || !statuses.includes(intent.status)
        || !Array.isArray(intent.alternatives)) throw new TypeError('invalid_directory');
      intents.push(intent.intent);
      for (const branch of intent.alternatives) {
        if (!publicRecord(branch, ['status', 'inputs', 'inputGroups', 'parameters', 'output', 'constraints'])
          || !['available', 'pending'].includes(String(branch.status)) || !Array.isArray(branch.inputs) || !Array.isArray(branch.inputGroups)
          || branch.parameters === null || typeof branch.parameters !== 'object' || Array.isArray(branch.parameters)) throw new TypeError('invalid_directory');
      }
    }
  }
  return data as unknown as GenerationDirectory;
}
const publicIssueCodes = ['invalid_request', 'unsupported_version', 'unknown_product', 'unknown_intent', 'unknown_parameter', 'catalog_unavailable', 'stale_fingerprint', 'request_too_large', 'qualification_pending', 'qualification_rejected', 'default_ambiguous', 'parameter_invalid', 'parameter_unresolved', 'input_invalid', 'input_pending', 'input_unresolved', 'unavailable'];
export function readPreview(value: unknown): GenerationPreview {
  const data = copyTransport(value);
  if (!publicRecord(data, ['schemaVersion', 'currentFingerprint', 'status', 'executable', 'issues'], ['requestFingerprint']) || data.schemaVersion !== 1
    || typeof data.currentFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.currentFingerprint)
    || !['ready', 'pending', 'rejected', 'indeterminate'].includes(String(data.status)) || data.executable !== false
    || (has(data, 'requestFingerprint') && (typeof data.requestFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(data.requestFingerprint)))
    || !Array.isArray(data.issues) || data.issues.some(issue => !publicRecord(issue, ['code'], ['field', 'assetIndex']) || typeof issue.code !== 'string' || !publicIssueCodes.includes(issue.code)
      || (has(issue, 'field') && (typeof issue.field !== 'string' || !issue.field))
      || (has(issue, 'assetIndex') && (typeof issue.assetIndex !== 'number' || !Number.isSafeInteger(issue.assetIndex) || issue.assetIndex < 0)))) throw new TypeError('invalid_preview');
  return data as unknown as GenerationPreview;
}

export function parameterValues(entries: Record<string, ParameterEntry>): Record<string, JsonPrimitive> {
  const result: Record<string, JsonPrimitive> = {};
  for (const [key, entry] of Object.entries(entries)) {
    let value: JsonPrimitive;
    if (entry.mode === 'unset') continue;
    if (entry.mode === 'text') value = entry.text;
    else if (entry.mode === 'null') value = null;
    else if (entry.mode === 'boolean' && /^(true|false)$/.test(entry.text)) value = entry.text === 'true';
    else if (entry.mode === 'number' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(entry.text) && Number.isFinite(Number(entry.text))) value = Number(entry.text);
    else throw new TypeError('parameter_incomplete');
    Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

const assetKeys = ['type', 'pathOrUrl', 'role', 'targetSlot', 'mime', 'sizeBytes', 'durationSec', 'sourceNodeId', 'edgeId', 'outputId', 'outputVersion', 'originalName', 'dimensions'] as const;
const addressKeys = ['pathOrUrl', 'url', 'path', 'realPath', 'relativePath', 'mediaUrl'] as const;
export const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const put = (value: Record<string, JsonValue>, key: string, item: JsonValue) => Object.defineProperty(value, key, { value: item, enumerable: true, configurable: true, writable: true });

/** Inspect descriptors before reading values; this is transport safety, not media or capability validation. */
function descriptors(value: unknown, array = false): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== 'object' || Object.getOwnPropertySymbols(value).length) throw new TypeError('unsafe_source');
  const prototype = Object.getPrototypeOf(value);
  if (array ? !Array.isArray(value) || !Array.isArray(prototype) || Object.getPrototypeOf(Object.getPrototypeOf(prototype)) !== null : prototype !== Object.prototype && prototype !== null) throw new TypeError('unsafe_source');
  const fields = Object.getOwnPropertyDescriptors(value);
  for (const [key, field] of Object.entries(fields)) {
    if (!has(field, 'value') || (!field.enumerable && !(array && key === 'length'))) throw new TypeError('unsafe_source');
  }
  if (array) {
    const length = fields.length!.value as number;
    if (Object.keys(fields).length !== length + 1) throw new TypeError('unsafe_source');
    for (let index = 0; index < length; index++) if (!has(fields, String(index))) throw new TypeError('unsafe_source');
  }
  return fields;
}
export function copyTransport(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (!value || typeof value !== 'object' || ancestors.has(value)) throw new TypeError('unsafe_source');
  const fields = descriptors(value, Array.isArray(value));
  const next = new Set(ancestors); next.add(value);
  if (Array.isArray(value)) return Object.freeze(Array.from({ length: fields.length!.value }, (_, index) => copyTransport(fields[String(index)]!.value, next))) as JsonValue[];
  const result: Record<string, JsonValue> = {};
  for (const [key, field] of Object.entries(fields)) put(result, key, copyTransport(field.value, next));
  return Object.freeze(result);
}
export interface AssetSource {
  nodeId: string;
  index?: number;
  edgeId?: string;
  label: string;
  asset?: Record<string, JsonValue>;
  addresses: { key: string; value: string }[];
  signature: string;
  mimeOptions?: { key: string; value: JsonValue }[];
  addressChoice?: string;
  mimeChoice?: string;
  identityMismatch?: boolean;
  identityConfirmed?: boolean;
  branchChoice?: number;
  roleChoice?: string;
  slotChoice?: string;
  roleNeedsConfirmation?: boolean;
  slotNeedsConfirmation?: boolean;
  problem?: 'unsafe_source' | 'source_missing';
}
function snapshotSource(node: unknown, index: number | undefined, edge?: unknown): Omit<AssetSource, 'label'> {
  const edgeSnapshot = edge === undefined ? null : copyTransport(edge);
  const edgeId = edgeSnapshot && typeof edgeSnapshot === 'object' && !Array.isArray(edgeSnapshot) && typeof edgeSnapshot.id === 'string' ? edgeSnapshot.id : undefined;
  const nf = descriptors(node), nodeId = nf.id?.value;
  if (typeof nodeId !== 'string') throw new TypeError('unsafe_source');
  const data = descriptors(nf.data?.value);
  let raw: unknown = nf.data!.value;
  if (index !== undefined) {
    const array = descriptors(data.mediaAssets?.value, true);
    if (!has(array, String(index))) throw new TypeError('source_missing');
    raw = array[String(index)]!.value;
  }
  const fields = descriptors(raw);
  if (has(fields, 'toJSON') || Object.values(fields).some(field => field.value === undefined || ['function', 'symbol', 'bigint'].includes(typeof field.value) || (typeof field.value === 'number' && !Number.isFinite(field.value)))) throw new TypeError('unsafe_source');
  const asset: Record<string, JsonValue> = {};
  for (const key of assetKeys) if (has(fields, key)) put(asset, key, copyTransport(fields[key]!.value));
  if (has(fields, 'mimeType')) {
    const alias = copyTransport(fields.mimeType!.value);
    if (!has(asset, 'mime')) put(asset, 'mime', alias);
  }
  const addresses: AssetSource['addresses'] = [];
  for (const key of addressKeys) if (has(fields, key)) {
    const address = copyTransport(fields[key]!.value);
    if (typeof address === 'string' && !addresses.some(item => item.value === address)) addresses.push({ key, value: address });
  }
  if (!has(asset, 'sourceNodeId')) put(asset, 'sourceNodeId', nodeId);
  if (edgeId !== undefined && !has(asset, 'edgeId')) put(asset, 'edgeId', edgeId);
  if (!has(asset, 'pathOrUrl')) put(asset, 'pathOrUrl', addresses.length === 1 ? addresses[0]!.value : '');
  const mimeAlias = has(fields, 'mimeType') ? copyTransport(fields.mimeType!.value) : null;
  const mimeOptions = has(fields, 'mime') && has(fields, 'mimeType') && !Object.is(asset.mime, mimeAlias)
    ? [{ key: 'mime', value: asset.mime! }, { key: 'mimeType', value: mimeAlias }] : undefined;
  const identityMismatch = (has(fields, 'sourceNodeId') && !Object.is(asset.sourceNodeId, nodeId)) || (has(fields, 'edgeId') && !Object.is(asset.edgeId, edgeId));
  return { nodeId, index, edgeId, asset: Object.freeze(asset), addresses, mimeOptions, identityMismatch,
    signature: JSON.stringify([copyTransport(raw), edgeSnapshot, asset, addresses, has(fields, 'mimeType'), mimeAlias]) };
}

export function branchChoices(alternative: GenerationAlternative | undefined, field: 'role' | 'slot'): string[] {
  const values: string[] = [];
  if (Array.isArray(alternative?.inputs)) for (const input of alternative.inputs) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const value = input[field];
      for (const item of Array.isArray(value) ? value : [value]) if (typeof item === 'string' && !values.includes(item)) values.push(item);
    }
  }
  return values;
}

export function transportAsset(source: AssetSource): Record<string, JsonValue> {
  if (source.problem || !source.asset || source.roleNeedsConfirmation || source.slotNeedsConfirmation || (source.addresses.length > 1 && !source.addressChoice)
    || (source.mimeOptions && !source.mimeChoice) || (source.identityMismatch && !source.identityConfirmed)) throw new TypeError('source_unconfirmed');
  const result = copyTransport(source.asset) as Record<string, JsonValue>;
  const editable: Record<string, JsonValue> = {};
  for (const key of Object.keys(result)) put(editable, key, result[key]!);
  if (source.addressChoice) {
    const address = source.addresses.find(item => item.key === source.addressChoice);
    if (!address) throw new TypeError('source_unconfirmed');
    put(editable, 'pathOrUrl', address.value);
  }
  if (source.mimeChoice) {
    const mime = source.mimeOptions?.find(item => item.key === source.mimeChoice);
    if (!mime) throw new TypeError('source_unconfirmed');
    put(editable, 'mime', mime.value);
  }
  if (source.roleChoice !== undefined) put(editable, 'role', source.roleChoice);
  if (source.slotChoice !== undefined) put(editable, 'targetSlot', source.slotChoice);
  return copyTransport(editable) as Record<string, JsonValue>;
}

/** All original items remain in the source list, including blocked rows. No legacy reader or inferred identities. */
export function listAssetSources(nodes: readonly unknown[], edges: readonly unknown[]): AssetSource[] {
  const sources: AssetSource[] = [];
  let nodeFields: Record<string, PropertyDescriptor>, edgeFields: Record<string, PropertyDescriptor>;
  try { nodeFields = descriptors(nodes, true); edgeFields = descriptors(edges, true); }
  catch { return [{ nodeId: '', label: '?', addresses: [], signature: 'unsafe_source', problem: 'unsafe_source' }]; }
  for (let nodeIndex = 0; nodeIndex < nodeFields.length!.value; nodeIndex++) {
    const node = nodeFields[String(nodeIndex)]!.value;
    let nodeId = '', length: number | undefined, blocked = false;
    try {
      const fields = descriptors(node); nodeId = fields.id?.value;
      if (typeof nodeId !== 'string') throw new TypeError('unsafe_source');
      const data = descriptors(fields.data?.value);
      if (has(data, 'mediaAssets')) {
        const raw = data.mediaAssets!.value;
        // Length is inspected without invoking array index accessors, even for blocked arrays.
        const lengthField = raw && typeof raw === 'object' ? Object.getOwnPropertyDescriptor(raw, 'length') : undefined;
        length = lengthField && has(lengthField, 'value') && Number.isSafeInteger(lengthField.value) && lengthField.value >= 0 ? lengthField.value : 1;
        try { descriptors(raw, true); } catch { blocked = true; }
      } else if (!addressKeys.some(key => has(data, key))) continue;
    } catch { blocked = true; }
    const outgoing: { id: string; original: unknown }[] = [];
    for (let edgeIndex = 0; edgeIndex < edgeFields.length!.value; edgeIndex++) {
      const edge = edgeFields[String(edgeIndex)]!.value;
      try { const f = descriptors(edge); if (f.source?.value === nodeId && typeof f.id?.value === 'string') outgoing.push({ id: f.id.value, original: edge }); } catch { /* Invalid edges do not become selectable identities. */ }
    }
    for (let item = 0; item < (length ?? 1); item++) {
      const index = length === undefined ? undefined : item;
      for (const edge of [undefined, ...outgoing]) {
        const edgeId = edge?.id;
        const label = `${nodeId || '?'}${index === undefined ? '' : ` [${index}]`}${edgeId === undefined ? '' : ` / ${edgeId}`}`;
        try {
          if (blocked) throw new TypeError('unsafe_source');
          sources.push({ ...snapshotSource(node, index, edge?.original), label });
        } catch {
          sources.push({ nodeId, index, edgeId, label, addresses: [], signature: 'unsafe_source', problem: 'unsafe_source' });
        }
      }
    }
  }
  return sources;
}
