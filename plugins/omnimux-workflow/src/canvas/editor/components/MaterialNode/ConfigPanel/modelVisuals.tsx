/**
 * @file plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/modelVisuals.tsx
 * Visual presentation metadata (brand icons, badges, subtitles) for model selector dropdowns.
 */

import React from 'react';
import { ModelBrandIcon } from '../../../../ui/ModelBrandIcon';

export interface ModelVisualsResult {
  icon: React.ReactNode;
  badge?: string;
  subtitle?: string;
}

interface VisualRule {
  match: (id: string) => boolean;
  badge?: string;
  getSubtitle?: (id: string) => string;
}

const VISUAL_RULES: VisualRule[] = [
  {
    match: (id) => id.startsWith('nanobanana'),
    badge: 'Yearly -20%',
    getSubtitle: () => 'auto-4K',
  },
  {
    match: (id) => id.startsWith('seedream'),
    badge: 'Yearly -20%',
    getSubtitle: (id) => (id.includes('5.0') || id.includes('5-0') ? '1K-2K' : '2K-4K'),
  },
  {
    match: (id) => id.startsWith('midjourney'),
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
      if (id === 'kling-avatar') return 'Digital Human';
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

export function getModelVisuals(id: string): ModelVisualsResult {
  const icon = <ModelBrandIcon modelId={id} size={15} />;
  for (const rule of VISUAL_RULES) {
    if (rule.match(id)) {
      const result: ModelVisualsResult = { icon };
      if (rule.badge) result.badge = rule.badge;
      if (rule.getSubtitle) result.subtitle = rule.getSubtitle(id);
      return result;
    }
  }
  return { icon };
}
