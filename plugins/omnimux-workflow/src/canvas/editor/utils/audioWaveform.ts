/** Bounded real-sample waveform extraction. Failure never fabricates peaks. */
export const WAVEFORM_LIMITS = {
  bytes: 16 * 1024 * 1024,
  seconds: 600,
  channels: 8,
  sampleRate: 8000,
  bins: 96,
  cacheEntries: 16,
  cacheMs: 5 * 60 * 1000,
} as const;

export interface SampleBuffer {
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

/** Peak magnitude across every channel, including short clips and silence. */
export function samplePeaks(buffer: SampleBuffer, bins: number = WAVEFORM_LIMITS.bins): number[] {
  if (!Number.isInteger(bins) || bins < 1 || bins > 512 || buffer.length < 1
    || buffer.numberOfChannels < 1 || buffer.numberOfChannels > WAVEFORM_LIMITS.channels) {
    throw new Error('waveform-budget');
  }
  const count = Math.min(bins, buffer.length);
  const peaks = new Array<number>(count).fill(0);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let bin = 0; bin < count; bin += 1) {
      const start = Math.floor(bin * buffer.length / count);
      const end = Math.floor((bin + 1) * buffer.length / count);
      for (let index = start; index < end; index += 1) {
        const value = samples[index] ?? 0;
        if (Number.isFinite(value)) peaks[bin] = Math.max(peaks[bin]!, Math.min(1, Math.abs(value)));
      }
    }
  }
  return peaks;
}

export function audioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return minutes < 60 ? `${minutes}:${rest}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`;
}

/** Derive actions from the *selected playback URL*, never an unrelated node path. */
export function projectAudioTarget(
  source: string,
  workspaceId: string | undefined,
  origin: string,
): { workspaceId: string; relativePath: string } | null {
  if (!workspaceId) return null;
  try {
    const url = new URL(source, origin);
    if (url.origin !== origin) return null;
    const match = /^\/omnimux-workflow\/api\/workspaces\/([^/]+)\/file$/.exec(url.pathname);
    const id = match ? decodeURIComponent(match[1]!)
      : url.pathname === '/omnimux-workflow/api/project-file' ? url.searchParams.get('workspace') : null;
    const relativePath = url.searchParams.get('rel');
    if (id !== workspaceId || !relativePath || /[\\\u0000-\u001f]/.test(relativePath)
      || relativePath.startsWith('/') || relativePath.includes(':')
      || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) return null;
    return { workspaceId, relativePath };
  } catch {
    return null;
  }
}

const cache = new Map<string, { peaks: number[]; expires: number }>();
let decoding = false;

/** Reads at most the compressed budget even without Content-Length. */
export async function readAudioBytes(response: Response, signal: AbortSignal): Promise<ArrayBuffer> {
  if (!response.ok || !response.body) throw new Error('waveform-fetch');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const declared = Number(response.headers.get('content-length'));
    if (declared > WAVEFORM_LIMITS.bytes) throw new Error('waveform-budget');
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > WAVEFORM_LIMITS.bytes) throw new Error('waveform-budget');
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return data.buffer;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** One decoder at a time; crowded canvases degrade explicitly and allow retry. */
export async function loadAudioPeaks(source: string, duration: number, signal: AbortSignal): Promise<number[]> {
  signal.throwIfAborted();
  if (!Number.isFinite(duration) || duration <= 0 || duration > WAVEFORM_LIMITS.seconds) {
    throw new Error('waveform-budget');
  }
  const key = `${source}\n${duration}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    cache.delete(key);
    cache.set(key, hit);
    return hit.peaks;
  }
  cache.delete(key);
  if (decoding) throw new Error('waveform-busy');
  decoding = true;
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20_000);
  let context: AudioContext | null = null;
  try {
    const bytes = await readAudioBytes(await fetch(source, {
      signal: controller.signal, credentials: 'same-origin',
    }), controller.signal);
    controller.signal.throwIfAborted();
    // Downsample during decode to bound PCM retained by the application.
    context = new AudioContext({ sampleRate: WAVEFORM_LIMITS.sampleRate });
    const buffer = await context.decodeAudioData(bytes);
    controller.signal.throwIfAborted();
    if (buffer.duration > WAVEFORM_LIMITS.seconds || buffer.numberOfChannels > WAVEFORM_LIMITS.channels) {
      throw new Error('waveform-budget');
    }
    const peaks = samplePeaks(buffer);
    cache.set(key, { peaks, expires: Date.now() + WAVEFORM_LIMITS.cacheMs });
    while (cache.size > WAVEFORM_LIMITS.cacheEntries) cache.delete(cache.keys().next().value!);
    return peaks;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    if (context) await context.close().catch(() => undefined);
    decoding = false;
  }
}
