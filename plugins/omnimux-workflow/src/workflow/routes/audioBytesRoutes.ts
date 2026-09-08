/** Raw HTTP adapter for audio import and native-action protection. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { header, sendJson, assertLocalWrite } from '../../http/helpers.ts';
import { AUDIO_SAVE_LIMITS } from '../../shared/projectAssets.ts';
import { AudioFileActionError } from '../audioFileAction.ts';
import type { ProjectAssetsStore } from '../workspace/ProjectAssetsStore.ts';

interface ConnectionSeat {
  requestRejection: (req: IncomingMessage) => number | undefined;
}

/** Require explicit, exact scheme/host/port; missing or conflicting headers fail closed. */
export function assertAudioRequestOrigin(req: IncomingMessage): void {
  const origin = header(req, 'origin');
  const referer = header(req, 'referer');
  const host = header(req, 'host');
  try {
    assertLocalWrite({ origin, referer, secFetchSite: header(req, 'sec-fetch-site') });
    if (!host || (!origin && !referer)) throw new Error('missing origin');
    const secure = Boolean((req.socket as { encrypted?: boolean }).encrypted);
    const target = new URL(`${secure ? 'https' : 'http'}://${host}`);
    if (target.username || target.password || target.host !== host) throw new Error('invalid host');
    for (const value of [origin, referer]) {
      if (!value) continue;
      const source = new URL(value);
      if (source.username || source.password || source.origin !== target.origin) throw new Error('different origin');
    }
  } catch {
    throw new AudioFileActionError('not-local', 403);
  }
}

let importing = false;

export function createAudioBytesRoutes(store: ProjectAssetsStore, getConnection: () => unknown) {
  /** True means the raw request was handled; false continues the existing JSON adapter. */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const path = decodeURIComponent(url.pathname).replace(/^\/dsh-workflow(?=\/)/, '/omnimux-workflow');
    const match = /^\/omnimux-workflow\/api\/workspaces\/([^/]+)\/(assets\/audio-bytes|audio-file-action)$/.exec(path);
    if (!match || !match[1]) return false;
    const bytes = match[2] === 'assets/audio-bytes';
    let locked = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    try {
      if (req.method !== 'POST') throw new AudioFileActionError('method-not-allowed', 405);
      const connection = getConnection() as ConnectionSeat | undefined;
      if (typeof connection?.requestRejection !== 'function') throw new AudioFileActionError('auth-unavailable', 503);
      const rejection = connection.requestRejection(req);
      if (rejection !== undefined) throw new AudioFileActionError('unauthorized', rejection === 401 ? 401 : 403);
      assertAudioRequestOrigin(req);
      if (url.search) throw new AudioFileActionError('audio-bytes-invalid', 400);
      store.get(match[1]); // Validate workspace existence and binding before reading any body.
      if (!bytes) return false;
      if (header(req, 'content-type') !== 'application/octet-stream' || header(req, 'content-encoding')) {
        throw new AudioFileActionError('audio-bytes-invalid', 415);
      }
      const length = header(req, 'content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > AUDIO_SAVE_LIMITS.bytes)) {
        throw new AudioFileActionError('audio-save-budget', 413);
      }
      if (importing) throw new AudioFileActionError('audio-save-busy', 409);
      importing = true;
      locked = true;
      req.once('aborted', abort);
      res.once('close', abort);
      timer = setTimeout(abort, AUDIO_SAVE_LIMITS.timeoutMs);
      const result = await store.ingestAudio(match[1], req, controller.signal);
      if (!controller.signal.aborted) sendJson(res, 201, result);
      return true;
    } catch (error) {
      const code = error instanceof AudioFileActionError ? error.code
        : typeof (error as { code?: unknown })?.code === 'string' ? String((error as { code: string }).code) : 'audio-save-failed';
      const statuses: Record<string, number> = {
        'invalid-id': 400, 'workspace-not-found': 404, 'project-required': 400,
        'path-denied': 400, 'disk-space-insufficient': 413,
      };
      const status = error instanceof AudioFileActionError ? error.status : statuses[code] ?? 500;
      if (!res.destroyed && !res.headersSent) sendJson(res, status, { error: code });
      return true;
    } finally {
      if (timer) clearTimeout(timer);
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
      if (locked) importing = false;
    }
  }
  return { handle };
}
