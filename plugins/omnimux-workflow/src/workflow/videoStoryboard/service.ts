import { existsSync, mkdirSync, statSync } from 'node:fs';
import { isAbsolute, join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { StoryboardVideoRequest, StoryboardVideoResult } from './schema.ts';
import { VideoStoryboardError } from './errors.ts';
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
} from '../../shared/types/htable.ts';
import { resolveTableAbsPath, resolveTableRelativePath } from '../storage/tablePath.ts';
import { TableStorageService } from '../storage/TableStorageService.ts';
import { mutateWorkspaceGraph } from '../graph/GraphMutator.ts';
import { createWorkflowLogger } from '../execution/logger.ts';
import type { CanvasInputMutation, CanvasNode } from '../../shared/graph/canvasInputMutationGateway.ts';
import type { CanvasWorkspaceSnapshot, SerializedCanvasEdge } from '../../shared/canvasTypes.ts';
import { resolveVideoAbsolutePath, extractMarkdownTables } from '../videoDeconstruct/service.ts';

export interface VideoStoryboardServiceDeps {
  store: WorkspaceStore;
  getTool?: (name: string) => unknown;
  getSeam?: (name: string) => unknown;
  mediaDir?: string;
  resolveProjectFile?: (workspaceId: string, rel: string) => string;
}

export interface ExtractedShotItem {
  shotNo: number;
  timeRange: string;
  shotType: string;
  description: string;
  dialogue: string;
  imageAttachment?: HTableAttachment;
}

/**
 * 格式化秒数为 MM:SS 格式
 */
function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 解析分镜时间段字符串并返回中心截图秒数
 * 支持格式：00:00 - 00:02, 02-05s, 05-08, 00:05 等
 */
export function parseTimeRangeSeconds(timeRange: string, fallbackSec = 0): number {
  if (!timeRange || typeof timeRange !== 'string') return fallbackSec;
  const cleaned = timeRange.trim();

  // 匹配 MM:SS - MM:SS 或 M:SS - M:SS
  const rangeColonMatch = /(\d{1,2}):(\d{2})(?:\.(\d+))?\s*[-~至到]\s*(\d{1,2}):(\d{2})(?:\.(\d+))?/.exec(cleaned);
  if (rangeColonMatch) {
    const s1 = Number(rangeColonMatch[1]) * 60 + Number(rangeColonMatch[2]) + (rangeColonMatch[3] ? Number('0.' + rangeColonMatch[3]) : 0);
    const s2 = Number(rangeColonMatch[4]) * 60 + Number(rangeColonMatch[5]) + (rangeColonMatch[6] ? Number('0.' + rangeColonMatch[6]) : 0);
    return Math.max(0, (s1 + s2) / 2);
  }

  // 匹配单纯数字区间，如 00-02s, 03-05s, 00-02
  const rangeSecMatch = /(\d+(?:\.\d+)?)\s*[-~至到]\s*(\d+(?:\.\d+)?)/.exec(cleaned);
  if (rangeSecMatch) {
    const s1 = Number(rangeSecMatch[1]);
    const s2 = Number(rangeSecMatch[2]);
    return Math.max(0, (s1 + s2) / 2);
  }

  // 单个时间点 MM:SS
  const singleColonMatch = /(\d{1,2}):(\d{2})(?:\.(\d+))?/.exec(cleaned);
  if (singleColonMatch) {
    return Number(singleColonMatch[1]) * 60 + Number(singleColonMatch[2]) + (singleColonMatch[3] ? Number('0.' + singleColonMatch[3]) : 0);
  }

  const singleSecMatch = /^(\d+(?:\.\d+)?)/.exec(cleaned);
  if (singleSecMatch) {
    return Number(singleSecMatch[1]);
  }

  return fallbackSec;
}

/**
 * 抽取视频指定时间秒数处的一帧作为分镜画面图片
 */
