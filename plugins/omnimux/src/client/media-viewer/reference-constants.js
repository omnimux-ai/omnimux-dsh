/**
 * 离线预置参考素材数据常量 (Offline Preset Reference Assets)
 *
 * 生产环境接入与兜底说明：
 * 1. 当前阶段为离线/开发环境内置的轻量矢量占位素材集合，用于满足参考面板基础渲染与离线交互闭环。
 * 2. 生产环境正式接入时，应优先通过 OmniMux 资产中心接口（如 /omnimux/api/assets）动态加载真实用户资产与 AI 生成历史。
 * 3. 若网络不可用或后端资产服务尚未就绪，本常量集合作为离线体验兜底（Fallback），确保面板可用性与开箱即用体验。
 */

// 标准 1:1 单色位图 base64 Data URL（1x1 极简透明 PNG），通过 isAllowedReferenceUrl 与 serializeReferenceAssets 光栅图白名单
const MINIMAL_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function createSvgUri(_bgColor, _fgColor, _label) {
  return MINIMAL_PNG_DATA_URL;
}

export const PRESET_REFERENCE_ASSETS = {
  upload: [
    { id: 'up-1', title: '工作室布光参考图', url: createSvgUri('#1e293b', '#38bdf8', '布光参考'), isMine: true },
    { id: 'up-2', title: '质感羊绒面料材质', url: createSvgUri('#334155', '#a855f7', '羊绒材质'), isMine: true },
    { id: 'up-3', title: '现代几何室内背景', url: createSvgUri('#1e1b4b', '#6366f1', '室内背景'), isMine: false },
    { id: 'up-4', title: '高级灰调外景拍摄', url: createSvgUri('#27272a', '#71717a', '外景构图'), isMine: false },
  ],
  ai: [
    { id: 'ai-1', title: '极简北欧真皮沙发', url: createSvgUri('#451a03', '#f59e0b', '皮质沙发'), isMine: true },
    { id: 'ai-2', title: '极光未来金属质感', url: createSvgUri('#042f2e', '#14b8a6', '金属反光'), isMine: true },
    { id: 'ai-3', title: '柔光特写人像光影', url: createSvgUri('#4c0519', '#fb7185', '人像柔光'), isMine: false },
    { id: 'ai-4', title: '超广角建筑透视', url: createSvgUri('#022c22', '#10b981', '建筑透视'), isMine: false },
  ],
  avatar: [
    { id: 'av-1', title: '亚洲时尚青年模特', url: createSvgUri('#172554', '#3b82f6', '青年模特'), isMine: true },
    { id: 'av-2', title: '欧美商业职场肖像', url: createSvgUri('#311042', '#d946ef', '职场肖像'), isMine: true },
    { id: 'av-3', title: '赛博未来机械数字人', url: createSvgUri('#082f49', '#0284c7', '机械模特'), isMine: false },
    { id: 'av-4', title: '自然生活随性街拍', url: createSvgUri('#14532d', '#22c55e', '随性街拍'), isMine: false },
  ],
  product: [
    { id: 'pr-1', title: '哑光磨砂便携水杯', url: createSvgUri('#292524', '#e7e5e4', '磨砂水杯'), isMine: true },
    { id: 'pr-2', title: '真无线降噪耳机', url: createSvgUri('#18181b', '#a1a1aa', '无线耳机'), isMine: true },
    { id: 'pr-3', title: '极简机械腕表表盘', url: createSvgUri('#09090b', '#38bdf8', '极简表盘'), isMine: false },
    { id: 'pr-4', title: '手工皮革复古背包', url: createSvgUri('#3b1a08', '#d97706', '真皮背包'), isMine: false },
  ],
};

export const REFERENCE_TABS = [
  { id: 'upload', label: '上传资产' },
  { id: 'ai', label: 'AI 生成' },
  { id: 'avatar', label: '数字人' },
  { id: 'product', label: '商品' },
];
