/**
 * upstreamReason — 上游机器码 → 面向用户的结论。
 *
 * 502 响应体带 `upstream: { code, detail }`：`code` 是中枢/视频层的机器码，
 * `detail` 是脱敏后的英文摘要。机器码本身绝不回显给用户；未知码与空码统一
 * 回退通用句。技术原文（detail）由失败卡片另起弱化行展示，不走本模块。
 */
import type { DictKey } from './dict.zh.ts';
import zh from './dict.zh.ts';

type Translate = (key: DictKey) => string;

/** 上游机器码 → 结论字典 key（新增码在此登记，勿在调用点散写）。 */
const UPSTREAM_REASON_KEYS: Record<string, DictKey> = {
  /** 渠道拒绝该素材类型（例：tool model only accepts text and image input）。 */
  'omnimux-invalid-request': 'error.upstreamChannelUnsupported',
  /** 视频理解能力在所选渠道不可用。 */
  'video-understand-unsupported': 'error.upstreamChannelUnsupported',
  /** 视频文件不满足上游理解要求。 */
  'video-invalid-input': 'error.upstreamVideoInvalid',
  /** 目标模型未在渠道白名单启用。 */
  'unknown-model': 'error.upstreamModelDisabled',
  /** 未接入可用的模型渠道。 */
  'needs-provider': 'error.upstreamChannelMissing',
  /** 执行中枢未就绪。 */
  'needs-omnimux': 'error.upstreamHubNotReady',
  /** 中枢缺少访问凭据。 */
  'omnimux-unconfigured': 'error.upstreamCredentialMissing',
};

/** 未知码 / 空码的通用回退句。 */
export const UPSTREAM_REASON_FALLBACK_KEY: DictKey = 'error.upstreamRejected';

/**
 * 上游机器码 → 用户可读结论。
 *
 * 缺省取中文结论（规格 A1/A2/A4 的中文映射即由此断言）；渲染层传入 `useT()`
 * 以随当前语言切换，英文文案由 `dict.en.ts` 同键给出。
 */
export function resolveUpstreamReason(
  code: string | undefined | null,
  t: Translate = (key) => zh[key],
): string {
  const normalized = typeof code === 'string' ? code.trim() : '';
  const key = normalized ? UPSTREAM_REASON_KEYS[normalized] : undefined;
  return t(key ?? UPSTREAM_REASON_FALLBACK_KEY);
}
