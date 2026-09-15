/**
 * OmniMux 全平台统一「引用（Unified Reference）」数据模型契约
 */

export type ReferenceSource =
  | 'product'
  | 'asset'
  | 'workflow'
  | 'inspiration'
  | 'browser'
  | 'file';

export type ReferenceKind =
  | 'product'
  | 'asset'
  | 'table'
  | 'video'
  | 'image'
  | 'audio'
  | 'document'
  | 'canvas';

export interface ReferenceFileSpec {
  /** 相对工作区物理路径或规范存储相对路径 (POSIX 格式，如 .omnimux/products/prod_01.json) */
  relativePath: string;
  /** 本地绝对路径 (用于脱机探测，不注入模型 Prompt) */
  absolutePath?: string;
  /** 界面预览展示 URL (图片 blob/url、视频封面图、视频直链) */
  previewUrl?: string;
  /** 大写扩展名 (如 'JSON', 'PNG', 'MP4', 'HTABLE') */
  extension?: string;
  /** 音视频时长 (如 '0:30' 或秒数) */
  duration?: string;
}

export type ReferenceScene =
  | 'ecommerce_marketing'
  | 'video_replication'
  | 'storyboard_refine'
  | 'general';

export interface ReferenceContext {
  /** 业务消费场景 */
  scene: ReferenceScene;
  /** 场景简要说明 (如“商品核心卖点与价格说明”) */
  summary?: string;
  /** 结构化业务参数 (如 SPU/SKU、卖点清单、钩子分析) */
  metadata?: Record<string, unknown>;
}

/** 统一引用实体定义 */
export interface UnifiedReference {
  /** 实体全局唯一 ID (产品 ID / 资产 ID / 节点 ID / 灵感 ID) */
  id: string;
  /** 业务来源插件 */
  source: ReferenceSource;
  /** 用户可见标题 (卡片与导轨展示用) */
  title: string;
  /** 实体种类大类 */
  kind: ReferenceKind;
  /** 本地文件规格 */
  file: ReferenceFileSpec;
  /** 场景伴随上下文 (模型隐形感知，用户聊天气泡内不可见) */
  context?: ReferenceContext;
}

/** 调度派发选项 */
export interface DeliverReferenceOptions {
  /** 目标会话 ID；缺省时自动解析为当前活跃会话 */
  sessionId?: string;
  /** 会话栏展开模式；默认 'split' (展开并切至分栏焦点) */
  revealMode?: 'split' | 'keep';
  /** 可选预填 Prompt (如灵感一键复刻)，注意：场景上下文不写入 Prompt */
  prefillPrompt?: string;
  /** 是否弹出 Toast 状态提示；默认 true */
  showToast?: boolean;
  /** 自定义成功回调 */
  onSuccess?: (receipt: DeliverReferenceReceipt) => void;
  /** 自定义失败回调 */
  onError?: (reason: string) => void;
}

/** 调度回执结果 */
export interface DeliverReferenceReceipt {
  ok: boolean;
  reason?: 'duplicate' | 'quota-exceeded' | 'invalid-payload' | 'unavailable';
  referenceId?: string;
  fingerprint?: string;
}
