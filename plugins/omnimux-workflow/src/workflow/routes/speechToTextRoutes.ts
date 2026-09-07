import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import type { SpeechToTextResponse } from '../../shared/speechToText.ts';
import { assertLocalWrite } from '../../http/helpers.ts';
import { createWorkflowLogger } from '../execution/logger.ts';
import { SpeechToTextError, speechToTextFailure } from '../speechToText/errors.ts';
import { parseSpeechToTextRequest } from '../speechToText/schema.ts';
import { createSpeechToTextService, type SpeechToTextServiceDeps } from '../speechToText/service.ts';
import type { RouteTry } from './dispatch.ts';

export function createSpeechToTextRoutes(deps: SpeechToTextServiceDeps): { tryHandle: RouteTry } {
  const route = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/speech-to-text$`);
  const transcribe = createSpeechToTextService(deps);
  const logger = createWorkflowLogger('speech-to-text');
  const tryHandle: RouteTry = async (method, path, req) => {
    const match = route.exec(path);
    if (!match || method !== 'POST') return null;
    const started = Date.now();
    try {
      try { assertLocalWrite(req); } catch {
        throw new SpeechToTextError('not-local', '拒绝跨来源的语音转写请求', 403);
      }
      const input = parseSpeechToTextRequest(req.body);
      const result = await transcribe(match[1]!, input);
      const body: SpeechToTextResponse = { ok: true, ...result, code: 0, data: result, message: '' };
      logger.info('request completed', { status: 200, durationMs: Date.now() - started });
      return { status: 200, body };
    } catch (error) {
      const failure = speechToTextFailure(error);
      logger.error('request failed', { status: failure.status, code: failure.body.error, durationMs: Date.now() - started });
      return failure;
    }
  };
  return { tryHandle };
}
