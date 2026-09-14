/** Select available nonempty current text once, preserving connection order. */
export function selectGenerationTextSources<T extends { sourceNodeId: string; type: string; textContent?: string; url?: string; availability?: string }>(sources: readonly T[]): T[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const text = source.type === 'text' || source.type === 'table' || (Boolean(source.textContent) && !source.url);
    if (!text || seen.has(source.sourceNodeId)) return false;
    seen.add(source.sourceNodeId);
    return Boolean(source.textContent?.trim()) && (!source.availability || source.availability === 'ready');
  });
}

/** Compose ordered source content and local instructions without copying into the editor. */
export function resolveGenerationPrompt(
  data: { prompt?: unknown; content?: unknown; materialType?: unknown },
  upstreamTexts: unknown[] = [],
): string {
  const local = [data.prompt, data.content].find((value) => typeof value === 'string' && value.trim());
  // Text references annotate connected content; they are not additional instructions.
  const instruction = typeof local === 'string'
    ? local.replace(/@ref\[([^:]+):-1:([^\]]+)\]/g, '').trim()
    : '';
  const texts = upstreamTexts.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .map((value) => value.trim());
  if (texts.length === 0) return instruction;
  // Audio text is a script/description, so source labels must never be spoken.
  if (data.materialType === 'audio') return texts.join('\n\n');
  if (texts.length === 1 && !instruction) return texts[0]!;
  const sources = texts.map((text, index) => `来源 ${index + 1}：\n${text}`).join('\n\n');
  return instruction ? `${sources}\n\n补充要求：\n${instruction}` : sources;
}
