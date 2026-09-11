/**
 * OmniMux 全平台「添加到会话（Add to Conversation）」统一附件类型定义
 */

export type AttachmentKind =
  | 'image'         // 图像文件 (png/jpg/webp/gif)
  | 'video'         // 视频文件 (mp4/webm/mov)
  | 'audio'         // 音频文件 (mp3/wav)
  | 'table'         // 表格文件 (.htable)
  | 'document'      // 文档/Markdown/文本 (.md/.txt/.json)
  | 'canvas'        // 画布 DAG (.json)
  | 'asset'         // 资产库实体
  | 'product'       // 产品库货品
  | 'inspiration';  // 灵感社区条目

export type AttachmentSourcePlugin =
  | 'omnimux'
  | 'omnimux-workflow'
  | 'omnimux-assets'
  | 'omnimux-products'
  | 'omnimux-inspiration'
  | 'omnimux-clip';

export type AttachmentStatus = 'ready' | 'missing' | 'stale';

/** 会话附件完整数据模型 */
export interface ConversationAttachment {
  /** 唯一标识 (UUID / 纳秒时间戳) */
  id: string;
  /** 唯一指纹 (去重用) */
  fingerprint: string;
  /** 所属会话 ID */
  sessionId: string;
  /** 来源插件 */
  sourcePlugin: AttachmentSourcePlugin;
  /** 实体大类 */
  kind: AttachmentKind;
  /** 实体 ID (节点 ID / 资产 ID / 产品 ID) */
  entityId: string;
  /** 展示文件名/标题 (前端严格依据容器宽度截断，超出以 ... 呈现) */
  title: string;
  /** 格式扩展名 (全大写，如 'MD', 'HTABLE', 'MP4', 'PNG', 'JSON') */
  extension: string;
  /** 相对工作区物理路径 (POSIX 标准，如 .hilo/tables/node-01.htable) */
  relativePath: string;
  /** 绝对路径 (仅用于脱机存在性检测，不注入 Prompt) */
  absolutePath?: string;
  /** 预览图 URL (图片 blob/url、视频封面图) */
  previewUrl?: string;
  /** 视频时长 (秒或格式化字符串如 '0:31') */
  duration?: string;
  /** 状态机 */
  status: AttachmentStatus;
  /** 业务扩展字段 (如行列数、尺寸) */
  metadata?: Record<string, unknown>;
  /** 创建时间戳 */
  createdAt: number;
}

/** 触发源派发负载 (Payload) */
export interface AttachmentPayload {
  sourcePlugin: AttachmentSourcePlugin;
  kind: AttachmentKind;
  entityId: string;
  title: string;
  extension?: string;
  relativePath: string;
  absolutePath?: string;
  previewUrl?: string;
  duration?: string;
  metadata?: Record<string, unknown>;
}
