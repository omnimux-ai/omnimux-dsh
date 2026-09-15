import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { DeconstructVideoRequest, DeconstructVideoResult } from './schema.ts';
import { VideoDeconstructError } from './errors.ts';
import { describeVideoAnalyzeFailure } from '../videoAnalyzeFailure.ts';
import {
  type HTableColumn,
  type HTableDocument,
  type HTableRow,
  type HTableAttachment,
  type HTableCellValue,
  defaultColumnWidth,
  newColumnId,
  newRowId,
  formatTablePreviewRows,
} from '../../shared/types/htable.ts';
import { resolveTableAbsPath, resolveTableRelativePath } from '../storage/tablePath.ts';
import { TableStorageService } from '../storage/TableStorageService.ts';
import { mutateWorkspaceGraph } from '../graph/GraphMutator.ts';
import { createWorkflowLogger } from '../execution/logger.ts';
import type { CanvasInputMutation, CanvasNode } from '../../shared/graph/canvasInputMutationGateway.ts';
import type { CanvasWorkspaceSnapshot, SerializedCanvasEdge } from '../../shared/canvasTypes.ts';
import { assertProjectWriteSafe, resolveProjectRelPath } from '../../projects/paths.ts';

export interface VideoDeconstructServiceDeps {
  store: WorkspaceStore;
  getTool?: (name: string) => unknown;
  getSeam?: (name: string) => unknown;
  mediaDir?: string;
  resolveProjectFile?: (workspaceId: string, rel: string) => string;
}

interface ParsedMarkdownTable {
  headers: string[];
  rows: string[][];
}

/**
 * 从 Markdown 文本中提取标准 Markdown 表格 (| 列1 | 列2 |)
 */
export function extractMarkdownTables(markdown: string): ParsedMarkdownTable[] {
  const lines = markdown.split(/\r?\n/);
  const tables: ParsedMarkdownTable[] = [];
  let currentHeader: string[] | null = null;
  let currentRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      if (!currentHeader) {
        // 检查下一行是否是分隔符行，如 |---|---|
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1]!.trim();
          if (nextLine.startsWith('|') && nextLine.endsWith('|')) {
            const sepCells = nextLine
              .slice(1, -1)
              .split('|')
              .map((s) => s.trim());
            const isSeparator = sepCells.length > 0 && sepCells.every((s) => /^:?-+:?$/.test(s));
            if (isSeparator && cells.length === sepCells.length) {
              currentHeader = cells;
              currentRows = [];
              i++; // 跳过分隔行
              continue;
            }
          }
        }
      } else {
        currentRows.push(cells);
      }
    } else {
      if (currentHeader && currentRows.length > 0) {
        tables.push({ headers: currentHeader, rows: currentRows });
      }
      currentHeader = null;
      currentRows = [];
    }
  }

  if (currentHeader && currentRows.length > 0) {
    tables.push({ headers: currentHeader, rows: currentRows });
  }

  return tables;
}

/**
 * 从 Markdown 中提取五维分析维度；未在文本中出现的维度不产出，绝不填充写死文案
 */
