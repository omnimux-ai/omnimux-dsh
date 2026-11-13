import type { CatalogChannelGroupDto } from '../../../../../shared/api.ts';

export interface PickerCandidate {
  id: string;
  label: string;
  subtitle?: string;
  family?: string;
  source?: 'gateway' | 'custom';
  executionStatus?: 'ready' | 'unsupported' | 'unverified';
  executable?: boolean;
  disabledReason?: 'adapter_unsupported' | 'provider_unverified';
  /**
   * Gateway lines of this model, straight from the hub catalog row. The channel
   * column renders these and nothing else.
   */
  channelGroups?: CatalogChannelGroupDto[];
}

export interface PickerCandidateGroup {
  id: string;
  name: string;
  iconModelId: string;
  rows: PickerCandidate[];
}

// Presentation aliases only: these never contribute model candidates.
const BRANDS: readonly [string, string, readonly string[]][] = [
  ['openai', 'OpenAI', ['openai', 'gpt', 'o1', 'o3', 'o4']],
  ['bytedance', 'Seedance', ['bytedance', 'seed']],
  ['minimax', 'MiniMax', ['minimax', 'hailuo']],
  ['kling', 'Kling', ['kling']],
  ['alibaba', 'Wan', ['alibaba', 'wan']],
  ['happyhorse', 'HappyHorse', ['happyhorse', 'horse']],
  ['anthropic', 'Claude', ['anthropic', 'claude', 'opus', 'sonnet']],
  ['deepseek', 'DeepSeek', ['deepseek']],
  ['google', 'Google', ['google', 'gemini', 'nano-banana', 'nanobanana', 'imagen', 'veo']],
  ['midjourney', 'Midjourney', ['midjourney', 'mj']],
  ['xai', 'xAI', ['xai', 'grok']],
  ['indextts', 'Index TTS2', ['gxgenai', 'index-tts', 'indextts', 'indextts-2', 'index']],
];

export function isPickerCandidate(options: readonly PickerCandidate[], modelId: string): boolean {
  return Boolean(modelId) && options.some((row) => row.id === modelId);
}

export function groupPickerCandidates(options: readonly PickerCandidate[]): PickerCandidateGroup[] {
  const groups = new Map<string, PickerCandidateGroup>();
  for (const row of options) {
    if (!row.id) continue;
    const identity = row.family?.trim() || row.id;
    const key = identity.toLowerCase();
    const known = BRANDS.find(([, , aliases]) => aliases.some((alias) => key === alias || key.startsWith(`${alias}-`)));
    const id = known?.[0] ?? identity;
    let group = groups.get(id);
    if (!group) {
      group = { id, name: known?.[1] ?? identity, iconModelId: row.id, rows: [] };
      groups.set(id, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

/** 菜单行的可本地化文案（#4113 M2）：纯函数，行为可直接单测，不靠源码字符串断言。 */
export type ModelMenuCopyKey =
  | 'modelMenu.unsupportedTitle'
  | 'modelMenu.unverifiedTitle'
  | 'modelMenu.unsupportedBadge'
  | 'modelMenu.unverifiedBadge';

export function resolveModelMenuItemCopy(
  // ModelExecutionStatus 恰好三值，且 executable===false ⟺ status∈{unsupported,unverified}；
  // 因此 ready 无 badge 与原逻辑等价。若未来新增第 4 种非 ready 状态，需要同步这里的分支。
  item: { executionStatus?: 'ready' | 'unsupported' | 'unverified' },
  t: (key: ModelMenuCopyKey) => string,
): { title?: string; badge?: string } {
  if (item.executionStatus === 'unsupported') {
    return { title: t('modelMenu.unsupportedTitle'), badge: t('modelMenu.unsupportedBadge') };
  }
  if (item.executionStatus === 'unverified') {
    return { title: t('modelMenu.unverifiedTitle'), badge: t('modelMenu.unverifiedBadge') };
  }
  return {};
}
