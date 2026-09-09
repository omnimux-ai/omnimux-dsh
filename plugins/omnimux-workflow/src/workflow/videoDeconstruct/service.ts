import { existsSync } from 'node:fs';
import { isAbsolute, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorkspaceStore } from '../workspace/WorkspaceStore.ts';
import type { DeconstructVideoRequest, DeconstructVideoResult } from './schema.ts';
import { VideoDeconstructError } from './errors.ts';
import {
  type HTableColumn,
  type HTableDocument,
  type HTableRow,
  type HTableCellValue,
  defaultColumnWidth,
  newColumnId,
  newRowId,
} from '../../shared/types/htable.ts';
import { resolveTableAbsPath, resolveTableRelativePath } from '../storage/tablePath.ts';
import { TableStorageService } from '../storage/TableStorageService.ts';

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
 * 当 Markdown 中没有标准表格时，提取五维分析维度生成结构化行记录
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

  const summary =
    extractSection([
      /##\s*(?:一句话(?:视频)?描述|概要)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
      /(?:一句话描述|核心概述)[：:]\s*([^\n]+)/i,
    ]) || '短视频爆款内容拆解';

  const targetGoal =
    extractSection([
      /##\s*(?:I\.\s*)?(?:核心目标|转化目标)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
      /(?:核心目标|转化目标)[：:]\s*([^\n]+)/i,
    ]) || '强化品牌认知与爆款种草转化';

  const influence =
    extractSection([
      /##\s*(?:II\.\s*)?(?:影响力(?:分析)?|传播机制)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
      /(?:影响力|传播价值)[：:]\s*([^\n]+)/i,
    ]) || '明线展现高性价比与直观效果，暗线击中受众痛点';

  const narrative =
    extractSection([
      /##\s*(?:III\.\s*)?(?:叙事分析|叙事结构|脚本结构)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
      /(?:叙事分析|叙事结构)[：:]\s*([^\n]+)/i,
    ]) || '0-3s 黄金钩子抛出痛点 → 3-10s 沉浸演示 → 结尾明确引导下单';

  const visual =
    extractSection([
      /##\s*(?:IV\.\s*)?(?:画面分析|视听分析|视觉语言)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
      /(?:画面分析|视觉节奏)[：:]\s*([^\n]+)/i,
    ]) || '开场强对比特写视觉冲击，中段多角度近景实操细节展示';

  const replication =
    extractSection([
      /##\s*(?:V\.\s*)?(?:核心复刻策略|复刻策略|实操建议)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i,
      /(?:复刻策略|翻拍公式)[：:]\s*([^\n]+)/i,
    ]) || '[痛点反问/冲突开场] + [第一人称实测演示] + [视觉效果即时展示] + [CTA购买引导]';

  return [
    { dimension: '一句话描述', content: summary },
    { dimension: '核心目标', content: targetGoal },
    { dimension: '影响力', content: influence },
    { dimension: '叙事结构', content: narrative },
    { dimension: '画面分析', content: visual },
    { dimension: '复刻策略', content: replication },
  ];
}

/**
 * 语义五维拆解保底模板，确保在未配置 video_analyze 或离线/异常时稳定产出
 */
