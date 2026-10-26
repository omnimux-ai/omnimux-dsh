#!/usr/bin/env node
/**
 * Cross-Plugin Model Alignment Verifier.
 *
 * Ensures that model changes in the central Hub (plugins/omnimux) are atomically
 * and consistently synchronized with all consuming domain plugins (e.g. omnimux-workflow,
 * omnimux-video, omnimux-apps).
 *
 * Checks:
 * 1. Whitelist Listedness: Canvas policy allowedModelIds and defaultModelId must be
 *    canonical and listed (listed === true with verified+live status in Hub), unless
 *    registered in auto-serving-manifest.json (a registration is not a serving claim).
 *    Default models must ALWAYS be listed. P1b: whether a model is actually on sale is
 *    decided by the gateway snapshot at runtime, so there is no local "required in auto"
 *    flag left to judge here.
 * 2. Default Alignment: Central catalog-defaults.json, canvas policy defaultModelId,
 *    and media route defaults must agree on default models. #3763 adds the
 *    speech-to-text capability seam, whose default is declared in four places (hub
 *    catalog-defaults, media route, workflow request schema, hub file-upload
 *    fallback) and must agree in all four.
 * 3. Aspect Ratio UI Coverage: All aspect ratios declared by listed models must have
 *    SVG geometries in omnimux-workflow's aspectRatioGeometry.ts.
 * 4. Diff-Aware Notice: Detects Git modifications to model files and outputs an
 *    actionable cross-plugin synchronization notice for Agents.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getContractIndex,
  loadDispositions,
  resolveModelId,
  loadCatalogDefaults,
} from '../plugins/omnimux/src/catalog/contract/index.js';
import { DEFAULT_MEDIA } from '../plugins/omnimux/src/media/route.js';
import { FILE_UPLOAD_MODEL as STT_FILE_UPLOAD_MODEL } from '../plugins/omnimux/src/media/stt.js';
import { CANVAS_GENERATION_POLICY, CANVAS_CAPABILITY_TOOLS, CANVAS_INPUT_CAPABILITY_SEAMS } from '../plugins/omnimux-workflow/src/shared/generationPolicy.ts';
import { DEFAULT_SPEECH_TO_TEXT_MODEL } from '../plugins/omnimux-workflow/src/shared/speechToText.ts';
import { ASPECT_RATIO_GEOMETRIES } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/aspectRatioGeometry.ts';
import { readCanvasCatalog } from '../plugins/omnimux-workflow/src/workflow/seam/canvasCatalog.ts';
import { resolveModelChannelGroups } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts';
import { buildModelCatalog } from '../plugins/omnimux/src/catalog/list.js';
import { resolveReadOnlySnapshot } from '../plugins/omnimux/src/catalog/cloud/current.js';

/** The canvas channel module: it may format and classify, never re-declare a line or a price. */
export const CANVAS_CHANNEL_MODULE = 'plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_URL = new URL('../plugins/omnimux/src/catalog/contract/auto-serving-manifest.json', import.meta.url);

export const PRIMARY_KIND_OPERATIONS = Object.freeze({
  image: 'text_to_image',
  video: 'text_to_video',
  text: 'chat',
  audio: 'text_to_music',
  // #3763: transcription is a capability seam, not a canvas whitelist entry, so it
  // never appeared in this table and the four places that declare its default could
  // drift apart with no gate noticing. `stt` is the media-route key.
  stt: 'speech_to_text',
});

/**
 * The four places that declare the speech-to-text default.
 *
 * The canvas policy has no `stt` whitelist, so the kind-level triad above only
 * covers two of them (hub catalog-defaults and the media route). The workflow
 * request schema and the hub's file-upload fallback are read here as well: one
 * of the four drifting alone must be a red gate.
 */
export function speechToTextDefaultSources(options = {}) {
  const catalogDefaults = options.catalogDefaults ?? loadCatalogDefaults();
  const mediaConfig = options.mediaConfig ?? DEFAULT_MEDIA;
  const seamDefaults = options.seamDefaults ?? {
    workflowSchema: DEFAULT_SPEECH_TO_TEXT_MODEL,
    hubFileUpload: STT_FILE_UPLOAD_MODEL,
  };
  return [
    { source: 'hub catalog-defaults (speech_to_text)', modelId: catalogDefaults?.byOperation?.speech_to_text ?? null },
    { source: 'hub media route (providers.omnimux.models.stt)', modelId: mediaConfig?.providers?.omnimux?.models?.stt ?? null },
    { source: 'workflow speechToText request schema', modelId: seamDefaults.workflowSchema ?? null },
    { source: 'hub stt file-upload fallback', modelId: seamDefaults.hubFileUpload ?? null },
  ];
}

