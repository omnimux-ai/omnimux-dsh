import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import { assertLocalWrite } from '../../http/helpers.ts';
import { createWorkflowLogger } from '../execution/logger.ts';
import { VideoStoryboardError, videoStoryboardFailure } from '../videoStoryboard/errors.ts';
import {
  parseStoryboardVideoRequest,
  type StoryboardVideoResponse,
} from '../videoStoryboard/schema.ts';
import {
  createVideoStoryboardService,
  type VideoStoryboardServiceDeps,
} from '../videoStoryboard/service.ts';
import type { RouteTry } from './dispatch.ts';

export function createVideoStoryboardRoutes(
  deps: VideoStoryboardServiceDeps,
): { tryHandle: RouteTry } {
  const route = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/storyboard-video$`);
  const storyboard = createVideoStoryboardService(deps);
  const logger = createWorkflowLogger('video-storyboard');
  const tryHandle: RouteTry = async (method, path, req) => {
    const match = route.exec(path);
    if (!match || method !== 'POST') return null;
    const started = Date.now();
    try {
      try {
        assertLocalWrite(req);
      } catch {
        throw new VideoStoryboardError('not-local', '拒绝跨来源的视频分镜表请求', 403);
      }
      const input = parseStoryboardVideoRequest(req.body);
      const result = await storyboard(match[1]!, input);
      const body: StoryboardVideoResponse = {
        ok: true,
        code: 0,
        data: result,
        message: '',
        tableId: result.tableId,
        tablePath: result.tablePath,
        title: result.title,
        columnCount: result.columnCount,
        rowCount: result.rowCount,
        previewRows: result.previewRows,
        shotCount: result.shotCount,
        workspace: result.workspace,
      };
      logger.info('request completed', { status: 200, durationMs: Date.now() - started });
      return { status: 200, body };
    } catch (error) {
      const failure = videoStoryboardFailure(error);
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
