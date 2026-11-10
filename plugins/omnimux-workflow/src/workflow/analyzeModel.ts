/**
 * Which model runs `video_analyze` — resolved from the hub catalog, never pinned.
 *
 * Both video understanding flows (五维拆解 / 逐镜头分镜) used to call the tool with
 * a literal model id. That made the feature hostage to the gateway catalog: a
 * rename, a retirement or a new recommended analysis model left the user with a
 * failing button and no setting to change. The hub catalog is already the
 * authority for which models exist and what each accepts, so the id comes from
 * there instead, and a catalog that offers nothing usable fails loudly with an
 * actionable message rather than reaching upstream as `unknown-model`.
 *
 * Selection order, first match wins:
 *
 *   1. a ready text row that declares `video` input (the catalog's analysis
 *      default wins among those, so a gateway recommendation is honoured);
 *   2. the catalog's analysis default when it is a ready row at all — the
 *      gateway recommended it, so it outranks "no declared modality";
 *   3. nothing: report which of the two failures happened.
 *
 * Never guesses: a row whose `executionStatus` is `unverified` or `unsupported`
 * cannot run, and an undeclared modality is not treated as support.
 */

import type { ModelExecutionStatus } from '../shared/api.ts';

/**
 * The slice of the hub catalog DTO this resolver reads.
 *
 * `defaults.analysis` deliberately stays out of the shared `CapabilityCatalog`
 * type: that DTO's `defaults` keys are indexed as material kinds elsewhere
 * (`compatKernel`'s `keyof CapabilityCatalog['defaults']`), so widening it here
 * would let "analysis" masquerade as a canvas material kind. The field is read
 * through this narrow local view instead.
 */
interface AnalysisCatalogView {
  text?: unknown;
  models?: unknown;
  defaults?: { analysis?: unknown };
}

/** Where the winning id came from; carried into logs and failure text. */
export type VideoAnalyzeModelSource = 'video-modality' | 'analysis-default';

/** Why no model could be chosen. */
export type VideoAnalyzeModelFailure = 'catalog-unavailable' | 'no-video-model';

export interface VideoAnalyzeModelResolution {
  ok: boolean;
  modelId: string;
  source: VideoAnalyzeModelSource | '';
  reason: VideoAnalyzeModelFailure | '';
}

const NO_MODEL: VideoAnalyzeModelResolution = { ok: false, modelId: '', source: '', reason: 'no-video-model' };
const NO_CATALOG: VideoAnalyzeModelResolution = { ok: false, modelId: '', source: '', reason: 'catalog-unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** One catalog row's id, or '' when the row cannot name a model. */
function rowId(row: unknown): string {
  return isRecord(row) ? text(row.id) : '';
}

/**
 * A row can execute only when the catalog does not mark it unverified or
 * unsupported. A local/legacy row without a status is treated as usable: the
 * absence of the field means the catalog never classified it, not that it failed.
 */
function isExecutable(row: unknown): boolean {
  if (!isRecord(row)) return false;
  const status = text(row.executionStatus) as ModelExecutionStatus | '';
  return status !== 'unverified' && status !== 'unsupported';
}

/** Declared input modalities of one row; empty when the row declares none. */
function modalitiesOf(row: unknown): string[] {
  if (!isRecord(row)) return [];
  const capability = row.inputCapability;
  if (!isRecord(capability)) return [];
  const modalities = capability.modalities;
  if (!Array.isArray(modalities)) return [];
  return modalities.filter((item): item is string => typeof item === 'string').map((item) => item.trim());
}

function acceptsVideo(row: unknown): boolean {
  return modalitiesOf(row).includes('video');
}

/**
 * Text-family rows, newest catalog first: `text[]` is the hub's text bucket;
 * `models[]` is the flat directory and only contributes text-output rows so an
 * image or video model can never be picked up as an analysis model.
 */
function analysisRows(catalog: AnalysisCatalogView): unknown[] {
  if (Array.isArray(catalog.text) && catalog.text.length > 0) return catalog.text;
  if (!Array.isArray(catalog.models)) return [];
  return catalog.models.filter((row) => {
    if (!isRecord(row) || !Array.isArray(row.operations)) return false;
    return row.operations.some((operation) => {
      if (!isRecord(operation)) return false;
      const output = operation.output;
      return isRecord(output) && text(output.type) === 'text';
    });
  });
}

function analysisDefaultId(catalog: AnalysisCatalogView): string {
  const defaults = catalog.defaults;
  return isRecord(defaults) ? text(defaults.analysis) : '';
}

/**
 * Choose the analysis model from one catalog DTO.
 *
 * Pure: no I/O, no caching. `catalog` is whatever the hub seam returned.
 *
 * @param catalog - the hub catalog DTO (`/omnimux/model-catalog`), or anything else.
 * @returns the chosen id plus its provenance, or the failure reason.
 */
export function selectVideoAnalyzeModel(catalog: unknown): VideoAnalyzeModelResolution {
  if (!isRecord(catalog)) return NO_CATALOG;
  const view: AnalysisCatalogView = catalog;
  const rows = analysisRows(view);
  const executable = rows.filter(isExecutable);
  if (executable.length === 0) return rows.length > 0 ? NO_MODEL : NO_CATALOG;

  const recommended = analysisDefaultId(view);
  const withVideo = executable.filter(acceptsVideo);
  if (withVideo.length > 0) {
    const preferred = recommended ? withVideo.find((row) => rowId(row) === recommended) : undefined;
    const winner = preferred ?? withVideo[0];
    return { ok: true, modelId: rowId(winner!), source: 'video-modality', reason: '' };
  }

  // No row declares video input: the gateway's own analysis recommendation is
  // still the best available statement of intent, so prefer it over failing.
  if (recommended) {
    const recommendedRow = executable.find((row) => rowId(row) === recommended);
    if (recommendedRow) {
      return { ok: true, modelId: rowId(recommendedRow), source: 'analysis-default', reason: '' };
    }
  }

  return NO_MODEL;
}

/**
 * Read the hub catalog through a seam getter and select from it.
 *
 * A missing seam, a throwing `list()` and a rejected payload all report
 * `catalog-unavailable`: callers must not fall back to a pinned id.
 *
 * @param getSeam - `deps.getSeam`; absent on test doubles that do not need it.
 * @returns the chosen id plus its provenance, or the failure reason.
 */
export function resolveVideoAnalyzeModel(
  getSeam?: (name: string) => unknown,
): VideoAnalyzeModelResolution {
  if (typeof getSeam !== 'function') return NO_CATALOG;
  let seam: unknown;
  try {
    seam = getSeam('modelCatalog');
  } catch {
    return NO_CATALOG;
  }
  if (!isRecord(seam) || typeof seam.list !== 'function') return NO_CATALOG;
  let catalog: unknown;
  try {
    catalog = (seam.list as () => unknown)();
  } catch {
    return NO_CATALOG;
  }
  return selectVideoAnalyzeModel(catalog);
}

/**
 * User-facing reason for a failed resolution.
 *
 * Both flows surface this verbatim, so it has to say what the user can do next
 * instead of naming an internal state.
 *
 * @param resolution - the failed resolution.
 * @returns a Chinese sentence naming the fix.
 */
export function describeVideoAnalyzeModelFailure(resolution: VideoAnalyzeModelResolution): string {
  if (resolution.reason === 'catalog-unavailable') {
    return '未读取到可用的模型目录，请先在「模型设置」中同步模型目录后重试';
  }
  return '模型目录中没有可执行且支持视频输入的文本模型，请先在「模型设置」中启用支持视频的模型后重试';
}