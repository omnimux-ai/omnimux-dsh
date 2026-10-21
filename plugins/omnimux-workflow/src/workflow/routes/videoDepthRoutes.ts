import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import { assertLocalWrite } from '../../http/helpers.ts';
import { createWorkflowLogger } from '../execution/logger.ts';
import { VideoDepthError, videoDepthFailure } from '../videoDepth/errors.ts';
import { parseVideoDepthRequest, type VideoDepthResponse } from '../videoDepth/schema.ts';
import { createVideoDepthService, type VideoDepthServiceDeps } from '../videoDepth/service.ts';
import type { RouteTry } from './dispatch.ts';

export function createVideoDepthRoutes(deps: VideoDepthServiceDeps): { tryHandle: RouteTry } {
  const route = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/video-depth$`);
  const generateDepth = createVideoDepthService(deps);
  const logger = createWorkflowLogger('video-depth');
  const tryHandle: RouteTry = async (method, path, req) => {
    const match = route.exec(path);
    if (!match || method !== 'POST') return null;
    const started = Date.now();
    try {
      try {
        assertLocalWrite(req);
      } catch {
        throw new VideoDepthError('not-local', '拒绝跨来源的深度视频请求', 403);
      }
      const input = parseVideoDepthRequest(req.body);
      const result = await generateDepth(match[1]!, input);
      const body: VideoDepthResponse = {
        ok: true,
        code: 0,
        data: result,
        message: '深度视频生成成功',
      };
      logger.info('request completed', { status: 200, durationMs: Date.now() - started });
      return { status: 200, body };
    } catch (error) {
      const failure = videoDepthFailure(error);
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
