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

function preset(id, title, isMine) {
  return { id, title, url: MINIMAL_PNG_DATA_URL, isMine };
}

export const PRESET_REFERENCE_ASSETS = {
  local: [
    preset('loc-1', '红发蓝眸女性', true),
    preset('loc-2', 'Mariam outside', true),
    preset('loc-3', 'Harajuku_Yuki', true),
    preset('loc-4', '科技Vlogger-粉衣女郎Yuna', false),
  ],
  cloud: [
    preset('cld-1', 'Judge Owl', false),
    preset('cld-2', 'Ceo Orange Tabby', false),
    preset('cld-3', 'Spy Siamese', false),
    preset('cld-4', 'Lazy Garfield', false),
  ],
  upload: [
    preset('up-1', '工作室布光参考图', true),
    preset('up-2', '质感羊绒面料材质', true),
    preset('up-3', '现代几何室内背景', false),
    preset('up-4', '高级灰调外景拍摄', false),
  ],
  ai: [
    preset('ai-1', '极简北欧真皮沙发', true),
    preset('ai-2', '极光未来金属质感', true),
    preset('ai-3', '柔光特写人像光影', false),
    preset('ai-4', '超广角建筑透视', false),
  ],
  generations: [
    preset('gen-1', '极简北欧真皮沙发', true),
    preset('gen-2', '极光未来金属质感', true),
    preset('gen-3', '柔光特写人像光影', false),
    preset('gen-4', '超广角建筑透视', false),
  ],
  avatar: [
    preset('av-1', '亚洲时尚青年模特', true),
    preset('av-2', '欧美商业职场肖像', true),
    preset('av-3', '赛博未来机械数字人', false),
    preset('av-4', '自然生活随性街拍', false),
  ],
  product: [
    preset('pr-1', '女士高级淡香水50ml', true),
    preset('pr-2', '中老年纯棉前扣无钢圈薄款文胸', true),
    preset('pr-3', '5ml便携迷你香水喷雾瓶', false),
    preset('pr-4', 'OmniMux 品牌视觉', false),
  ],
};

export const REFERENCE_TABS = [
  { id: 'local', label: '本地' },
  { id: 'cloud', label: '公共' },
  { id: 'product', label: '产品库' },
  { id: 'generations', label: 'AI 生成' },
];
