import { existsSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import type { SpeechToTextRequest, SpeechToTextResult, SpeechToTextSeam } from '../../shared/speechToText.ts';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import { SpeechToTextError } from './errors.ts';

export interface SpeechToTextServiceDeps {
  store: Pick<WorkspaceStore, 'get'> & Partial<Pick<WorkspaceStore, 'workspacesDir' | 'resolveProjectRoot'>>;
  mediaDir?: string;
  getSeam?: (name: string) => unknown;
  resolveProjectFile?: (workspaceId: string, relativePath: string) => string;
}

/**
 * 将传入的 audioPath（可能是真实绝对路径、local-file URL、内部媒体相对路径、项目相对路径或 HTTP(S) URL）
 * 还原为本地磁盘物理绝对路径，若无法定位物理文件且为合法公网 HTTP(S) URL 则保留该 URL 供中枢网络读取。
 */
export function resolveAudioAbsolutePath(
  deps: SpeechToTextServiceDeps,
  workspaceId: string,
  audioPath: string,
): string {
  const trimmed = audioPath.trim();

  // 1. 尝试从 local-file URL 还原（提取 ?path= 参数）
  const localMatch = /[\?&]path=([^&]+)/.exec(trimmed);
  if (localMatch?.[1]) {
    try {
      const decoded = decodeURIComponent(localMatch[1]);
      if (isAbsolute(decoded)) {
        if (existsSync(decoded)) return decoded;
        if (trimmed.includes('/api/local-file')) return decoded;
      }
    } catch {}
  }

  // 2. 去除 URL query/hash 纯路径检测
  const cleanPath = trimmed.split(/[?#]/)[0] ?? trimmed;
  if (isAbsolute(cleanPath) && existsSync(cleanPath)) {
    return cleanPath;
  }

  // 3. 剥除 /omnimux-workflow/media/ 或 /dsh-workflow/media/ 前缀
  let stripped = cleanPath;
  const mediaPrefixMatch = cleanPath.match(/(?:omnimux-workflow|dsh-workflow)\/media\/(.+)$/);
  if (mediaPrefixMatch?.[1]) {
    stripped = mediaPrefixMatch[1];
  }

  // 4. mediaDir 候选路径匹配（含提取音频目录 extracted-audio）
  if (deps.mediaDir) {
    const candidateStripped = join(deps.mediaDir, stripped);
    if (existsSync(candidateStripped)) return candidateStripped;

    const candidateExtracted = join(deps.mediaDir, 'extracted-audio', workspaceId, basename(stripped));
    if (existsSync(candidateExtracted)) return candidateExtracted;

    const candidateBasename = join(deps.mediaDir, basename(stripped));
    if (existsSync(candidateBasename)) return candidateBasename;

    const candidateClean = join(deps.mediaDir, cleanPath);
    if (existsSync(candidateClean)) return candidateClean;
  }

  // 5. 工作区目录与 .omnimux 媒体目录候选
  if (deps.store?.workspacesDir) {
    const wsExtracted = join(deps.store.workspacesDir, workspaceId, '.omnimux', 'media', 'extracted-audio', basename(stripped));
    if (existsSync(wsExtracted)) return wsExtracted;

    const wsCandidateClean = join(deps.store.workspacesDir, workspaceId, cleanPath);
    if (existsSync(wsCandidateClean)) return wsCandidateClean;

    const wsCandidateStripped = join(deps.store.workspacesDir, workspaceId, stripped);
    if (existsSync(wsCandidateStripped)) return wsCandidateStripped;
  }

  // 6. 项目绑定工作区文件解析
  const bound = deps.store?.resolveProjectRoot?.(workspaceId);
  if (bound && bound.path) {
    const candidateClean = join(bound.path, cleanPath);
    if (existsSync(candidateClean)) return candidateClean;
    const candidateStripped = join(bound.path, stripped);
    if (existsSync(candidateStripped)) return candidateStripped;
  }

  // 7. resolveProjectFile 解析
  if (deps.resolveProjectFile) {
    try {
      const resolvedClean = deps.resolveProjectFile(workspaceId, cleanPath);
      if (existsSync(resolvedClean)) return resolvedClean;
      const resolvedStripped = deps.resolveProjectFile(workspaceId, stripped);
      if (existsSync(resolvedStripped)) return resolvedStripped;
    } catch {}
  }

  // 8. 若符合 HTTP(S) URL，保留为 URL 由中枢 seam 远程拉取
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // 保底返回
  return isAbsolute(cleanPath) ? cleanPath : trimmed;
}

export function createSpeechToTextService(deps: SpeechToTextServiceDeps) {
  return async (workspaceId: string, input: Required<SpeechToTextRequest>): Promise<SpeechToTextResult> => {
    // Validate workspace existence; the caller may not have autosaved this node yet.
    deps.store.get(workspaceId);
    const seam = deps.getSeam?.('speechToText');
    if (!seam || typeof seam !== 'object' || !('execute' in seam) || typeof seam.execute !== 'function') {
      throw new SpeechToTextError('needs-provider', '语音转写服务未注入，请启用中枢 speechToText 服务', 503);
    }
    // 解析物理绝对路径（或保留 HTTP URL）
    const effectiveAudio = resolveAudioAbsolutePath(deps, workspaceId, input.audioPath);
    // The hub owns byte loading and provider I/O. No generation fallback or graph writes.
    const result = await (seam as SpeechToTextSeam).execute({
      model: input.model,
      audio: effectiveAudio,
      response_format: input.responseFormat,
    });
    if (result?.mode !== 'live' || typeof result.text !== 'string' || !result.text.trim()
      || typeof result.model !== 'string' || !result.model.trim()) {
      throw new SpeechToTextError('omnimux-invalid-response', '语音转写服务未返回有效文本', 502);
    }
    return { text: result.text, model: result.model };
  };
}
