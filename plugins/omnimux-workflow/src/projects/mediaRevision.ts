import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { isAllowedImportedMedia } from '../shared/localMedia.ts';
/** Stats only existing workflow media routes; never fetches arbitrary remote URLs. */
export function createMediaRevision(mediaDir: string, resolveProjectFile: (workspaceId: string, relativePath: string) => string) {
  return (source: string): string => {
    if (!source.startsWith('/omnimux-workflow/')) return '';
    const url = new URL(source, 'http://localhost');
    let file: string | undefined;
    const match = /^\/omnimux-workflow\/api\/workspaces\/([^/]+)\/file$/.exec(url.pathname);
    if (match) file = resolveProjectFile(decodeURIComponent(match[1]!), url.searchParams.get('rel') || '');
    else if (url.pathname === '/omnimux-workflow/api/project-file') file = resolveProjectFile(url.searchParams.get('workspace') || '', url.searchParams.get('rel') || '');
    else if (url.pathname === '/omnimux-workflow/api/local-file') {
      const candidate = url.searchParams.get('path') || '';
      if (isAbsolute(candidate) && isAllowedImportedMedia(candidate)) file = candidate;
    } else if (url.pathname.startsWith('/omnimux-workflow/media/')) {
      const root = resolve(mediaDir);
      const candidate = resolve(root, decodeURIComponent(url.pathname.slice('/omnimux-workflow/media/'.length)));
      if (candidate.startsWith(root + sep) && realpathSync(candidate).startsWith(realpathSync(root) + sep)) file = candidate;
      else throw new Error('media-path-outside-root');
    }
    if (!file) return '';
    const stat = statSync(realpathSync(file));
    if (!stat.isFile()) throw new Error('media-not-file');
    return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  };
}