export async function extractVideoFrame(
  videoPath: string,
  timeSec: number,
  destPath: string,
  videoProcess?: { execute?: (args: Record<string, unknown>) => Promise<any> },
): Promise<boolean> {
  // 1. 优先调用 videoProcess 服务
  if (videoProcess && typeof videoProcess.execute === 'function') {
    try {
      await videoProcess.execute({
        capability: 'video_thumbnail_extract',
        input: {
          videoUrl: videoPath,
          timeSeconds: Math.max(0, timeSec),
          maxEdge: 640,
        },
        dest: destPath,
      });
      if (existsSync(destPath) && statSync(destPath).size > 500) {
        return true;
      }
    } catch {}
  }

  // 2. 宿主直接探测执行 ffmpeg (检查标准 brew/usr 目录)
  const candidateBins = ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
  for (const bin of candidateBins) {
    try {
      const res = spawnSync(bin, [
        '-ss', String(Math.max(0, timeSec)),
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', '2',
        '-y', destPath,
      ], { timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
      if (res.status === 0 && existsSync(destPath) && statSync(destPath).size > 500) {
        return true;
      }
    } catch {}
  }

  return false;
}

const logger = createWorkflowLogger('video-storyboard');

export function createVideoStoryboardService(deps: VideoStoryboardServiceDeps) {
  return async (
    workspaceId: string,
    input: Required<StoryboardVideoRequest>,
  ): Promise<StoryboardVideoResult> => {
    // 1. 校验工作区存在性
    deps.store.get(workspaceId);

    // 2. 解析视频绝对路径
    const absVideoPath = resolveVideoAbsolutePath(deps, workspaceId, input.videoPath);

    // 3. 寻找源视频节点并检查是否已有专属分镜表节点（严格匹配 origin === 'video_storyboard' && sourceVideoNodeId === input.nodeId）
    let existingNode: CanvasNode | undefined;
    let videoNode: CanvasNode | undefined;
    let currentEdges: SerializedCanvasEdge[] = [];
    try {
      const currentSnapshot = deps.store.get(workspaceId);
      const currentNodes = (currentSnapshot.nodes || []) as CanvasNode[];
      currentEdges = (currentSnapshot.edges || []) as SerializedCanvasEdge[];
      videoNode = currentNodes.find((n) => n.id === input.nodeId);

      existingNode = currentNodes.find((node) => {
        if (node.type !== 'table') return false;
        const d = node.data as Record<string, unknown> | undefined;
        return d?.origin === 'video_storyboard' && d?.sourceVideoNodeId === input.nodeId;
      });
    } catch {
      // ignore
    }

    const existingTableId = (existingNode?.data as Record<string, unknown> | undefined)?.tableId;
    const tableId = typeof existingTableId === 'string' && existingTableId.trim()
      ? existingTableId.trim()
      : (existingNode?.id || `tbl_${randomUUID().slice(0, 8)}`);
    const tablePath = resolveTableRelativePath(tableId);
    const tableAbsPath = resolveTableAbsPath(deps.store, workspaceId, tableId);
    const title = input.title?.trim() || '视频分镜表';

    // 图片存储物理目录：优先使用 mediaDir/storyboard/tableId，若无则存储在工作区下
    let framesDir: string;
    let getMediaUrl: (filename: string) => string;
    if (deps.mediaDir) {
      framesDir = join(deps.mediaDir, 'storyboard', tableId);
      getMediaUrl = (filename: string) => `/omnimux-workflow/media/storyboard/${tableId}/${filename}`;
    } else {
      framesDir = join(deps.store.workspacesDir, workspaceId, '.omnimux', 'media', 'storyboard', tableId);
      getMediaUrl = (filename: string) => `/api/local-file?path=${encodeURIComponent(join(framesDir, filename))}`;
    }

    if (!existsSync(framesDir)) {
      try {
        mkdirSync(framesDir, { recursive: true });
      } catch {}
    }

    // 4. 调用 video_process (capability: 'video_scene_detect') 进行分镜切分与图片抽取
    const videoProcess = (deps.getSeam?.('videoProcess') ?? deps.getTool?.('video_process')) as
      | { execute?: (args: Record<string, unknown>) => Promise<any> }
      | undefined;

    interface DetectedFrameInfo {
      path: string;
      filename: string;
      url: string;
      timeSeconds: number;
    }
    const detectedFrames: DetectedFrameInfo[] = [];
    const scenes: Array<{ start: number; end?: number }> = [];

    if (videoProcess && typeof videoProcess.execute === 'function') {
      try {
        const detectRes = await videoProcess.execute({
          capability: 'video_scene_detect',
          input: {
            videoUrl: absVideoPath,
            threshold: 0.35,
            extractFrames: true,
          },
          dest: framesDir,
        });

        if (Array.isArray(detectRes?.files)) {
          for (const f of detectRes.files) {
            if (f && typeof f.path === 'string' && existsSync(f.path)) {
              const fname = basename(f.path);
              detectedFrames.push({
                path: f.path,
                filename: fname,
                url: getMediaUrl(fname),
                timeSeconds: typeof f.meta?.timeSeconds === 'number' ? f.meta.timeSeconds : 0,
              });
            }
          }
        }

        if (Array.isArray(detectRes?.result?.scenes)) {
          scenes.push(...detectRes.result.scenes);
        }
      } catch {
        // 抽帧异常容错降级
      }
    }

    // 5. 调用 video_analyze 工具获取逐镜头脚本分析（失败即报错，不做保底降级）
    const analyzeTool = (deps.getTool?.('video_analyze') ?? deps.getSeam?.('videoAnalyze')) as
      | { execute?: (args: Record<string, unknown>) => Promise<any> }
      | undefined;

    if (!analyzeTool || typeof analyzeTool.execute !== 'function') {
      throw new VideoStoryboardError(
        'analyze-unavailable',
        '视频理解能力不可用，请确认已启用视频理解能力后重试',
        502,
      );
    }

    let analyzeMarkdown = '';
    try {
      const res = await analyzeTool.execute({ video: absVideoPath, model: 'gemini-3.8-flash' });
      const text =
        res?.report ||
        res?.text ||
        res?.data?.report ||
        res?.data?.text ||
        (typeof res === 'string' ? res : '');
      if (typeof text === 'string') analyzeMarkdown = text.trim();
    } catch (err) {
      const failure = describeVideoAnalyzeFailure(err);
      logger.error('video_analyze invocation failed', {
        code: failure.code,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new VideoStoryboardError(failure.code, failure.message, 502);
    }

    if (!analyzeMarkdown) {
      throw new VideoStoryboardError(
        'analyze-empty',
        '视频理解未返回可用的分析内容，请重试',
        502,
      );
    }

    // 6. 解析 Markdown 中的分镜表格（解析不到真实镜头即报错）
    const parsedTables = extractMarkdownTables(analyzeMarkdown);
    let scriptShots: ExtractedShotItem[] = [];

    if (parsedTables.length > 0 && parsedTables[0]!.rows.length > 0) {
      const t = parsedTables[0]!;
      // 寻找对应的列索引
      const findColIdx = (keywords: string[]) =>
        t.headers.findIndex((h) => keywords.some((k) => h.includes(k)));

      const timeCol = findColIdx(['时间', 'Time', '时间码']);
      const visualCol = findColIdx(['画面', 'Visual', '描述', 'Shot', '景别']);
      const actionCol = findColIdx(['动作', 'Action', '关键动作']);
      const scriptCol = findColIdx(['脚本', 'Script', '台词', '模板']);

      scriptShots = t.rows.map((r, idx) => {
        const timeRange = timeCol >= 0 && r[timeCol] ? r[timeCol]! : '';
        const visual = visualCol >= 0 && r[visualCol] ? r[visualCol]! : '';
        const action = actionCol >= 0 && r[actionCol] ? r[actionCol]! : '';
        const script = scriptCol >= 0 && r[scriptCol] ? r[scriptCol]! : '';

        return {
          shotNo: idx + 1,
          timeRange,
          shotType: visual.includes('/') ? visual.split('/')[0]!.trim() : '',
          description: action ? (visual ? `${visual}；${action}` : action) : visual,
          dialogue: script || '（无对白/环境音）',
        };
      });
    }

    if (scriptShots.length === 0) {
      throw new VideoStoryboardError(
        'shots-empty',
        '未能从视频理解结果中解析出分镜镜头，请重试',
        502,
      );
    }

    // 7. 逐镜头抽取关键帧配图：行由真实分镜脚本驱动，抽帧失败留空（不写占位图）
    const finalShots: ExtractedShotItem[] = [];

    for (let i = 0; i < scriptShots.length; i++) {
      const frame = detectedFrames[i];
      const script = scriptShots[i]!;

      let timeRange = script.timeRange;
      if (!timeRange && frame) {
        const startSec = frame.timeSeconds;
        const endSec = (detectedFrames[i + 1]?.timeSeconds) ?? (startSec + 3);
        timeRange = `${formatSeconds(startSec)} - ${formatSeconds(endSec)}`;
      }
      const effectiveTimeRange = timeRange || '';

      const shotItem: ExtractedShotItem = {
        shotNo: i + 1,
        timeRange: effectiveTimeRange,
        shotType: script.shotType,
        description: script.description,
        dialogue: script.dialogue,
      };

      const fname = `frame-${String(i + 1).padStart(3, '0')}.jpg`;
      const fpath = join(framesDir, fname);

      // 1. 若 scene_detect 抽出的 frame 存在且有效 (> 500 bytes)，优先复用
      if (frame && existsSync(frame.path) && statSync(frame.path).size > 500) {
        shotItem.imageAttachment = {
          assetId: `ast_${randomUUID().slice(0, 8)}`,
          name: frame.filename,
          kind: 'image',
          path: frame.path,
          url: frame.url,
          thumbnailUrl: frame.url,
        };
      } else {
        // 2. 按照分镜时间区间计算最佳中心截取秒数并抽取真实视频关键帧
        const captureSec = parseTimeRangeSeconds(effectiveTimeRange, i * 3 + 1);
        const extracted = await extractVideoFrame(absVideoPath, captureSec, fpath, videoProcess);
        if (extracted && existsSync(fpath) && statSync(fpath).size > 500) {
          shotItem.imageAttachment = {
            assetId: `ast_${randomUUID().slice(0, 8)}`,
            name: fname,
            kind: 'image',
            path: fpath,
            url: getMediaUrl(fname),
            thumbnailUrl: getMediaUrl(fname),
          };
        }
      }

      finalShots.push(shotItem);
    }

    // 9. 构造 HTable 列与行模型
    const colShotNo: HTableColumn = {
      id: newColumnId(),
      title: '镜头',
      type: 'text',
      visible: true,
      width: 70,
    };
    const colImage: HTableColumn = {
      id: newColumnId(),
      title: '分镜画面',
      type: 'attachment',
      visible: true,
      width: 180,
    };
    const colTime: HTableColumn = {
      id: newColumnId(),
      title: '时间码',
      type: 'text',
      visible: true,
      width: 130,
    };
    const colType: HTableColumn = {
      id: newColumnId(),
      title: '景别运镜',
      type: 'text',
      visible: true,
      width: 140,
    };
    const colDesc: HTableColumn = {
      id: newColumnId(),
      title: '画面脚本描述',
      type: 'text',
      visible: true,
      width: 380,
    };
    const colDialogue: HTableColumn = {
      id: newColumnId(),
      title: '台词/声音',
      type: 'text',
      visible: true,
      width: 260,
    };

    const columns: HTableColumn[] = [
      colShotNo,
      colImage,
      colTime,
      colType,
      colDesc,
      colDialogue,
    ];

    const rows: HTableRow[] = finalShots.map((shot) => {
      const cells: Record<string, HTableCellValue> = {
        [colShotNo.id]: String(shot.shotNo),
        [colImage.id]: shot.imageAttachment ? [shot.imageAttachment] : [],
        [colTime.id]: shot.timeRange,
        [colType.id]: shot.shotType,
        [colDesc.id]: shot.description,
        [colDialogue.id]: shot.dialogue,
      };
      return {
        id: newRowId(),
        cells,
      };
    });

    const doc: HTableDocument = {
      version: 1,
      title,
      columns,
      rows,
      rowHeight: 'low', // 默认标准行高 36px，微缩缩略图 + 鼠标悬停大图跟随预览
      origin: 'video_storyboard',
      sourceVideoNodeId: input.nodeId,
    };

    // 10. 持久化存储 .htable
    try {
      await TableStorageService.saveTable(tableAbsPath, doc);
    } catch (saveErr) {
      throw new VideoStoryboardError(
        'table-save-failed',
        `分镜表格保存失败: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
        500,
      );
    }

    // 11. 构造预览行列表
    const previewRows: string[] = doc.rows.slice(0, 3).map((r) => {
      const descVal = r.cells[colDesc.id];
      const shotVal = r.cells[colShotNo.id];
      if (typeof descVal === 'string' && descVal.trim()) {
        return `镜头 ${shotVal || ''}：${descVal.trim()}`;
      }
      return `镜头 ${shotVal || ''}`;
    });

    // 12. 服务端图变更：单一下游约束 (origin === 'video_storyboard')
    let workspaceSnapshot: CanvasWorkspaceSnapshot | undefined;
    try {
      const currentSnapshot = deps.store.get(workspaceId);
      const currentNodes = (currentSnapshot.nodes || []) as CanvasNode[];
      const currentEdges = currentSnapshot.edges || [];

      // 寻找源视频节点
      const videoNode = currentNodes.find((n) => n.id === input.nodeId);
      const videoPos = videoNode?.position ?? { x: 0, y: 0 };
      const rawWidth = (videoNode?.data as Record<string, unknown> | undefined)?.nodeWidth;
      const videoWidth = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : 350;

      const existingNode = currentNodes.find((node) => {
        if (node.type !== 'table') return false;
        const d = node.data as Record<string, unknown> | undefined;
        if (d?.origin === 'video_storyboard' && d?.sourceVideoNodeId === input.nodeId) {
          return true;
        }
        if (node.id === tableId || d?.tableId === tableId) {
          return true;
        }
        return false;
      });

      const nodeData: Record<string, unknown> = {
        label: title,
        title,
        tableId,
        tablePath,
        columnCount: doc.columns.length,
        rowCount: doc.rows.length,
        previewRows,
        origin: 'video_storyboard',
        sourceVideoNodeId: input.nodeId,
        status: 'ready',
      };

      let mutation: CanvasInputMutation;
      const canConnectEdge = Boolean(videoNode);

      if (existingNode) {
        // 已有分镜表节点：就地更新，补连缺线
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
        // 避免与可能已存在的内容拆解节点 (y + 0) 重叠：
        // 分镜表默认放置在右下方偏移 320px 处，形成一上一下独立两行规整排列
        const position = {
          x: videoPos.x + videoWidth + 120,
          y: videoPos.y + 320,
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
      shotCount: finalShots.length,
      workspace: workspaceSnapshot,
    };
  };
}
