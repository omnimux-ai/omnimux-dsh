/**
 * Line-level narrowing of a model declaration.
 *
 * A gateway line (a channel group) may accept far less than the model declares: the
 * per-task line behind Seedance 2.5 takes nine images, no video, one resolution and a
 * fixed length, while the model contract publishes the widest union across all lines.
 * The canvas already renders straight from the contract, so narrowing here — before the
 * declaration reaches slot layout, operation lists or parameter controls — makes every
 * downstream surface correct without touching a single renderer.
 *
 * The contract always wins: a line value the declaration rejects is dropped instead of
 * written, and an empty intersection leaves the declaration untouched rather than
 * producing a parameter with no selectable value.
 */

export interface LineParameterConstraint {
  /** The line accepts exactly this value. */
  fixed?: unknown;
  /** Restrict to these values; values the contract does not publish are never introduced. */
  only?: unknown[];
}

export interface LineConstraints {
  /** Operations this line serves; omitted means no restriction. */
  operations?: string[];
  /** Per-field narrowing of the model/operation parameter declarations. */
  parameters?: Record<string, LineParameterConstraint>;
  /** Per-input-type ceiling (`max: 0` means the line takes no such input at all). */
  inputs?: Record<string, { max?: number } | undefined>;
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : null;
}

function valueOf(option: unknown): unknown {
  const record = asRecord(option);
  return record ? record.value : option;
}

