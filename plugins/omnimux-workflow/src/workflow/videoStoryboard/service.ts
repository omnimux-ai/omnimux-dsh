import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
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

    // 5. 调用 video_analyze 工具获取逐镜头脚本分析
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

    // 6. 解析 Markdown 中的分镜表格或使用保底脚本
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

    // 7. 图文对齐与精确抽帧：确保每个分镜镜头都有对应时间段的高清视频画面
    const rowCount = Math.max(detectedFrames.length, scriptShots.length);
    const finalShots: ExtractedShotItem[] = [];

    for (let i = 0; i < rowCount; i++) {
      const frame = detectedFrames[i];
      const script = scriptShots[i];

      let timeRange = script?.timeRange;
      if (!timeRange && frame) {
        const startSec = frame.timeSeconds;
        const endSec = (detectedFrames[i + 1]?.timeSeconds) ?? (startSec + 3);
        timeRange = `${formatSeconds(startSec)} - ${formatSeconds(endSec)}`;
      }

      const defaultTime = `00:${String(i * 3).padStart(2, '0')} - 00:${String((i + 1) * 3).padStart(2, '0')}`;
      const effectiveTimeRange = timeRange || defaultTime;

      const shotItem: ExtractedShotItem = {
        shotNo: i + 1,
        timeRange: effectiveTimeRange,
        shotType: script?.shotType || (i === 0 ? '特写 (Close-up)' : '中景 (Medium Shot)'),
        description: script?.description || `镜头 ${i + 1} 画面与动作展开`,
        dialogue: script?.dialogue || '“点击查看更多精彩”',
      };

      const fname = `frame-${String(i + 1).padStart(3, '0')}.jpg`;
      const fpath = join(framesDir, fname);

      let hasValidFrame = false;
      // 1. 若 scene_detect 抽出的 frame 存在且有效 (> 500 bytes)，优先复用
      if (frame && existsSync(frame.path) && statSync(frame.path).size > 500) {
        hasValidFrame = true;
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
          hasValidFrame = true;
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

      // 3. 保底：若所有抽帧均失败（如无解码器或假文件），保留已有路径或写入占位文件保证渲染
      if (!hasValidFrame) {
        if (frame && existsSync(frame.path)) {
          shotItem.imageAttachment = {
            assetId: `ast_${randomUUID().slice(0, 8)}`,
            name: frame.filename,
            kind: 'image',
            path: frame.path,
            url: frame.url,
            thumbnailUrl: frame.url,
          };
        } else {
          const tinyJpg = Buffer.from(
            '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
            'base64',
          );
          try {
            if (!existsSync(fpath)) writeFileSync(fpath, tinyJpg);
            shotItem.imageAttachment = {
              assetId: `ast_${randomUUID().slice(0, 8)}`,
              name: fname,
              kind: 'image',
              path: fpath,
              url: getMediaUrl(fname),
              thumbnailUrl: getMediaUrl(fname),
            };
          } catch {}
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
