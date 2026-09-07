import { isAbsolute } from 'node:path';
import { TRANSCRIPTION_FORMATS, type SpeechToTextRequest, type TranscriptionFormat } from '../../shared/speechToText.ts';
import { SpeechToTextError } from './errors.ts';

function invalid(message: string): never {
  throw new SpeechToTextError('invalid-request', message, 400);
}

export function parseSpeechToTextRequest(raw: unknown): Required<SpeechToTextRequest> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('请求体必须是 JSON 对象');
  const body = raw as Record<string, unknown>;
  if (typeof body.nodeId !== 'string' || !body.nodeId.trim() || /[\x00-\x1f]/.test(body.nodeId)) {
    invalid('nodeId 必须是非空节点标识');
  }
  if (typeof body.audioPath !== 'string' || !body.audioPath.trim() || /[\x00-\x1f]/.test(body.audioPath)) {
    invalid('audioPath 必须是音频绝对路径或 HTTP(S) URL');
  }
  const audioPath = body.audioPath.trim();
  if (!isAbsolute(audioPath)) {
    let url: URL;
    try { url = new URL(audioPath); } catch { invalid('audioPath 必须是音频绝对路径或 HTTP(S) URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      invalid('audioPath 仅支持无内嵌凭据的 HTTP(S) URL 或绝对路径');
    }
  }
  if (body.model !== undefined && (typeof body.model !== 'string' || /[\x00-\x1f]/.test(body.model))) {
    invalid('model 必须是模型标识字符串');
  }
  if (body.responseFormat !== undefined && typeof body.responseFormat !== 'string') invalid('responseFormat 必须是字符串');
  const responseFormat = body.responseFormat || 'srt';
  if (!TRANSCRIPTION_FORMATS.includes(responseFormat as TranscriptionFormat)) {
    invalid('responseFormat 仅支持 json、text、verbose_json、srt 或 vtt');
  }
  return {
    nodeId: body.nodeId.trim(), audioPath,
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'doubao-asr-bigmodel',
    responseFormat: responseFormat as TranscriptionFormat,
  };
}
