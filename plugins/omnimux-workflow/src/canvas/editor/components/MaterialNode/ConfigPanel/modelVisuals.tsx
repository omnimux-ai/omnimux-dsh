/**
 * @file plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/modelVisuals.tsx
 * Visual presentation metadata (brand icons, badges, subtitles) for model selector dropdowns.
 *
 * Badges and subtitles resolve from the contract `family` first: catalog rows carry it, so an
 * upstream canonical rename (e.g. `midjourney-8.1` → `mj-v8-1`) keeps its presentation instead of
 * silently dropping it. The id-prefix table is a fallback for legacy catalogs that project no
 * family, and cannot be the only path — that is exactly how the rename broke this once.
 */

import React from 'react';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';

export interface ModelVisualsResult {
  icon: React.ReactNode;
  badge?: string;
  subtitle?: string;
}

/** Catalog context for one model row; both fields are optional (legacy catalogs omit them). */
export interface ModelVisualsContext {
  /** Contract `family` of the row (e.g. `midjourney`, `nanobanana`, `openai`). */
  family?: string;
  /** Output type the picker renders for; disambiguates families that span modalities. */
  kind?: string;
}

interface VisualRule {
  badge?: string;
  getSubtitle?: (id: string) => string;
}

/**
 * Family-keyed rules. `kind` guards families that span output types (e.g. `openai` covers both
 * text and image rows), so a text model never inherits the image badge/subtitle.
 */
const FAMILY_RULES: ReadonlyArray<readonly [string, VisualRule & { kind?: string }]> = [
  ['nanobanana', { kind: 'image', badge: 'Yearly -20%', getSubtitle: () => 'auto-4K' }],
  [
    'seedream',
    {
      kind: 'image',
      badge: 'Yearly -20%',
      getSubtitle: (id) => (id.includes('5.0') || id.includes('5-0') ? '1K-2K' : '2K-4K'),
    },
  ],
  [
    'midjourney',
    {
      kind: 'image',
      badge: 'Yearly -20%',
      getSubtitle: (id) => (id.includes('8.1') || id.includes('8-1') ? '2K' : '1080P'),
    },
  ],
  ['openai', { kind: 'image', badge: 'Yearly -20%', getSubtitle: () => '1k-4k' }],
  [
    'kling',
    {
      kind: 'video',
      getSubtitle: (id) => {
        if (id === 'kling-o3') return '4K · 3-15s';
        if (id === 'kling-motion-control') return '1080P';
        return '1080P · 3-10s';
      },
    },
  ],
  ['wan', { kind: 'video', getSubtitle: () => '720P-1080P · 5-15s' }],
  ['veo', { kind: 'video', getSubtitle: () => '720p-1080p · 8s' }],
];

/** Fallback for catalogs without contract rows (ids only). Mirrors the family rules above. */
const LEGACY_ID_RULES: ReadonlyArray<VisualRule & { match: (id: string) => boolean }> = [
  {
    match: (id) => id.startsWith('nanobanana') || id.startsWith('nano-banana'),
    badge: 'Yearly -20%',
    getSubtitle: () => 'auto-4K',
  },
  {
    match: (id) => id.startsWith('seedream'),
    badge: 'Yearly -20%',
    getSubtitle: (id) => (id.includes('5.0') || id.includes('5-0') ? '1K-2K' : '2K-4K'),
  },
  {
    match: (id) => id.startsWith('midjourney') || id.startsWith('mj-'),
    badge: 'Yearly -20%',
    getSubtitle: (id) => (id.includes('8.1') || id.includes('8-1') ? '2K' : '1080P'),
  },
  {
    match: (id) => id.startsWith('gpt-image') || id.startsWith('openai'),
    badge: 'Yearly -20%',
    getSubtitle: () => '1k-4k',
  },
  {
    match: (id) => id.startsWith('kling'),
    getSubtitle: (id) => {
      if (id === 'kling-o3') return '4K · 3-15s';
      if (id === 'kling-motion-control') return '1080P';
      return '1080P · 3-10s';
    },
  },
  {
    match: (id) => id.startsWith('wan'),
    getSubtitle: () => '720P-1080P · 5-15s',
  },
  {
    match: (id) => id.startsWith('veo'),
    getSubtitle: () => '720p-1080p · 8s',
  },
];

function buildResult(icon: React.ReactNode, id: string, rule: VisualRule): ModelVisualsResult {
  const result: ModelVisualsResult = { icon };
  if (rule.badge) result.badge = rule.badge;
  if (rule.getSubtitle) result.subtitle = rule.getSubtitle(id);
  return result;
}

/**
 * @param id Model id as rendered (product id).
 * @param context Contract family and output kind of the row, when the catalog exposes them.
 */
export function getModelVisuals(id: string, context: ModelVisualsContext = {}): ModelVisualsResult {
  const icon = <ModelBrandIcon modelId={id} size={15} />;
  const family = typeof context.family === 'string' ? context.family.trim().toLowerCase() : '';
  if (family) {
    for (const [name, rule] of FAMILY_RULES) {
      if (name !== family) continue;
      if (rule.kind && rule.kind !== context.kind) continue;
      return buildResult(icon, id, rule);
    }
  }
  for (const rule of LEGACY_ID_RULES) {
    if (rule.match(id)) return buildResult(icon, id, rule);
  }
  return { icon };
}