function withinBounds(range: AnyRecord, value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const min = typeof range.min === 'number' ? range.min : undefined;
  const max = typeof range.max === 'number' ? range.max : undefined;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

/** Keep only the declared options whose value is allowed, preserving labels and order. */
function restrictOptions(options: unknown[], allowed: unknown[]): unknown[] {
  return options.filter((option) => allowed.some((candidate) => Object.is(candidate, valueOf(option))));
}

/**
 * Apply one field's line constraint to a contract parameter declaration.
 * Returns `null` when the constraint cannot be honoured, so the caller keeps the contract.
 */
function applyParameterConstraint(definition: AnyRecord, constraint: LineParameterConstraint): AnyRecord | null {
  const options = Array.isArray(definition.options) ? definition.options : [];
  const range = asRecord(definition.range);

  if (typeof constraint.fixed !== 'undefined') {
    const allowed = [constraint.fixed];
    if (options.length > 0) {
      const kept = restrictOptions(options, allowed);
      if (kept.length === 0) return null;
      return { ...definition, options: kept, defaultValue: constraint.fixed, range: undefined, allowAuto: undefined };
    }
    if (range && !withinBounds(range, constraint.fixed)) return null;
    return { ...definition, options: [{ value: constraint.fixed }], defaultValue: constraint.fixed, range: undefined, allowAuto: undefined };
  }

  if (Array.isArray(constraint.only)) {
    if (options.length === 0) return null;
    const kept = restrictOptions(options, constraint.only);
    if (kept.length === 0) return null;
    const keepsDefault = kept.some((option) => Object.is(valueOf(option), definition.defaultValue));
    return { ...definition, options: kept, ...(keepsDefault ? {} : { defaultValue: valueOf(kept[0]) }) };
  }

  return null;
}

function narrowParameterMap(parameters: AnyRecord, constraints: Record<string, LineParameterConstraint>): AnyRecord {
  let changed = false;
  const next: AnyRecord = { ...parameters };
  for (const [field, constraint] of Object.entries(constraints)) {
    const definition = asRecord(parameters[field]);
    if (!definition || !constraint) continue;
    const applied = applyParameterConstraint(definition, constraint);
    if (!applied) continue;
    next[field] = applied;
    changed = true;
  }
  return changed ? next : parameters;
}

/** Drop inputs the line refuses, and lower the ceiling of the ones it accepts. */
function narrowInputs(inputs: unknown[], constraints: Record<string, { max?: number } | undefined>): unknown[] {
  const kept: unknown[] = [];
  for (const input of inputs) {
    const record = asRecord(input);
    const type = record && typeof record.type === 'string' ? record.type : '';
    const limit = constraints[type];
    if (limit && typeof limit.max === 'number') {
      if (limit.max <= 0) continue;
      const current = typeof record?.max === 'number' ? (record.max as number) : undefined;
      kept.push({ ...record, max: current === undefined ? limit.max : Math.min(current, limit.max) });
      continue;
    }
    kept.push(input);
  }
  return kept;
}

/**
 * Narrow a model declaration to what one line accepts.
 *
 * @param model Contract model declaration (never mutated).
 * @param modelId Canonical model id; empty input leaves the declaration untouched.
 * @param constraints Resolved line constraints, or nothing for automatic routing.
 */
export function narrowModelByLineConstraints<M>(model: M, modelId: string, constraints: LineConstraints | undefined): M {
  if (typeof modelId !== 'string' || !modelId) return model;
  if (!constraints || !model) return model;
  const record = asRecord(model);
  if (!record) return model;

  const operationsFilter = Array.isArray(constraints.operations) && constraints.operations.length > 0 ? constraints.operations : null;
  const parameterConstraints = constraints.parameters && Object.keys(constraints.parameters).length > 0 ? constraints.parameters : null;
  const inputConstraints = constraints.inputs && Object.keys(constraints.inputs).length > 0 ? constraints.inputs : null;
  if (!operationsFilter && !parameterConstraints && !inputConstraints) return model;

  const operations = Array.isArray(record.operations) ? record.operations : [];
  const nextOperations = operations.flatMap((operation) => {
    const operationRecord = asRecord(operation);
    if (!operationRecord) return [operation];
    if (operationsFilter && !(typeof operationRecord.id === 'string' && operationsFilter.includes(operationRecord.id))) return [];
    const nextInputs = inputConstraints && Array.isArray(operationRecord.inputs)
      ? narrowInputs(operationRecord.inputs, inputConstraints)
      : operationRecord.inputs;
    const operationParameters = asRecord(operationRecord.parameters);
    const nextParameters = parameterConstraints && operationParameters
      ? narrowParameterMap(operationParameters, parameterConstraints)
      : operationRecord.parameters;
    if (nextInputs === operationRecord.inputs && nextParameters === operationRecord.parameters) return [operation];
    return [{ ...operationRecord, inputs: nextInputs, parameters: nextParameters }];
  });

  const modelParameters = asRecord(record.parameters);
  const nextModelParameters = parameterConstraints && modelParameters
    ? narrowParameterMap(modelParameters, parameterConstraints)
    : record.parameters;

  return { ...record, operations: nextOperations, parameters: nextModelParameters } as unknown as M;
}

/** Resolves the constraints of the lines a node routes to; the canvas owns the group table. */
export type LineConstraintResolver = (modelId: string, routing: unknown) => LineConstraints;

let resolver: LineConstraintResolver | null = null;

/**
 * Register the group-table lookup.
 *
 * The table lives in the canvas while slot layout and operation lists live in shared
 * code, so the lookup is injected instead of imported. Without a resolver every surface
 * keeps the full model declaration, which is the safe default.
 */
export function setLineConstraintResolver(next: LineConstraintResolver | null): void {
  resolver = next;
}

/**
 * Narrow the routed model inside a catalog copy.
 *
 * Slot layout, operation lists and parameter controls all read the model out of the
 * catalog, so narrowing once here keeps every downstream surface honest — the slot count,
 * the input types and the operation list follow from the same declaration.
 */
export function narrowCatalogByRouting<C>(
  catalog: C | null | undefined,
  modelId: unknown,
  routing: unknown,
): C | null | undefined {
  if (!resolver || !catalog || typeof catalog !== 'object') return catalog;
  if (typeof modelId !== 'string' || !modelId) return catalog;
  const catalogRecord = catalog as unknown as Record<string, unknown>;
  const models = Array.isArray(catalogRecord.models) ? catalogRecord.models : null;
  if (!models || !models.some((model) => asRecord(model)?.id === modelId)) return catalog;
  const constraints = resolver(modelId, routing);
  if (!constraints || Object.keys(constraints).length === 0) return catalog;
  return {
    ...catalogRecord,
    models: models.map((model) => (asRecord(model)?.id === modelId
      ? narrowModelByLineConstraints(model, modelId, constraints)
      : model)),
  } as unknown as C;
}