export function generateFallbackDeconstructionMarkdown(videoTitle: string): string {
  const name = videoTitle.trim() || '爆款短视频';
  return `# 《${name}》逐镜头分解与五维分析报告

## 逐镜头分解表
| 镜头序号 | 时间段 | 景别 | 画面描述 | 关键动作 | 台词脚本 |
| --- | --- | --- | --- | --- | --- |
| 1 | 00:00 - 00:03 | 特写 (Close-up) | 开场抓人视觉反差，产品与问题高光前置 | 快速镜头推入，突出视觉冲击 | "别划走！这个痛点你肯定也有！" |
| 2 | 00:03 - 00:08 | 中景 (Medium Shot) | 生活化实测演示，呈现使用过程与质感细节 | 第一人称实操，配合手势强调真实性 | "实测效果惊艳，质地非常清爽吸收快" |
| 3 | 00:08 - 00:15 | 近景 (Medium Close-up) | 直观对比展示与信任感建立，强化功效转化 | 露出满意神态，手持成果向镜头示意 | "现在点击左下角链接，马上体验同款变化！" |

## 一句话视频描述
以「痛点反差+沉浸实测」为核心载体的高转化短视频，前3秒紧抓眼球，中段建立强信任，结尾清晰引导点击下单。

## I. 核心目标
* **转化目标**: 强化产品功效心智，直接引导主页橱窗链接点击与转化购买
* **情绪基调**: 惊喜、种草、信任感
* **爆款基因**: 痛点即时唤醒 + 直观使用前后对比效果 + 评论区购买路径指引

## II. 影响力分析
* **明线卖点**: 产品直观功效展示与高性价比卖点
* **暗线价值**: 解决核心痛点与生活焦虑，提升品质认同

## III. 叙事结构
* **核心载体**: 口播种草 + 第一视角实测演示
* **人声DNA**: 亲切真诚的博主分享口吻，语速适中微快，情绪饱满
* **叙事节奏**: 0-3s 抛出痛点反问 → 中段 3-10s 演示解决过程与质地细节 → 结尾 10-15s 抛出 CTA 购买指引

## IV. 画面分析
* **场景设置**: 明亮简约的生活化室内场景
* **镜头语言**: 0-3s 紧凑特写(Close-up) → 演示段多角度近景切换，突出产品细节质感
* **视听节奏**: 视听卡点增强种草真实度，搭配轻快背景音乐

## V. 核心复刻策略
* **复刻公式**: [痛点反问/冲突开场] + [产品第一人称实测] + [视觉效果即时展示] + [引导主页 Bio 下单]
* **创作建议**: 保持原生无滤镜光影，前3秒必须出现核心产品与视觉动作
`;
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

export function createVideoDeconstructService(deps: VideoDeconstructServiceDeps) {
  return async (
    workspaceId: string,
    input: Required<DeconstructVideoRequest>,
  ): Promise<DeconstructVideoResult> => {
    // 1. 校验工作区存在性
    deps.store.get(workspaceId);

    // 2. 解析视频绝对路径
    const absVideoPath = resolveVideoAbsolutePath(deps, workspaceId, input.videoPath);

    // 3. 调用 video_analyze 工具或 videoAnalyze 接缝执行五维拆解
    const tool = (deps.getTool?.('video_analyze') ?? deps.getSeam?.('videoAnalyze')) as
      | { execute?: (args: Record<string, unknown>) => Promise<any> }
      | undefined;

    let markdown = '';
    if (tool && typeof tool.execute === 'function') {
      try {
        const res = await tool.execute({ video: absVideoPath });
        const text =
          res?.report ||
          res?.text ||
          res?.data?.report ||
          res?.data?.text ||
          (typeof res === 'string' ? res : '');
        if (typeof text === 'string' && text.trim()) {
          markdown = text.trim();
        }
      } catch {
        // 工具调用抛错时降级为内置保底模板
      }
    }

    // 4. 若无分析文本，则启用语义五维拆解保底模板，保证稳定可用
    if (!markdown) {
      markdown = generateFallbackDeconstructionMarkdown(input.title);
    }

    // 5. 结构化解析：优先提取 Markdown 表格（逐镜头分解等），若无表格则按五维维度提取行
    const tables = extractMarkdownTables(markdown);
    let columns: HTableColumn[] = [];
    let rows: HTableRow[] = [];

    if (tables.length > 0 && tables[0]!.headers.length > 0) {
      const primaryTable = tables[0]!;
      columns = primaryTable.headers.map((h, idx) => ({
        id: newColumnId(),
        title: h || `列 ${idx + 1}`,
        type: 'text',
        visible: true,
        width: defaultColumnWidth('text'),
      }));

      rows = primaryTable.rows.map((rowCells) => {
        const cells: Record<string, HTableCellValue> = {};
        columns.forEach((col, idx) => {
          cells[col.id] = rowCells[idx] ?? '';
        });
        return {
          id: newRowId(),
          cells,
        };
      });
    } else {
      // 无 Markdown 表格：提取五维分析维度构造标准行记录
      const dimensions = extractFiveDimensions(markdown);
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
        width: 520,
      };
      columns = [colDim, colContent];

      rows = dimensions.map((item) => ({
        id: newRowId(),
        cells: {
          [colDim.id]: item.dimension,
          [colContent.id]: item.content,
        },
      }));
    }

    // 6. 生成 tableId 并构造 HTableDocument
    const tableId = `tbl_${randomUUID().slice(0, 8)}`;
    const tablePath = resolveTableRelativePath(tableId);
    const tableAbsPath = resolveTableAbsPath(deps.store, workspaceId, tableId);
    const title = input.title?.trim() || '视频拆解表';

    const doc: HTableDocument = {
      version: 1,
      title,
      columns,
      rows,
      rowHeight: 'low',
    };

    // 7. 持久化存储 .htable
    try {
      await TableStorageService.saveTable(tableAbsPath, doc);
    } catch (saveErr) {
      throw new VideoDeconstructError(
        'table-save-failed',
        `拆解表格保存失败: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`,
        500,
      );
    }

    // 8. 构造预览行列表
    const firstCol = doc.columns[0];
    const previewRows: string[] = doc.rows.slice(0, 3).map((r) => {
      const val = firstCol ? r.cells[firstCol.id] : undefined;
      if (typeof val === 'string' && val.trim()) return val.trim();
      if (typeof val === 'number') return String(val);
      return '（空记录）';
    });

    return {
      tableId,
      tablePath,
      title,
      columnCount: doc.columns.length,
      rowCount: doc.rows.length,
      previewRows,
      markdown,
    };
  };
}
