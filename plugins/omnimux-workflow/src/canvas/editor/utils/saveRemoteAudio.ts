import { AUDIO_SAVE_LIMITS, type AudioBytesResponse } from '../../../shared/projectAssets.ts';
import { importAudioBytes } from '../../bridge/apiClient.ts';

/** Only actual same-origin media keys are eligible for authenticated reads. */
export function audioSaveSource(source: string, origin: string): { url: string; credentials: RequestCredentials } {
  let url: URL;
  try { url = new URL(source, origin); } catch { throw new Error('audio-save-source'); }
  if (url.username || url.password) throw new Error('audio-save-source');
  if (url.origin === origin) {
    const key = url.pathname.slice('/omnimux/inspiration/media/'.length);
    if (!url.pathname.startsWith('/omnimux/inspiration/media/')
      || !key.split('/').every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part))
      || url.search || url.hash) {
      throw new Error('audio-save-source');
    }
    return { url: url.href, credentials: 'same-origin' };
  }
  if (url.protocol !== 'https:') throw new Error('audio-save-source');
  return { url: url.href, credentials: 'omit' };
}

/** Streaming accumulation is bounded even when Content-Length is absent or dishonest. */
export async function readSavedAudio(response: Response, signal: AbortSignal): Promise<Blob> {
  if (!response.ok || !response.body || response.redirected || response.type === 'opaque') throw new Error('audio-save-network');
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  const abort = (): void => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (Number(response.headers.get('content-length')) > AUDIO_SAVE_LIMITS.bytes) throw new Error('audio-save-budget');
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > AUDIO_SAVE_LIMITS.bytes) throw new Error('audio-save-budget');
      chunks.push(new Uint8Array(value));
    }
    if (!size) throw new Error('audio-save-network');
    return new Blob(chunks, { type: 'application/octet-stream' });
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

let saving = false;

/** One save across the canvas; no duration cap and no server-side URL fetch. */
export async function saveRemoteAudio(source: string, workspaceId: string, origin: string, signal: AbortSignal): Promise<AudioBytesResponse> {
  signal.throwIfAborted();
  const target = audioSaveSource(source, origin);
  if (saving) throw new Error('audio-save-busy');
  saving = true;
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; abort(); }, AUDIO_SAVE_LIMITS.timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(target.url, {
        mode: 'cors', credentials: target.credentials, referrerPolicy: 'no-referrer',
        redirect: 'error', signal: controller.signal,
      });
    } catch { throw new Error('audio-save-network'); }
    const bytes = await readSavedAudio(response, controller.signal);
    controller.signal.throwIfAborted();
    return await importAudioBytes(workspaceId, bytes, controller.signal);
  } catch (error) {
    if (timedOut) throw new Error('audio-save-timeout');
    signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    saving = false;
  }
}
