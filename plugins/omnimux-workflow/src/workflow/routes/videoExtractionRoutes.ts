import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import { assertLocalWrite } from '../../http/helpers.ts';
import { createWorkflowLogger } from '../execution/logger.ts';
import { VideoExtractionError, videoExtractionFailure } from '../videoExtraction/errors.ts';
import { parseExtractVideoRequest, type ExtractVideoResponse } from '../videoExtraction/schema.ts';
import { createVideoExtractionService, type VideoExtractionServiceDeps } from '../videoExtraction/service.ts';
import type { RouteTry } from './dispatch.ts';

export function createVideoExtractionRoutes(deps: VideoExtractionServiceDeps): { tryHandle: RouteTry } {
  const route = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/extract-video$`);
  const extractVideo = createVideoExtractionService(deps);
  const logger = createWorkflowLogger('video-extraction');
  const tryHandle: RouteTry = async (method, path, req) => {
    const match = route.exec(path);
    if (!match || method !== 'POST') return null;
    const started = Date.now();
    try {
      try {
        assertLocalWrite(req);
      } catch {
        throw new VideoExtractionError('not-local', '拒绝跨来源的视频提取请求', 403);
      }
      const input = parseExtractVideoRequest(req.body);
      const result = await extractVideo(match[1]!, input);
      const body: ExtractVideoResponse = {
        ok: true,
        code: 0,
        data: result,
        message: '',
        videoPath: result.videoPath,
        mediaUrl: result.mediaUrl,
        previewUrl: result.previewUrl,
        title: result.title,
        duration: result.duration,
        coverUrl: result.coverUrl,
      };
      logger.info('request completed', { status: 200, durationMs: Date.now() - started });
      return { status: 200, body };
    } catch (error) {
      const failure = videoExtractionFailure(error);
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
