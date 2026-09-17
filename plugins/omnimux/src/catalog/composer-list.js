/**
 * Compose the composer's text-model list from two authorities.
 *
 * The hub's listed text bucket decides **which** models are in play; the shipped
 * profile decides **what each model looks like**. The user's visibility setting
 * can only subtract from the hub's set — a model the hub does not serve can
 * never be put back by configuration, which is what makes "the hub unlisted it"
 * a fact no local setting can contradict.
 *
 * Pure by construction: no I/O, no context. Callers supply both authorities.
 */

/** Trimmed, de-duplicated ids of catalog rows, in row order. */
function catalogIds(rows) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row && typeof row.id === 'string' ? row.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * The ids a user has hidden from the composer list.
 * @param {unknown} value
 * @returns {Set<string>}
 */
export function hiddenIdSet(value) {
  const out = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const id = typeof entry === 'string' ? entry.trim() : '';
    if (id) out.add(id);
  }
  return out;
}

/**
 * A hub-listed model the shipped profile does not describe.
 *
 * Only what the hub itself states travels: the id and its display label. Wire
 * capabilities (context window, modalities, reasoning efforts) are deliberately
 * **not** guessed — an invented context window fails mid-conversation, and an
 * over-declared modality drops the request upstream. The route's own defaults
 * apply until the shipped profile describes the model.
 *
 * @param {string} id
 * @param {unknown} hubRow
 * @returns {Record<string, unknown>}
 */
function hubOnlyModelRow(id, hubRow) {
  const row = hubRow && typeof hubRow === 'object' ? /** @type {Record<string, unknown>} */ (hubRow) : null;
  const label = typeof row?.label === 'string' && row.label.trim() ? row.label.trim() : id;
  return { id, name: label };
}

/**
 * The composer's text-model list: hub-listed models, minus the user's hidden
 * set, described by the shipped profile where it has a row.
 *
 * Order: shipped rows keep their familiar order first, so an unchanged list
 * does not reshuffle under the user; hub-only rows follow in hub order.
 *
 * @param {{
 *   hubText?: unknown,
 *   shippedModels?: unknown,
 *   hiddenIds?: unknown,
 * }} input
 * @returns {Array<Record<string, unknown>>}
 */
export function composeComposerModels(input) {
  const hubRows = Array.isArray(input?.hubText) ? input.hubText : [];
  const hubIds = catalogIds(hubRows);
  const hidden = hiddenIdSet(input?.hiddenIds);
  const shipped = Array.isArray(input?.shippedModels) ? input.shippedModels : [];

  const inHub = new Set(hubIds);
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  const emitted = new Set();

  for (const row of shipped) {
    if (!row || typeof row !== 'object') continue;
    const record = /** @type {Record<string, unknown>} */ (row);
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    if (!id || emitted.has(id) || !inHub.has(id) || hidden.has(id)) continue;
    emitted.add(id);
    out.push(structuredClone(record));
  }

  const byId = new Map();
  for (const row of hubRows) {
    const id = row && typeof row === 'object' && typeof row.id === 'string' ? row.id.trim() : '';
    if (id && !byId.has(id)) byId.set(id, row);
  }
  for (const id of hubIds) {
    if (emitted.has(id) || hidden.has(id)) continue;
    emitted.add(id);
    out.push(hubOnlyModelRow(id, byId.get(id)));
  }

  return out;
}

/** Stable JSON for any JSON-shaped value: object key order is normalized. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * Whether two model lists are the same list, compared by content rather than by
 * serialization: an unchanged list must not be rewritten, or every sync would
 * persist a no-op and churn the settings document.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function sameModelList(left, right) {
  return stableJson(Array.isArray(left) ? left : []) === stableJson(Array.isArray(right) ? right : []);
}