/**
 * Detect files in Git diff that touch model contracts.
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function detectGitModelChanges(cwd = root) {
  try {
    const out = execFileSync('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split('\n')
      .map((line) => line.slice(3).trim())
      .filter((file) => (
        file.startsWith('plugins/omnimux/src/catalog/specs/') ||
        file.endsWith('dispositions.json') ||
        file.endsWith('catalog-defaults.json') ||
        file.endsWith('auto-serving-manifest.json')
      ));
  } catch (_e) {
    return [];
  }
}

/**
 * Format a high-visibility impact notice when model files are modified.
 * @param {string[]} changedFiles
 * @returns {string}
 */
export function formatCrossPluginImpactNotice(changedFiles) {
  const fileLines = changedFiles.map((f) => `│    * ${f}`).join('\n');
  return [
    '┌─────────────────────────────────────────────────────────────────────────────┐',
    '│ 🔔 [MODEL CHANGE DETECTED] Hub Model Contracts Modified:                   │',
    fileLines,
    '│                                                                             │',
    '│ 📌 Required Cross-Plugin Synchronization Checklist:                         │',
    '│    1. plugins/omnimux-workflow/src/shared/generationPolicy.ts              │',
    '│       -> Ensure allowedModelIds & defaultModelId are listed & updated        │',
    '│    2. plugins/omnimux-workflow/.../cfg/aspectRatioGeometry.ts               │',
    '│       -> Ensure any new aspect ratios have SVG geometry presets             │',
    '│    3. plugins/omnimux/src/catalog/contract/catalog-defaults.json            │',
    '│       -> Ensure default model by operation matches canvas defaultModelId    │',
    '│    4. plugins/omnimux/src/media/route.js                                    │',
    '│       -> Ensure DEFAULT_MEDIA.models is aligned with catalog-defaults       │',
    '│    5. Test & Acceptance:                                                    │',
    '│       -> Run `node scripts/verify-model-contracts.mjs --strict`             │',
    '│       -> Verify end-to-end canvas submission (resolveCanvasSubmission)       │',
    '└─────────────────────────────────────────────────────────────────────────────┘',
  ].join('\n');
}

/**
 * Verify cross-plugin model alignment.
 * @param {object} [options]
 * @returns {{
 *   ok: boolean,
 *   exitCode: number,
 *   source: string,
 *   issues: Array<{ level: string, code: string, message: string, modelId?: string }>,
 *   notice: string | null,
 *   alignment: {
 *     whitelistModelsChecked: number,
 *     defaultModelsChecked: number,
 *     sttDefaultsChecked: number,
 *     aspectRatiosChecked: number,
 *   }
 * }}
 */
