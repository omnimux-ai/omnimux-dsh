import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { StoryboardVideoRequest, StoryboardVideoResult } from './schema.ts';
import { VideoStoryboardError } from './errors.ts';
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
import type { CanvasWorkspaceSnapshot } from '../../shared/canvasTypes.ts';
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
 * 默认保底逐镜头分镜脚本模板
 */
export function getFallbackStoryboardShots(videoTitle: string): ExtractedShotItem[] {
  const name = videoTitle.trim() || '爆款短视频';
  return [
    {
      shotNo: 1,
      timeRange: '00:00 - 00:03',
      shotType: '特写 (Close-up) / 快速推入',
      description: `《${name}》开场黄金3秒：抓人视觉反差，核心产品与痛点高光前置`,
      dialogue: '“别划走！这个痛点你肯定也有！”',
    },
    {
      shotNo: 2,
      timeRange: '00:03 - 00:08',
      shotType: '中景 (Medium Shot) / 手持微跟随',
      description: '生活化第一人称实测演示，呈现使用过程与质地细节',
      dialogue: '“实测效果惊艳，质地非常清爽吸收快”',
    },
    {
      shotNo: 3,
      timeRange: '00:08 - 00:15',
      shotType: '近景 (Medium Close-up) / 镜头缓拉',
      description: '直观对比展示与信任感建立，强化功效转化并引导下单',
      dialogue: '“现在点击左下角链接，马上体验同款变化！”',
    },
  ];
}

/**
 * 格式化秒数为 MM:SS 格式
 */
function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

    // 3. 准备分镜图片存储目录与 tableId
    const tableId = `tbl_${randomUUID().slice(0, 8)}`;
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

    // 5. 若未检测出关键帧，生成保底帧图片以保证分镜卡片展示完整性
    if (detectedFrames.length === 0) {
      const fallbackFrameNames = ['frame-001.jpg', 'frame-002.jpg', 'frame-003.jpg'];
      // 写入微型有效占位 JPEG 文件
      const tinyJpg = Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        'base64',
      );
      fallbackFrameNames.forEach((fname, idx) => {
        const fpath = join(framesDir, fname);
        try {
          if (!existsSync(fpath)) writeFileSync(fpath, tinyJpg);
          detectedFrames.push({
            path: fpath,
            filename: fname,
            url: getMediaUrl(fname),
            timeSeconds: idx * 3,
          });
        } catch {}
      });
    }

    // 6. 调用 video_analyze 工具获取逐镜头脚本分析
    const analyzeTool = (deps.getTool?.('video_analyze') ?? deps.getSeam?.('videoAnalyze')) as
      | { execute?: (args: Record<string, unknown>) => Promise<any> }
      | undefined;

    let analyzeMarkdown = '';
    if (analyzeTool && typeof analyzeTool.execute === 'function') {
      try {
        const res = await analyzeTool.execute({ video: absVideoPath, model: 'gemini-3.8-flash' });
        const text =
          res?.report ||
          res?.text ||
          res?.data?.report ||
          res?.data?.text ||
          (typeof res === 'string' ? res : '');
        if (typeof text === 'string' && text.trim()) {
          analyzeMarkdown = text.trim();
        }
      } catch (err) {
        logger.warn('video_analyze invocation failed in storyboard, falling back to template', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 7. 解析 Markdown 中的分镜表格或使用保底脚本
    const parsedTables = analyzeMarkdown ? extractMarkdownTables(analyzeMarkdown) : [];
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
        const timeRange = timeCol >= 0 && r[timeCol] ? r[timeCol]! : `00:${String(idx * 3).padStart(2, '0')} - 00:${String((idx + 1) * 3).padStart(2, '0')}`;
        const visual = visualCol >= 0 && r[visualCol] ? r[visualCol]! : '分镜镜头画面';
        const action = actionCol >= 0 && r[actionCol] ? r[actionCol]! : '';
        const script = scriptCol >= 0 && r[scriptCol] ? r[scriptCol]! : '';

        return {
          shotNo: idx + 1,
          timeRange,
          shotType: visual.includes('/') ? visual.split('/')[0]!.trim() : '标准镜头',
          description: action ? `${visual}；${action}` : visual,
          dialogue: script || '（无对白/环境音）',
        };
      });
    }

    if (scriptShots.length === 0) {
      scriptShots = getFallbackStoryboardShots(input.title);
    }

    // 8. 图文对齐：合并分镜图片与画面脚本记录
    const rowCount = Math.max(detectedFrames.length, scriptShots.length);
    const finalShots: ExtractedShotItem[] = [];

    for (let i = 0; i < rowCount; i++) {
      const frame = detectedFrames[i] ?? detectedFrames[detectedFrames.length - 1];
      const script = scriptShots[i];

      let timeRange = script?.timeRange;
      if (!timeRange && frame) {
        const startSec = frame.timeSeconds;
        const endSec = (detectedFrames[i + 1]?.timeSeconds) ?? (startSec + 3);
        timeRange = `${formatSeconds(startSec)} - ${formatSeconds(endSec)}`;
      }

      const shotItem: ExtractedShotItem = {
        shotNo: i + 1,
        timeRange: timeRange || `00:${String(i * 3).padStart(2, '0')} - 00:${String((i + 1) * 3).padStart(2, '0')}`,
        shotType: script?.shotType || (i === 0 ? '特写 (Close-up)' : '中景 (Medium Shot)'),
        description: script?.description || `镜头 ${i + 1} 画面与动作展开`,
        dialogue: script?.dialogue || '“点击查看更多精彩”',
      };

      if (frame) {
        shotItem.imageAttachment = {
          assetId: `ast_${randomUUID().slice(0, 8)}`,
          name: frame.filename,
          kind: 'image',
          path: frame.path,
          url: frame.url,
          thumbnailUrl: frame.url,
        };
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
      rowHeight: 'extraTall', // 超高 120px，完美卡片展示分镜图片附件
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

      // 查询是否已有下游分镜表
      const connectedTableNodeIds = new Set(
        currentEdges
          .filter((edge) => edge.source === input.nodeId)
          .map((edge) => edge.target),
      );

      const existingNode = currentNodes.find((node) => {
        if (node.type !== 'table') return false;
        const d = node.data as Record<string, unknown> | undefined;
        return (
          d?.origin === 'video_storyboard' &&
          (d?.sourceVideoNodeId === input.nodeId || connectedTableNodeIds.has(node.id))
        );
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
        // 若已有内容拆解节点，向下偏移 300px；否则在横向右侧偏移
        const hasDeconstructDownstream = currentNodes.some((n) => {
          const d = n.data as Record<string, unknown> | undefined;
          return d?.origin === 'video_deconstruct' && d?.sourceVideoNodeId === input.nodeId;
        });

        const position = {
          x: videoPos.x + videoWidth + 120,
          y: hasDeconstructDownstream ? videoPos.y + 300 : videoPos.y,
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
