import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { detectMimeFromFile, mimeFromFilename } from '../../shared/localMedia.ts';
import type { AwaitTaskResult, GenerationCapability } from './gateway.ts';
import { SeamGatewayError } from './SeamGatewayError.ts';

type ArtifactResult = Partial<Omit<AwaitTaskResult, 'url' | 'type'>> & { url?: string | null; type?: string };

/** Validate before project persistence; request capability is not evidence of output type. */
export function validateGeneratedResult(result: ArtifactResult, expected: GenerationCapability, localPath?: string) {
  const fail = (): never => { throw new SeamGatewayError('omnimux-invalid-response', `生成结果与 ${expected} 节点的产物类型不匹配`); };
  if (!result || typeof result !== 'object' || (result.type !== undefined && result.type !== expected)) fail();
  if (result.url != null && typeof result.url !== 'string') fail();
  if (result.mimeType !== undefined && typeof result.mimeType !== 'string') fail();
  if (expected === 'text') {
    if (typeof result.text !== 'string' || !result.text.trim()) fail();
  } else if (typeof result.text === 'string' || !result.url?.trim()) fail();
  const dataMime = result.url?.match(/^data:([^;,]+)/)?.[1];
  if (dataMime && !dataMime.startsWith(`${expected}/`)) fail();
  let mimeType = result.mimeType ?? dataMime;
  let sizeBytes = result.sizeBytes;
  for (const path of new Set([localPath, result.url])) {
    if (!path || !isAbsolute(path)) continue;
    try {
      const stat = statSync(path);
      if (stat.isFile()) {
        const detected = detectMimeFromFile(path, '');
        if (detected && expected !== 'text' && !detected.startsWith(`${expected}/`)) fail();
        mimeType ??= detected || undefined;
        sizeBytes ??= stat.size;
      }
    } catch (error) {
      if (error instanceof SeamGatewayError) throw error;
    }
  }
  if (!mimeType && result.url) {
    try { mimeType = mimeFromFilename(new URL(result.url, 'file:///').pathname); } catch { /* Unknown remains unknown. */ }
  }
  if (mimeType && !mimeType.toLowerCase().startsWith(`${expected}/`)) fail();
  for (const value of [sizeBytes, result.durationSec]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) fail();
  }
  return {
    ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(result.durationSec !== undefined ? { durationSec: result.durationSec } : {}),
  };
}