export function extractFiveDimensions(markdown: string): Array<{ dimension: string; content: string }> {
  const extractSection = (regexes: RegExp[]): string => {
    for (const r of regexes) {
      const match = markdown.match(r);
      if (match && match[1]?.trim()) {
        return match[1].trim().replace(/^>\s*/, '');
      }
    }
    return '';
  };

  const found: Array<{ dimension: string; content: string }> = [];
  const push = (dimension: string, content: string): void => {
    if (content) found.push({ dimension, content });
  };

  push('一句话描述', extractSection([
    /##\s*(?:一句话(?:视频)?描述|概要)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
    /(?:一句话描述|核心概述)[：:]\s*([^\n]+)/i,
  ]));

  push('核心目标', extractSection([
    /##\s*(?:I\.\s*)?(?:核心目标|转化目标)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
    /(?:核心目标|转化目标)[：:]\s*([^\n]+)/i,
  ]));

  push('影响力', extractSection([
    /##\s*(?:II\.\s*)?(?:影响力(?:分析)?|传播机制)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
    /(?:影响力|传播价值)[：:]\s*([^\n]+)/i,
  ]));

  push('叙事结构', extractSection([
    /##\s*(?:III\.\s*)?(?:叙事分析|叙事结构|脚本结构)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
    /(?:叙事分析|叙事结构)[：:]\s*([^\n]+)/i,
  ]));

  push('画面分析', extractSection([
    /##\s*(?:IV\.\s*)?(?:画面分析|视听分析|视觉语言)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
    /(?:画面分析|视觉节奏)[：:]\s*([^\n]+)/i,
  ]));

  push('复刻策略', extractSection([
    /##\s*(?:V\.\s*)?(?:核心复刻策略|复刻策略|实操建议)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
    /(?:复刻策略|翻拍公式)[：:]\s*([^\n]+)/i,
  ]));

  return found;
}

/**
 * 解析视频在本地文件系统中的绝对路径
 */
