import { WORKFLOW_ROUTE_PREFIX } from '../../shared/api.ts';
import { assertLocalWrite } from '../../http/helpers.ts';
import { createWorkflowLogger } from '../execution/logger.ts';
import { VideoDeconstructError, videoDeconstructFailure } from '../videoDeconstruct/errors.ts';
import {
  parseDeconstructVideoRequest,
  type DeconstructVideoResponse,
} from '../videoDeconstruct/schema.ts';
import {
  createVideoDeconstructService,
  type VideoDeconstructServiceDeps,
} from '../videoDeconstruct/service.ts';
import type { RouteTry } from './dispatch.ts';

export function createVideoDeconstructRoutes(
  deps: VideoDeconstructServiceDeps,
): { tryHandle: RouteTry } {
  const route = new RegExp(`^${WORKFLOW_ROUTE_PREFIX}/api/workspaces/([^/]+)/deconstruct-video$`);
  const deconstruct = createVideoDeconstructService(deps);
  const logger = createWorkflowLogger('video-deconstruct');
  const tryHandle: RouteTry = async (method, path, req) => {
    const match = route.exec(path);
    if (!match || method !== 'POST') return null;
    const started = Date.now();
    try {
      try {
        assertLocalWrite(req);
      } catch {
        throw new VideoDeconstructError('not-local', '拒绝跨来源的视频拆解请求', 403);
      }
      const input = parseDeconstructVideoRequest(req.body);
      const result = await deconstruct(match[1]!, input);
      const body: DeconstructVideoResponse = {
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
        markdown: result.markdown,
      };
      logger.info('request completed', { status: 200, durationMs: Date.now() - started });
      return { status: 200, body };
    } catch (error) {
      const failure = videoDeconstructFailure(error);
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
