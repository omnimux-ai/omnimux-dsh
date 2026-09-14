export interface PickerCandidate {
  id: string;
  label: string;
  subtitle?: string;
  family?: string;
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