export function verifyCrossPluginModelAlignment(options = {}) {
  const issues = [];
  const issue = (code, message, modelId) => issues.push({
    level: 'error',
    code: `cross_plugin_${code}`,
    message,
    ...(modelId ? { modelId } : {}),
  });

  let index, dispositions, catalogDefaults, policy, mediaConfig, geometries, manifest;

  try {
    index = options.index ?? getContractIndex(options.specsDir);
    dispositions = options.dispositions ?? loadDispositions();
    catalogDefaults = options.catalogDefaults ?? loadCatalogDefaults();
    policy = options.policy ?? CANVAS_GENERATION_POLICY;
    mediaConfig = options.mediaConfig ?? DEFAULT_MEDIA;
    geometries = options.aspectRatioGeometries ?? ASPECT_RATIO_GEOMETRIES;
    manifest = options.manifest ?? JSON.parse(readFileSync(options.manifestPath ?? MANIFEST_URL, 'utf8'));
  } catch (err) {
    issue('load_failed', err.message);
    return finish(issues, null, { whitelistModelsChecked: 0, defaultModelsChecked: 0, sttDefaultsChecked: 0, aspectRatiosChecked: 0 });
  }

  const governed = new Map((dispositions?.dispositions ?? []).map((row) => [row.id, row.disposition]));
  const manifestMap = new Map((manifest?.models ?? []).map((row) => [row.productId, row]));

  let whitelistModelsChecked = 0;
  let defaultModelsChecked = 0;
  let aspectRatiosChecked = 0;

  // 1. Whitelist Listedness & Canonical Check
  for (const [kind, entry] of Object.entries(policy ?? {})) {
    const defaultModel = entry.defaultModelId;
    const allowed = entry.allowedModelIds ?? [];
    const candidates = new Set([defaultModel, ...allowed].filter(Boolean));

    for (const modelId of candidates) {
      whitelistModelsChecked++;
      const resolved = resolveModelId(index, modelId);
      const isCanonical = resolved === modelId && governed.get(modelId) === 'canonical';
      if (!isCanonical) {
        issue('whitelist_not_canonical', `Model "${modelId}" in canvas ${kind} policy is not canonical in hub dispositions`, modelId);
        continue;
      }
      const model = index.get(modelId);
      if (!model) {
        issue('whitelist_unknown', `Model "${modelId}" in canvas ${kind} policy does not exist in hub specs`, modelId);
        continue;
      }

      const hasListedOp = (model.operations ?? []).some((op) => op.listed === true && op.output?.type === kind);
      const isDefault = modelId === defaultModel;
      const manifestRow = manifestMap.get(modelId);
      const isExemptUnlisted = Boolean(manifestRow);

      // Default models must ALWAYS be listed and ready.
      if (isDefault && !hasListedOp) {
        issue(
          'default_model_unlisted',
          `Default model "${modelId}" for canvas ${kind} is unlisted (listed=false) in hub specs. ` +
          `Every defaultModelId must have verified+live evidence and a listed operation.`,
          modelId,
        );
        continue;
      }

      // Allowed models must either have a listed operation or be a registered stub.
      if (!hasListedOp && !isExemptUnlisted) {
        issue(
          'whitelist_unlisted',
          `Model "${modelId}" in canvas ${kind} allowedModelIds is unlisted (listed=false) in hub specs. ` +
          `Canvas submitGuard will reject this model at runtime. Provide verified+live evidence or register it in auto-serving-manifest.json.`,
          modelId,
        );
      }
    }
  }

  // 2. Default Model Triad Alignment
  for (const [kind, primaryOp] of Object.entries(PRIMARY_KIND_OPERATIONS)) {
    defaultModelsChecked++;
    const hubDefault = catalogDefaults?.byOperation?.[primaryOp];
    const canvasDefault = policy?.[kind]?.defaultModelId;
    if (hubDefault && canvasDefault && hubDefault !== canvasDefault) {
      issue(
        'default_mismatch',
        `Default model mismatch for ${kind}: hub catalog-defaults has "${hubDefault}" for ${primaryOp}, ` +
        `but omnimux-workflow generationPolicy has "${canvasDefault}". Synchronize both default models.`,
        hubDefault,
      );
    }

    if (kind !== 'text') {
      const mediaDefault = mediaConfig?.providers?.omnimux?.models?.[kind];
      if (mediaDefault && hubDefault && mediaDefault !== hubDefault) {
        issue(
          'media_route_mismatch',
          `Default media model mismatch for ${kind}: mediaConfig.models has "${mediaDefault}" ` +
          `but hub catalog-defaults has "${hubDefault}". Synchronize route.js with catalog-defaults.json.`,
          mediaDefault,
        );
      }
    }
  }

  // 2b. Capability-seam default alignment (speech-to-text, #3763).
  // Transcription has no canvas whitelist, so the triad above reaches only two of its
  // four declarations. All four are read as one set here — the media route is counted
  // but not re-reported, so a single drift produces a single issue. A model the
  // anonymous snapshot does not sell still needs all four to name the same id.
  const sttSources = speechToTextDefaultSources({ catalogDefaults, mediaConfig, seamDefaults: options.seamDefaults });
  const sttDefault = catalogDefaults?.byOperation?.speech_to_text ?? null;
  let sttDefaultsChecked = 0;
  for (const entry of sttSources) {
    sttDefaultsChecked++;
    if (!entry.modelId) {
      issue('stt_default_missing', `Speech-to-text default is not declared by ${entry.source}.`);
      continue;
    }
    if (entry.source.includes('media route')) continue; // already reported by the triad above
    if (sttDefault && entry.modelId !== sttDefault) {
      issue(
        'stt_default_mismatch',
        `Speech-to-text default mismatch: ${entry.source} declares "${entry.modelId}" but hub ` +
        `catalog-defaults has "${sttDefault}". All four declarations must name the same model.`,
        entry.modelId,
      );
    }
  }

  // 3. Aspect Ratio UI Coverage
  if (geometries) {
    const checkedRatios = new Set();
    const models = index?.all ? index.all() : (index?.byId ? Array.from(index.byId.values()) : []);
    for (const model of models) {
      const isMedia = (model.operations ?? []).some((op) => op.listed && (op.output?.type === 'image' || op.output?.type === 'video'));
      if (!isMedia) continue;

      const ratioOpts = model.parameters?.aspectRatio?.options;
      if (Array.isArray(ratioOpts)) {
        for (const opt of ratioOpts) {
          const ratioVal = typeof opt === 'object' && opt !== null && 'value' in opt ? opt.value : opt;
          if (typeof ratioVal !== 'string' || !ratioVal.trim()) continue;
          const normalized = ratioVal.trim();
          if (checkedRatios.has(normalized)) continue;
          checkedRatios.add(normalized);
          aspectRatiosChecked++;

          if (!geometries[normalized]) {
            issue(
              'aspect_ratio_geometry_missing',
              `Aspect ratio "${normalized}" declared by listed model "${model.id}" has no SVG geometry preset ` +
              `in omnimux-workflow aspectRatioGeometry.ts. The canvas popover will fail to render this card.`,
              model.id,
            );
          }
        }
      }
    }
  }

  // 4. Channel-line parity: the canvas consumes the hub's projected channelGroups.
  //
  // The canvas may not import hub internals, so the lines travel with the catalog DTO
  // through the capabilities seam. What must hold is that the canvas's own resolution
  // of those rows is exactly the hub projection — same ids, labels, prices, constraints
  // and enabled flags — and that the canvas module declares no line set or price of its
  // own. A drift here shows the user one channel and charges for another.
  let channelGroupsChecked = 0;
  try {
    const snapshot = options.snapshot ?? resolveReadOnlySnapshot().snapshot;
    const hub = options.hubCatalog ?? buildModelCatalog({ env: {}, snapshot });
    const canvas = readCanvasCatalog((name) => (name === 'modelCatalog' ? { list: () => hub } : undefined));
    const hubById = new Map((hub.models ?? []).map((row) => [row.id, row]));
    for (const kind of ['text', 'image', 'video', 'audio']) {
      for (const row of canvas[kind] ?? []) {
        const hubRow = hubById.get(row.id);
        if (!hubRow) {
          issue('channel_row_unknown_in_hub', `Canvas ${kind} row "${row.id}" is not in the hub catalog DTO.`, row.id);
          continue;
        }
        const directory = hubRow.channelGroups ?? [];
        const delivered = row.channelGroups ?? [];
        channelGroupsChecked++;
        if (JSON.stringify(delivered) !== JSON.stringify(directory)) {
          issue(
            'channel_groups_not_directory',
            `Canvas ${kind} row "${row.id}" channelGroups differ from the hub projection. ` +
            `delivered=${JSON.stringify(delivered)} directory=${JSON.stringify(directory)}`,
            row.id,
          );
          continue;
        }
        // The canvas's own resolution must add nothing but the picker's classification flags.
        const resolved = resolveModelChannelGroups(row.id, delivered, null);
        const strip = (group) => ({
          id: group.id,
          label: group.label,
          badge: group.badge ?? null,
          wireGroup: group.wireGroup ?? null,
          pricing: group.pricing ?? null,
          constraints: group.constraints ?? null,
          sla: group.sla ?? null,
          enabled: group.enabled !== false,
          default: group.default === true,
        });
        if (JSON.stringify(resolved.map(strip)) !== JSON.stringify(directory.map(strip))) {
          issue(
            'channel_resolution_drift',
            `Canvas resolution for "${row.id}" is not the directory rows: ` +
            `${JSON.stringify(resolved.map(strip))} vs ${JSON.stringify(directory.map(strip))}`,
            row.id,
          );
        }
      }
    }
    const moduleSource = readFileSync(join(root, CANVAS_CHANNEL_MODULE), 'utf8');
    if (/MODEL_CHANNEL_GROUPS/.test(moduleSource)) {
      issue('channel_local_table_remains', `Canvas ${CANVAS_CHANNEL_MODULE} still declares a local line table.`);
    }
    if (/pointsEstimate\s*:\s*-?\d/.test(moduleSource)) {
      issue('channel_local_price_remains', `Canvas ${CANVAS_CHANNEL_MODULE} still hardcodes a points estimate.`);
    }
    // Curation must stay aligned with the directory: a curated model the canvas can offer
    // has to arrive with at least one routable line, otherwise the picker shows an empty pool.
    for (const [kind, entry] of Object.entries(policy ?? {})) {
      for (const modelId of entry.allowedModelIds ?? []) {
        const row = (canvas[kind] ?? []).find((candidate) => candidate.id === modelId);
        if (!row) continue;
        if (!Array.isArray(row.channelGroups) || row.channelGroups.length === 0) {
          issue(
            'channel_curation_without_line',
            `Canvas ${kind} policy curates "${modelId}", but the catalog projection delivers no gateway line for it.`,
            modelId,
          );
        }
      }
    }
    if (channelGroupsChecked === 0) {
      issue('channel_groups_unchecked', 'The canvas catalog exposed no channel-bearing row; the parity check proved nothing.');
    }
  } catch (err) {
    issue('channel_groups_check_failed', err.message);
  }

  // 5. Capability-seam admission (models the canvas serves outside the generative whitelists)
  // A capability tool such as audio transcription reaches its models through a contract seam, not
  // through CANVAS_GENERATION_POLICY. That path stays safe only while every model it can admit is
  // a canonical contract row with a LISTED operation on the seam, so it is gated here as well.
  const capabilitySeams = options.capabilitySeams ?? CANVAS_INPUT_CAPABILITY_SEAMS;
  const capabilityTools = options.capabilityTools ?? CANVAS_CAPABILITY_TOOLS;
  let capabilityModelsChecked = 0;
  for (const [tool, seam] of Object.entries(capabilityTools ?? {})) {
    if (!capabilitySeams.includes(seam)) {
      issue('capability_tool_unknown_seam', `Canvas capability tool "${tool}" declares seam "${seam}", which no admission rule consumes.`, tool);
    }
  }
  for (const model of index?.all?.() ?? []) {
    const bound = (model.operations ?? []).some((op) => op.listed === true
      && capabilitySeams.includes(op.implementation?.seam ?? op.execution?.seam));
    if (!bound) continue;
    capabilityModelsChecked++;
    if (resolveModelId(index, model.id) !== model.id || governed.get(model.id) !== 'canonical') {
      issue(
        'capability_not_canonical',
        `Model "${model.id}" reaches the canvas through a capability seam but is not canonical in hub dispositions. ` +
        `Capability admission must never publish an alias, tombstone or undispositioned row.`,
        model.id,
      );
    }
  }

  // 6. Diff-Aware Notice
  const changedFiles = options.changedFiles ?? detectGitModelChanges();
  const notice = changedFiles.length > 0 ? formatCrossPluginImpactNotice(changedFiles) : null;

  return finish(issues, notice, { whitelistModelsChecked, defaultModelsChecked, sttDefaultsChecked, aspectRatiosChecked, channelGroupsChecked, capabilityModelsChecked });
}

function finish(issues, notice, alignment) {
  const ok = issues.length === 0;
  return {
    ok,
    exitCode: ok ? 0 : 1,
    source: 'cross-plugin-model-alignment',
    issues,
    notice,
    alignment,
  };
}

// Standalone CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = verifyCrossPluginModelAlignment();
  if (report.notice) {
    console.log(report.notice);
  }
  if (!report.ok) {
    console.error(`❌ Cross-Plugin Model Alignment FAILED (${report.issues.length} issue(s)):`);
    for (const iss of report.issues) {
      console.error(`  - [${iss.code}] ${iss.message}`);
    }
    process.exit(1);
  } else {
    console.log(`✅ Cross-Plugin Model Alignment OK: ${report.alignment.whitelistModelsChecked} whitelist models, ${report.alignment.defaultModelsChecked} defaults, ${report.alignment.aspectRatiosChecked} aspect ratios, ${report.alignment.channelGroupsChecked ?? 0} channel groups verified.`);
    process.exit(0);
  }
}
