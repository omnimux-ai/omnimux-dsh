import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspaceStore } from '../workflow/workspace/WorkspaceStore.ts';
import { summarizeCover, projectCover, coverUrl, type CoverSummary } from './coverSummary.ts';
import { z } from 'zod';
const entrySchema = z.object({
  schemaVersion: z.literal(1), stamp: z.string(), order: z.array(z.string()).max(100000),
  cover: z.object({
    kind: z.enum(['empty', 'document', 'image', 'audio', 'video']), nodeId: z.string().optional(),
    mediaUrl: z.string().refine((url) => Boolean(coverUrl(url))).optional(),
    thumbnailUrl: z.string().refine((url) => Boolean(coverUrl(url))).optional(),
    sourceRevision: z.string().optional(), unavailable: z.boolean().optional(),
  }),
});
interface Page { id: string; canvasWorkspaceId?: string }
interface Entry { stamp: string; order: string[]; cover: CoverSummary }
/** Derived per-canvas cache. Source canvas and project timestamps remain untouched. */
export function createProjectCoverService(store: WorkspaceStore, mediaRevision?: (url: string) => string) {
  const versioned = (cover: CoverSummary): CoverSummary => {
    if (!mediaRevision) return cover;
    let bodyRevision = '', posterRevision = '';
    let bodyMissing = false, posterMissing = false;
    try { if (cover.mediaUrl) bodyRevision = mediaRevision(cover.mediaUrl); } catch { bodyMissing = true; }
    try { if (cover.thumbnailUrl) posterRevision = mediaRevision(cover.thumbnailUrl); } catch { posterMissing = true; }
    return { ...cover,
      ...(posterMissing ? { thumbnailUrl: undefined } : {}),
      sourceRevision: JSON.stringify([cover.sourceRevision, bodyRevision, posterRevision, bodyMissing, posterMissing]),
      ...((bodyMissing && !cover.thumbnailUrl) || (posterMissing && (!cover.mediaUrl || bodyMissing)) ? { unavailable: true } : {}),
    };
  };
  const memory = new Map<string, Entry>();
  function pageCover(page: Page): CoverSummary {
    const id = page.canvasWorkspaceId;
    if (!id || !/^ws_[a-zA-Z0-9_-]{1,128}$/.test(id)) return { kind: 'empty' };
    const cacheFile = join(store.workspacesDir, id, 'cover-summary.json');
    let previous = memory.get(id);
    if (!previous) {
      try {
        const saved = entrySchema.safeParse(JSON.parse(readFileSync(cacheFile, 'utf8')));
        if (saved.success) previous = saved.data;
      } catch { /* Cache misses are rebuilt from the canvas. */ }
    }
    try {
      const source = store.canvasFileOf(id);
      const stat = statSync(source);
      const stamp = `${source}:${stat.mtimeMs}:${stat.size}`;
      if (previous?.stamp === stamp) { memory.set(id, previous); return previous.cover; }
      const snapshot = store.get(id);
      const ids = snapshot.nodes.map((node) => node.id);
      const order = [...(previous?.order ?? []).filter((nodeId) => ids.includes(nodeId))];
      for (const nodeId of ids) if (!order.includes(nodeId)) order.push(nodeId);
      const entry: Entry = { stamp, order, cover: summarizeCover(snapshot.nodes, order) };
      memory.set(id, entry);
      try {
        mkdirSync(join(cacheFile, '..'), { recursive: true });
        const tmp = `${cacheFile}.tmp-${process.pid}`;
        writeFileSync(tmp, JSON.stringify({ schemaVersion: 1, ...entry }));
        renameSync(tmp, cacheFile);
      } catch { /* Read-only disks may still serve an in-memory summary. */ }
      if (memory.size > 512) memory.delete(memory.keys().next().value!);
      return entry.cover;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        memory.delete(id);
        return previous ? { kind: 'empty', unavailable: true } : { kind: 'empty' };
      }
      return { ...(previous?.cover ?? { kind: 'empty' }), unavailable: true };
    }
  }
  return function enrich<T extends { pages?: Page[] }>(project: T) {
    const pages = (project.pages ?? []).map((page) => ({ ...page, cover: versioned(pageCover(page)) }));
    return { ...project, pages, cover: projectCover(pages.map((page) => page.cover)) };
  };
}
