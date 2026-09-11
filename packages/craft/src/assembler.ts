import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export type ArtifactKind =
  | 'web-prototype'
  | 'html'
  | 'genui'
  | 'deck'
  | 'article'
  | 'social-copy'
  | 'video-script'
  | 'general';

export interface ResolveCraftOptions {
  artifactKind?: ArtifactKind | string;
  skillRequires?: readonly string[];
  designSystemApplies?: readonly string[];
  exemptions?: readonly string[];
}

export interface LoadCraftResult {
  body: string;
  sections: string[];
}

/**
 * Normalizes an iterable list of craft slug identifiers.
 */
export function normalizeCraftSlugs(values?: Iterable<unknown>): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const val of values) {
    if (typeof val !== 'string') continue;
    const slug = val.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    normalized.push(slug);
  }
  return normalized;
}

/**
 * Resolves the required craft slugs for a generation run.
 * Automatically injects scenario-specific invariant defaults (e.g. typography & anti-ai-slop for web UI).
 */
export function resolveCraftRequirements(options: ResolveCraftOptions = {}): string[] {
  const {
    artifactKind = 'general',
    skillRequires = [],
    designSystemApplies = [],
    exemptions = [],
  } = options;

  const invariants: string[] = [];

  switch (artifactKind) {
    case 'web-prototype':
    case 'html':
    case 'genui':
      invariants.push('anti-ai-slop', 'typography', 'color');
      break;
    case 'deck':
    case 'article':
      invariants.push('typography', 'typography-hierarchy');
      break;
    case 'social-copy':
      invariants.push('social-copy-discipline');
      break;
    case 'video-script':
      invariants.push('video-storyboard-craft');
      break;
  }

  const requested = normalizeCraftSlugs([
    ...invariants,
    ...skillRequires,
    ...designSystemApplies,
  ]);

  const excluded = new Set(normalizeCraftSlugs(exemptions));
  return requested.filter((slug) => !excluded.has(slug));
}

/**
 * Returns the default absolute directory where craft rules are located.
 */
export function getDefaultRulesDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '../rules');
}

/**
 * Reads requested craft rule files and combines them into structured markdown sections.
 * Missing files are dropped gracefully to ensure backward/forward compatibility.
 */
export async function loadCraftSections(
  rulesDir: string,
  requested: readonly string[],
): Promise<LoadCraftResult> {
  if (!rulesDir || !Array.isArray(requested) || requested.length === 0) {
    return { body: '', sections: [] };
  }

  const seen = new Set<string>();
  const parts: string[] = [];
  const sections: string[] = [];

  for (const raw of requested) {
    if (typeof raw !== 'string') continue;
    const slug = raw.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);

    try {
      const filePath = path.join(rulesDir, `${slug}.md`);
      const text = await readFile(filePath, 'utf8');
      const trimmed = text.trim();
      if (!trimmed) continue;
      parts.push(`### ${slug}\n\n${trimmed}`);
      sections.push(slug);
    } catch {
      // File does not exist or unreadable — skip silently.
    }
  }

  return {
    body: parts.join('\n\n---\n\n'),
    sections,
  };
}

/**
 * Formats loaded craft sections into a top-level Prompt injection block.
 */
export function formatCraftPromptSection(body: string): string {
  if (!body || !body.trim()) return '';
  return `## Active craft references\n\nThe following universal craft standards apply to this generation:\n\n${body.trim()}\n`;
}
