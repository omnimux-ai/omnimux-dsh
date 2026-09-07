import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { detectMimeFromFile, mimeFromFilename } from '../../shared/localMedia.ts';
import { buildUpstreamFingerprint } from '../../shared/validation/compatKernel.ts';
import type { ReferenceAssetPayload, SubmitRequest } from './gateway.ts';
import { SeamGatewayError } from './SeamGatewayError.ts';

/** Legacy mirrors must not add a second asset or lose an explicit frame role. */
export function submissionReferences(req: SubmitRequest): ReferenceAssetPayload[] {
  if (req.references !== undefined && !Array.isArray(req.references)) {
    throw new SeamGatewayError('omnimux-invalid-request', '素材引用必须是有序列表');
  }
  const refs = [...(req.references ?? [])];
  if (refs.some((ref) => !ref || typeof ref !== 'object')) {
    throw new SeamGatewayError('input_unavailable', '素材引用无效，请替换素材或移除引用');
  }
  if (req.audioTrack && !refs.some((ref) => ref.pathOrUrl === req.audioTrack!.pathOrUrl
    && ref.role === req.audioTrack!.role && ref.targetSlot === req.audioTrack!.targetSlot)) refs.push(req.audioTrack);
  const add = (pathOrUrl: string | undefined, type: ReferenceAssetPayload['type'], role: ReferenceAssetPayload['role']) => {
    if (pathOrUrl !== undefined && !refs.some((ref) => ref.type === type && ref.pathOrUrl === pathOrUrl)) {
      refs.push({ pathOrUrl, type, role });
    }
  };
  add(req.image, 'image', req.capability === 'video' ? 'first_frame' : 'reference');
  add(req.video, 'video', 'reference');
  add(req.audio, 'audio', req.operation === 'speech_to_text' ? 'source' : 'reference');
  add(req.speech, 'audio', 'audio_track');
  return refs;
}

function validateReference(ref: ReferenceAssetPayload): ReferenceAssetPayload {
  const fail = (message: string): never => {
    throw new SeamGatewayError('input_unavailable', `来源 ${ref?.sourceNodeId ?? ref?.edgeId ?? '素材'}：${message}`);
  };
  if (!ref || !['image', 'video', 'audio'].includes(ref.type)) {
    throw new SeamGatewayError('operation_incompatible', '当前引用不是支持的图片、视频或音频素材');
  }
  const path = typeof ref.pathOrUrl === 'string' ? ref.pathOrUrl.trim() : '';
  if (!path || path.includes('\0')) fail('素材地址无效，请替换素材或移除引用');
  if (ref.mimeType !== undefined && typeof ref.mimeType !== 'string') {
    throw new SeamGatewayError('metadata_required', '素材 MIME 无效，请重新读取素材');
  }
  let mimeType = ref.mimeType?.trim().toLowerCase() || undefined;
  if (mimeType === 'application/octet-stream' || mimeType === 'unknown') mimeType = undefined;
  let sizeBytes = ref.sizeBytes;
  if (isAbsolute(path)) {
    try {
      const stat = statSync(path);
      if (!stat.isFile() || stat.size === 0) fail('素材文件为空或不可用');
      sizeBytes = stat.size;
      const detected = detectMimeFromFile(path, '');
      if (detected && !detected.startsWith(`${ref.type}/`)) fail('素材文件的实际类型与声明不一致');
      mimeType = detected || mimeType;
    } catch {
      fail('素材文件不可用，请替换素材或移除引用');
    }
  } else if (path.startsWith('data:')) {
    const match = /^data:((?:image|video|audio)\/[^;,]+)(;base64)?,(.+)$/s.exec(path);
    if (!match || match[1]!.split('/')[0] !== ref.type) fail('素材数据类型无效');
    const payload = match![3]!;
    if (match![2] && (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.replace(/=+$/, '').length % 4 === 1)) {
      fail('素材数据编码无效');
    }
    mimeType ??= match![1];
    if (match![2]) sizeBytes ??= Buffer.byteLength(payload, 'base64');
  } else {
    try {
      const url = new URL(path);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) fail('素材必须是执行侧可读取的地址');
      mimeType ??= mimeFromFilename(url.pathname);
    } catch { fail('素材必须是执行侧可读取的地址'); }
  }
  if (mimeType && !mimeType.toLowerCase().startsWith(`${ref.type}/`)) {
    throw new SeamGatewayError('mime_unsupported', '素材类型与 MIME 不一致，请重新读取素材');
  }
  for (const value of [sizeBytes, ref.durationSec ?? ref.duration]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new SeamGatewayError('metadata_required', '素材大小或时长无效，请重新读取素材');
    }
  }
  return { ...ref, pathOrUrl: path, ...(mimeType ? { mimeType } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(ref.durationSec === undefined && ref.duration !== undefined ? { durationSec: ref.duration } : {}) };
}

/** Freeze and validate the exact input population used by operation matching. */
export function submissionFingerprint(req: SubmitRequest) {
  const references = submissionReferences(req).map(validateReference);
  return buildUpstreamFingerprint({
    prompt: req.prompt,
    nodeFields: Object.fromEntries(Object.entries(req).filter(([, value]) =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')),
    assets: references.map((ref, index) => ({
      ...ref, sourceNodeId: ref.sourceNodeId ?? `reference-${index}`, url: ref.pathOrUrl, availability: 'ready' as const,
    })),
  });
}
