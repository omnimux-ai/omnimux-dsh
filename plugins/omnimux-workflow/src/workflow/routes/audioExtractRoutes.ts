import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import { assertLocalWrite } from '../../http/helpers.ts';
import { createWorkflowLogger } from '../execution/logger.ts';
import { AudioExtractError, audioExtractFailure } from '../audioExtract/errors.ts';
import {
  parseExtractAudioRequest,
  type ExtractAudioResponse,
} from '../audioExtract/schema.ts';
import {
  createAudioExtractService,
  type AudioExtractServiceDeps,
} from '../audioExtract/service.ts';
import type { RouteTry } from './dispatch.ts';

export function createAudioExtractRoutes(
  deps: AudioExtractServiceDeps,
): { tryHandle: RouteTry } {
  const route = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/extract-audio$`);
  const extractAudio = createAudioExtractService(deps);
  const logger = createWorkflowLogger('audio-extract');
  const tryHandle: RouteTry = async (method, path, req) => {
    const match = route.exec(path);
    if (!match || method !== 'POST') return null;
    const started = Date.now();
    try {
      try {
        assertLocalWrite(req);
      } catch {
        throw new AudioExtractError('not-local', '拒绝跨来源的音频提取请求', 403);
      }
      const input = parseExtractAudioRequest(req.body);
      const result = await extractAudio(match[1]!, input);
      const body: ExtractAudioResponse = {
        ok: true,
        code: 0,
        data: result,
        message: result.noAudioStream ? '该视频未检测到音轨' : '音频提取成功',
      };
      logger.info('request completed', { status: 200, durationMs: Date.now() - started });
      return { status: 200, body };
    } catch (error) {
      const failure = audioExtractFailure(error);
      logger.error('request failed', {
        status: failure.status,
        code: failure.body.error,
        durationMs: Date.now() - started,
      });
      return failure;
    }
  };
  return { tryHandle };
}
