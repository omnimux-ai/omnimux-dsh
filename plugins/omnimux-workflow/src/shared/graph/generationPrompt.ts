/** Same prompt precedence for editor readiness, graph mutation and execution. */
export function resolveGenerationPrompt(
  data: { prompt?: unknown; content?: unknown },
  upstreamTexts: unknown[] = [],
): string {
  for (const value of [data.prompt, data.content, ...upstreamTexts]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}
