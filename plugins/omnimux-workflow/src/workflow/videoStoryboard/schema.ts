import type { CanvasWorkspaceSnapshot } from '../../shared/canvasTypes.ts';
import { VideoStoryboardError } from './errors.ts';

function invalid(message: string): never {
  throw new VideoStoryboardError('invalid-request', message, 400);
}

export interface StoryboardVideoRequest {
  nodeId: string;
  videoPath: string;
  title?: string;
  /** 客户端预建的下游表格节点 id；省略或 trim 后为空视为未提供。 */
  targetNodeId?: string;
}

/** 解析结果：nodeId/videoPath/title 必填，targetNodeId 仍为可选（未提供时不落键）。 */
export type ParsedStoryboardVideoRequest =
  Required<Omit<StoryboardVideoRequest, 'targetNodeId'>> & Pick<StoryboardVideoRequest, 'targetNodeId'>;

const TARGET_NODE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function parseStoryboardVideoRequest(raw: unknown): ParsedStoryboardVideoRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    invalid('请求体必须是 JSON 对象');
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.nodeId !== 'string' || !body.nodeId.trim() || /[\x00-\x1f]/.test(body.nodeId)) {
    invalid('nodeId 必须是非空节点标识');
  }
  if (typeof body.videoPath !== 'string' || !body.videoPath.trim() || /[\x00-\x1f]/.test(body.videoPath)) {
    invalid('videoPath 必须是非空视频路径或可访问地址');
  }

  let title = '视频分镜表';
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      invalid('title 必须是字符串');
    }
    const trimmed = body.title.trim();
    if (trimmed) title = trimmed;
  }

  let targetNodeId: string | undefined;
  if (body.targetNodeId !== undefined) {
    if (typeof body.targetNodeId !== 'string') {
      invalid('targetNodeId 必须是字符串');
    }
    const trimmed = body.targetNodeId.trim();
    // trim 后为空视为未提供，只有非空值才参与字符白名单校验
    if (trimmed) {
      if (!TARGET_NODE_ID_PATTERN.test(trimmed)) {
        invalid('targetNodeId 只能包含字母、数字、下划线和连字符，且必须以字母或数字开头');
      }
      targetNodeId = trimmed;
    }
  }

  return {
    nodeId: body.nodeId.trim(),
    videoPath: body.videoPath.trim(),
    title,
    ...(targetNodeId ? { targetNodeId } : {}),
  };
}

export interface StoryboardVideoResult {
  tableId: string;
  tablePath: string;
  title: string;
  columnCount: number;
  rowCount: number;
  previewRows: string[];
  shotCount: number;
  workspace?: CanvasWorkspaceSnapshot;
}

export interface StoryboardVideoResponse {
  ok: boolean;
  code: number;
  data: StoryboardVideoResult | null;
  message: string;
  error?: string;
  tableId?: string;
  tablePath?: string;
  title?: string;
  columnCount?: number;
  rowCount?: number;
  previewRows?: string[];
  shotCount?: number;
  workspace?: CanvasWorkspaceSnapshot;
}
