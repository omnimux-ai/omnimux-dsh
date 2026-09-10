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
 *    explicitly marked requiredInAuto: false in auto-serving-manifest.json. Default models
 *    must ALWAYS be listed.
 * 2. Default Alignment: Central catalog-defaults.json, canvas policy defaultModelId,
 *    and media route defaults must agree on default models.
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
import { CANVAS_GENERATION_POLICY } from '../plugins/omnimux-workflow/src/shared/generationPolicy.ts';
import { ASPECT_RATIO_GEOMETRIES } from '../plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/aspectRatioGeometry.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_URL = new URL('../plugins/omnimux/src/catalog/contract/auto-serving-manifest.json', import.meta.url);

export const PRIMARY_KIND_OPERATIONS = Object.freeze({
  image: 'text_to_image',
  video: 'text_to_video',
  text: 'chat',
  audio: 'text_to_speech',
});

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
    return finish(issues, null, { whitelistModelsChecked: 0, defaultModelsChecked: 0, aspectRatiosChecked: 0 });
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
      const isExemptUnlisted = manifestRow && manifestRow.requiredInAuto === false;

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

      // Allowed models must either have a listed operation or be an explicitly registered unlisted stub (requiredInAuto: false)
      if (!hasListedOp && !isExemptUnlisted) {
        issue(
          'whitelist_unlisted',
          `Model "${modelId}" in canvas ${kind} allowedModelIds is unlisted (listed=false) in hub specs. ` +
          `Canvas submitGuard will reject this model at runtime. Provide verified+live evidence or register as requiredInAuto: false.`,
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

  // 4. Diff-Aware Notice
  const changedFiles = options.changedFiles ?? detectGitModelChanges();
  const notice = changedFiles.length > 0 ? formatCrossPluginImpactNotice(changedFiles) : null;

  return finish(issues, notice, { whitelistModelsChecked, defaultModelsChecked, aspectRatiosChecked });
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
    console.log(`✅ Cross-Plugin Model Alignment OK: ${report.alignment.whitelistModelsChecked} whitelist models, ${report.alignment.defaultModelsChecked} defaults, ${report.alignment.aspectRatiosChecked} aspect ratios verified.`);
    process.exit(0);
  }
}
