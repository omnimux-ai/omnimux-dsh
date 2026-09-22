import type { ConversationAttachment } from './types.ts';
import { getGlobalShadowContextStore, type StoredShadowContext } from '../reference/shadow-context.ts';

const KIND_LABELS: Record<string, string> = {
  table: '表格',
  video: '视频',
  image: '图像',
  audio: '音频',
  document: '文档',
  canvas: '工作流',
  asset: '资产',
  product: '产品',
  inspiration: '灵感',
};

/**
 * 格式化相对路径为标准 DSH @引用语法
 */
export function formatPathReference(relativePath: string): string {
  if (!relativePath) return '';
  // 规范化 POSIX 分隔符并去除前导斜杠
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return '';
  // 如果路径包含空格，用引号包裹 @"path with spaces"
  if (/\s/.test(normalized)) {
    return `@"${normalized}"`;
  }
  return `@${normalized}`;
}

/**
 * 组装单个附件的 Markdown 描述行
 */
function attachmentPaths(att: ConversationAttachment): string[] {
  const extra = att.metadata && Array.isArray(att.metadata.files)
    ? att.metadata.files.filter((row): row is string => typeof row === 'string' && row.length > 0)
    : [];
  if (extra.length > 0) return extra;
  return att.relativePath ? [att.relativePath] : [];
}

export function formatAttachmentLine(
  att: ConversationAttachment,
  shadowMap?: Map<string, StoredShadowContext>
): string {
  const kindLabel = KIND_LABELS[att.kind] || '文件';
  const ext = att.extension || 'FILE';
  const durationPart = att.duration ? `, ${att.duration}` : '';
  const paths = attachmentPaths(att);

  let header = '';
  if (paths.length <= 1) {
    const formattedRef = formatPathReference(paths[0]) || formatPathReference(att.relativePath);
    const pathRef = formattedRef || (att.previewUrl ? att.previewUrl : '');
    header = `- [${kindLabel}] ${att.title} (\`${ext}\`${durationPart}): ${pathRef}`;
  } else {
    const validLines = paths
      .map((rel) => formatPathReference(rel))
      .filter(Boolean)
      .map((ref) => `  - ${ref}`);
    if (validLines.length === 0 && att.previewUrl) {
      header = `- [${kindLabel}] ${att.title} (\`${ext}\`${durationPart}): ${att.previewUrl}`;
    } else {
      header = `- [${kindLabel}] ${att.title} (\`${ext}\`${durationPart}):\n${validLines.join('\n')}`;
    }
  }

  // 场景上下文注入 (若有)：仅供 Agent 模型感知，在前端气泡中被整体剥离隐藏
  const shadow = shadowMap?.get(att.entityId) || (att.metadata?.summary ? {
    entityId: att.entityId,
    context: {
      scene: att.metadata.scene as any,
      summary: att.metadata.summary as string,
      metadata: att.metadata,
    },
    registeredAt: 0,
  } : undefined);

  if (shadow?.context) {
    const subLines: string[] = [];
    if (shadow.context.scene) {
      subLines.push(`  * 场景: ${shadow.context.scene}`);
    }
    if (shadow.context.summary) {
      subLines.push(`  * 简述: ${shadow.context.summary}`);
    }
    if (subLines.length > 0) {
      header = `${header}\n${subLines.join('\n')}`;
    }
  }

  return header;
}

/**
 * 组装结构化上下文附着块
 */
export function buildAttachedContextBlock(
  attachments: readonly ConversationAttachment[],
  sessionId?: string
): string {
  if (!attachments || attachments.length === 0) {
    return '';
  }

  let shadowMap: Map<string, StoredShadowContext> | undefined;
  if (sessionId) {
    try {
      const shadowStore = getGlobalShadowContextStore();
      const shadowList = shadowStore.getSnapshot(sessionId);
      if (shadowList.length > 0) {
        shadowMap = new Map(shadowList.map((item) => [item.entityId, item]));
      }
    } catch {
      // ignore
    }
  }

  const lines = attachments.map((att) => formatAttachmentLine(att, shadowMap));
  return `\n\n---\n### 会话关联上下文 (Attached Context):\n${lines.join('\n')}`;
}

/**
 * 将用户 Prompt 正文与关联附件组合为最终提交内容
 */
export function assemblePromptWithAttachments(
  userPrompt: string,
  attachments: readonly ConversationAttachment[],
  sessionId?: string
): string {
  const trimmed = userPrompt || '';
  if (!attachments || attachments.length === 0) {
    return trimmed;
  }

  const contextBlock = buildAttachedContextBlock(attachments, sessionId);
  return `${trimmed}${contextBlock}`;
}