export function resolveVideoAbsolutePath(
  deps: VideoDeconstructServiceDeps,
  workspaceId: string,
  videoPath: string,
): string {
  const trimmed = videoPath.trim();

  // 1. 尝试从 local-file URL 还原（保留 query 参数用于提取 ?path=）
  const localMatch = /[\?&]path=([^&]+)/.exec(trimmed);
  if (localMatch?.[1]) {
    try {
      const decoded = decodeURIComponent(localMatch[1]);
      if (isAbsolute(decoded) && existsSync(decoded)) {
        return decoded;
      }
    } catch {}
  }

  // 1b. 尝试从项目文件流 URL 还原（?rel=<项目相对路径>）。已绑定项目的画布节点只带
  // relativePath + 该形式的 mediaUrl（没有 realPath），不识别它就会退化到把
  // /api/workspaces/<id>/file 当作绝对路径返回，存在性校验随即失败。
  const relMatch = /[\?&]rel=([^&]+)/.exec(trimmed);
  if (relMatch?.[1]) {
    try {
      const rel = decodeURIComponent(relMatch[1]);
      // 绝对路径不进项目相对解析；工作区标识以调用方传入的为准，不信任 query 参数。
      if (rel && !isAbsolute(rel)) {
        if (deps.resolveProjectFile) {
          try {
            const resolved = deps.resolveProjectFile(workspaceId, rel);
            if (resolved && existsSync(resolved)) return resolved;
          } catch {}
        }
        const boundRoot = deps.store.resolveProjectRoot(workspaceId);
        if (boundRoot?.path) {
          // 兜底分支同样复用项目路径安全原语：rel 来自请求体，必须挡住 ../ 与符号链接逃逸。
          const candidate = resolveProjectRelPath(boundRoot.path, rel);
          assertProjectWriteSafe(candidate, boundRoot.path);
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch {}
  }

  // 去除可能存在的 URL query/hash 参数，获得纯路径进行本地文件系统比对
  const cleanPath = trimmed.split(/[?#]/)[0] ?? trimmed;

  // 2. 本身已是存在的绝对路径
  if (isAbsolute(cleanPath) && existsSync(cleanPath)) {
    return cleanPath;
  }

  // 3. 剥除 /omnimux-workflow/media/ 或 /dsh-workflow/media/ 前缀
  let stripped = cleanPath;
  const mediaPrefixMatch = cleanPath.match(/(?:omnimux-workflow|dsh-workflow)\/media\/(.+)$/);
  if (mediaPrefixMatch?.[1]) {
    stripped = mediaPrefixMatch[1];
  }

  // 4. mediaDir 候选路径匹配
  if (deps.mediaDir) {
    // 4.1 尝试 join(deps.mediaDir, stripped)
    const candidateStripped = join(deps.mediaDir, stripped);
    if (existsSync(candidateStripped)) return candidateStripped;

    // 4.2 尝试 join(deps.mediaDir, 'videos', basename(stripped))
    const candidateVideos = join(deps.mediaDir, 'videos', basename(stripped));
    if (existsSync(candidateVideos)) return candidateVideos;

    // 4.3 尝试 join(deps.mediaDir, basename(stripped))
    const candidateBasename = join(deps.mediaDir, basename(stripped));
    if (existsSync(candidateBasename)) return candidateBasename;

    // 4.4 尝试 join(deps.mediaDir, cleanPath)
    const candidateClean = join(deps.mediaDir, cleanPath);
    if (existsSync(candidateClean)) return candidateClean;
  }

  // 5. 项目绑定工作区文件解析
  const bound = deps.store.resolveProjectRoot(workspaceId);
  if (bound && bound.path) {
    const candidateClean = join(bound.path, cleanPath);
    if (existsSync(candidateClean)) return candidateClean;
    const candidateStripped = join(bound.path, stripped);
    if (existsSync(candidateStripped)) return candidateStripped;
  }

  // 6. 工作区目录解析
  const wsCandidateClean = join(deps.store.workspacesDir, workspaceId, cleanPath);
  if (existsSync(wsCandidateClean)) return wsCandidateClean;
  const wsCandidateStripped = join(deps.store.workspacesDir, workspaceId, stripped);
  if (existsSync(wsCandidateStripped)) return wsCandidateStripped;

  // 7. resolveProjectFile 解析
  if (deps.resolveProjectFile) {
    try {
      const resolvedClean = deps.resolveProjectFile(workspaceId, cleanPath);
      if (existsSync(resolvedClean)) return resolvedClean;
      const resolvedStripped = deps.resolveProjectFile(workspaceId, stripped);
      if (existsSync(resolvedStripped)) return resolvedStripped;
    } catch {}
  }

  // 8. 若找不到本地文件但给的是有效 HTTP(S) URL，保留作为输入传递给拆解服务
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // 保底：若 cleanPath 已经是绝对路径则返回，否则返回工作区下的完整路径
  return isAbsolute(cleanPath) ? cleanPath : join(deps.store.workspacesDir, workspaceId, cleanPath);
}

const logger = createWorkflowLogger('video-deconstruct');

export function createVideoDeconstructService(deps: VideoDeconstructServiceDeps) {
  return async (
    workspaceId: string,
    input: Required<DeconstructVideoRequest>,
  ): Promise<DeconstructVideoResult> => {
    // 1. 校验工作区存在性
    deps.store.get(workspaceId);

    // 2. 解析视频绝对路径
    const absVideoPath = resolveVideoAbsolutePath(deps, workspaceId, input.videoPath);

    // 3. 查找是否有已有下游表格节点，严格复用已有 tableId 与物理文件，避免生成游离碎片文件
    let existingNode: CanvasNode | undefined;
    let videoNode: CanvasNode | undefined;
    let currentNodes: CanvasNode[] = [];
    let currentEdges: SerializedCanvasEdge[] = [];

    try {
      const currentSnapshot = deps.store.get(workspaceId);
      currentNodes = (currentSnapshot.nodes || []) as CanvasNode[];
      currentEdges = (currentSnapshot.edges || []) as SerializedCanvasEdge[];

      videoNode = currentNodes.find((n) => n.id === input.nodeId);

      const connectedTableNodeIds = new Set(
        currentEdges
          .filter((edge) => edge.source === input.nodeId)
          .map((edge) => edge.target),
      );

      existingNode = currentNodes.find((node) => {
        if (node.type !== 'table') return false;
        const d = node.data as Record<string, unknown> | undefined;
        // 1. 严格匹配自身来源 (origin === 'video_deconstruct' && sourceVideoNodeId === input.nodeId)
        if (d?.origin === 'video_deconstruct' && d?.sourceVideoNodeId === input.nodeId) {
          return true;
        }
        // 2. 绝不跨类型匹配分镜表节点（即便连线连接）
        if (d?.origin === 'video_storyboard') {
          return false;
        }
        // 3. 仅对完全没有 origin 标识的遗留通用表格做连线容错
        return !d?.origin && connectedTableNodeIds.has(node.id);
      });
    } catch {
      // ignore
    }

    const existingTableId = (existingNode?.data as Record<string, unknown> | undefined)?.tableId;
    const tableId = typeof existingTableId === 'string' && existingTableId.trim()
      ? existingTableId.trim()
      : (existingNode?.id || `tbl_${randomUUID().slice(0, 8)}`);
    const targetTableId = tableId;

    const tablePath = resolveTableRelativePath(tableId);
    const tableAbsPath = resolveTableAbsPath(deps.store, workspaceId, tableId);

    const title = input.title?.trim() || ((existingNode?.data as Record<string, unknown> | undefined)?.title as string) || '视频内容拆解表';

    // 4. 调用 video_analyze 工具或 videoAnalyze 接缝执行五维拆解（失败即报错，不做保底降级）
    const tool = (deps.getTool?.('video_analyze') ?? deps.getSeam?.('videoAnalyze')) as
      | { execute?: (args: Record<string, unknown>) => Promise<any> }
      | undefined;

    if (!tool || typeof tool.execute !== 'function') {
      throw new VideoDeconstructError(
        'analyze-unavailable',
        '视频理解能力不可用，请确认已启用视频理解能力后重试',
        502,
      );
    }

    let markdown = '';
    try {
      const res = await tool.execute({ video: absVideoPath, model: 'gemini-3.8-flash' });
      const text =
        res?.report ||
        res?.text ||
        res?.data?.report ||
        res?.data?.text ||
        (typeof res === 'string' ? res : '');
      if (typeof text === 'string') markdown = text.trim();
    } catch (err) {
      const failure = describeVideoAnalyzeFailure(err);
      logger.error('video_analyze invocation failed', {
        code: failure.code,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new VideoDeconstructError(failure.code, failure.message, 502);
    }

    if (!markdown) {
      throw new VideoDeconstructError(
        'analyze-empty',
        '视频理解未返回可用的分析内容，请重试',
        502,
      );
    }

    // 5. 结构化解析：提取五维分析维度构造标准内容拆解表（分析维度 + 分析内容）
    const dimensions = extractFiveDimensions(markdown);
    if (dimensions.length === 0) {
      throw new VideoDeconstructError(
        'analyze-empty',
        '未能从视频理解结果中解析出分析维度，请重试',
        502,
      );
    }
    const colDim: HTableColumn = {
      id: newColumnId(),
      title: '分析维度',
      type: 'text',
      visible: true,
      width: 160,
    };
    const colContent: HTableColumn = {
      id: newColumnId(),
      title: '分析内容',
      type: 'text',
      visible: true,
      width: 540,
    };
    const columns: HTableColumn[] = [colDim, colContent];

    const rows: HTableRow[] = dimensions.map((item) => ({
      id: newRowId(),
      cells: {
        [colDim.id]: item.dimension,
        [colContent.id]: item.content,
      },
    }));

    const docRowHeight: HTableDocument['rowHeight'] = 'low';

    const prevContentRev = typeof (existingNode?.data as Record<string, unknown> | undefined)?.contentRev === 'number'
      ? ((existingNode!.data as Record<string, unknown>).contentRev as number)
      : 0;
    const contentRev = prevContentRev + 1;

    const doc: HTableDocument = {
      version: 1,
      contentRev,
      title,
      columns,
      rows,
      rowHeight: docRowHeight,
      origin: 'video_deconstruct',
      sourceVideoNodeId: input.nodeId,
    };

    // 10. 持久化存储 .htable（覆盖至已有文件或新建文件）
    try {
      await TableStorageService.saveTable(tableAbsPath, doc);
    } catch (saveErr) {
      throw new VideoDeconstructError(
        'table-save-failed',
        `拆解表格保存失败: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
        500,
      );
    }

    // 11. 构造富有信息量的预览行列表
    const previewRows = formatTablePreviewRows(doc, 3);

    // 9. 服务端图变更：单一下游约束，原子写入工作区 canvas.json 持久化
    let workspaceSnapshot: CanvasWorkspaceSnapshot | undefined;
    try {
      const videoPos = videoNode?.position ?? { x: 0, y: 0 };
      const rawWidth = (videoNode?.data as Record<string, unknown> | undefined)?.nodeWidth;
      const videoWidth = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : 350;

      const nodeData: Record<string, unknown> = {
        label: title,
        title,
        tableId,
        tablePath,
        columnCount: doc.columns.length,
        rowCount: doc.rows.length,
        previewRows,
        contentRev,
        origin: 'video_deconstruct',
        sourceVideoNodeId: input.nodeId,
        status: 'ready',
      };

      let mutation: CanvasInputMutation;
      const canConnectEdge = Boolean(videoNode);

      if (existingNode) {
        // 已有与该视频节点连线或关联的表格节点：就地更新，严格复用已有 tableId，缺线补线
        const hasEdge = currentEdges.some(
          (e) =>
            e.source === input.nodeId &&
            e.target === existingNode.id &&
            (e.sourceHandle === undefined || e.sourceHandle === null || e.sourceHandle === 'out') &&
            (e.targetHandle === undefined || e.targetHandle === null || e.targetHandle === 'in'),
        );
        mutation = {
          nodePatches: [
            {
              nodeId: existingNode.id,
              data: nodeData,
            },
          ],
          addEdges: (hasEdge || !canConnectEdge)
            ? []
            : [
                {
                  id: `edge_${input.nodeId}_${existingNode.id}`,
                  source: input.nodeId,
                  target: existingNode.id,
                  sourceHandle: 'out',
                  targetHandle: 'in',
                },
              ],
        };
      } else {
        // 新建节点：在视频节点右侧插入，如果已有分镜表在 y，则错开排布避免重叠
        const hasStoryboardDownstream = currentNodes.some((n) => {
          const d = n.data as Record<string, unknown> | undefined;
          return d?.origin === 'video_storyboard' && d?.sourceVideoNodeId === input.nodeId;
        });
        const storyboardNode = hasStoryboardDownstream
          ? currentNodes.find((n) => (n.data as any)?.origin === 'video_storyboard' && (n.data as any)?.sourceVideoNodeId === input.nodeId)
          : undefined;
        const isStoryboardAtY = storyboardNode && Math.abs((storyboardNode.position?.y ?? 0) - videoPos.y) < 50;

        const position = {
          x: videoPos.x + videoWidth + 120,
          y: isStoryboardAtY ? videoPos.y - 320 : videoPos.y,
        };
        const newNode: CanvasNode = {
          id: tableId,
          type: 'table',
          position,
          data: nodeData,
        };
        mutation = {
          addNodes: [newNode],
          addEdges: canConnectEdge
            ? [
                {
                  id: `edge_${input.nodeId}_${tableId}`,
                  source: input.nodeId,
                  target: tableId,
                  sourceHandle: 'out',
                  targetHandle: 'in',
                },
              ]
            : [],
        };
      }

      const mutResult = mutateWorkspaceGraph(deps.store, workspaceId, mutation);
      if (mutResult.ok) {
        workspaceSnapshot = mutResult.snapshot;
      }
    } catch {
      // 容错处理：图变更若异常，不阻断拆解核心产物返回
    }

    return {
      tableId,
      tablePath,
      title,
      columnCount: doc.columns.length,
      rowCount: doc.rows.length,
      previewRows,
      markdown,
      workspace: workspaceSnapshot,
    };
  };
}
