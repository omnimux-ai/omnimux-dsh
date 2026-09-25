# 规格 · 会话多素材画廊缩略图真实比例自适应与防截断（Issue #2661）

## 1. 目标（Objective）
在会话流助手回复尾部的多媒体画廊（Gallery）缩略图栏（Thumbnail Rail）中，实现缩略图（Thumb）依据素材真实宽高比（Natural Aspect Ratio）动态自适应，并进行严格边界钳制（0.5 ~ 2.0），彻底解决固定 4:3 导致的横竖屏素材被粗暴裁切、重要主体被上下截断的体验硬伤；同时弱化上下滚动遮罩渐隐距离、规整内外间距，实现流畅丝滑的真实比例画廊。

## 2. 界面规范与文案锁定（UI Elements & SaaS Copy Lock）
- **悬浮画布按钮**：仅为调色盘矢量图标 + 「画布」，点击进入工作台画布模式。
- **视频角标**：右下角小标签文案固定为「视频」，无额外副标题与多余图标。
- **零自由发挥**：严禁私自添加任何新品/推荐/分辨率等 Badge 徽章或 Emoji 字符。

## 3. 接口与算法契约（API & Pure Function Contract）
### 3.1 类型与配置
```typescript
export interface AspectRatioClampConfig {
  minRatio?: number;
  maxRatio?: number;
  fallbackRatio?: number;
}

export const DEFAULT_THUMB_MIN_RATIO = 0.5;
export const DEFAULT_THUMB_MAX_RATIO = 2.0;
export const DEFAULT_THUMB_FALLBACK_RATIO = 1.0;
```

### 3.2 纯函数算法 `clampRatio`
- 签名：`clampRatio(width: number | null | undefined, height: number | null | undefined, config?: AspectRatioClampConfig): number`
- 非法输入防御：当 width 或 height 为 null、undefined、非数字、NaN、Infinity、<= 0 时，返回 `fallbackRatio`（默认 1.0）。
- 钳制逻辑：`rawRatio = width / height`，`clamped = Math.min(Math.max(rawRatio, min), max)`。
- 输出：保留 4 位小数的数值（Number 类型）。

## 4. CSS 与几何样式规则
- **缩略图保底比例**：`.omx-chat-media-tail__thumb` 移除 `aspect-ratio: 4/3`，声明 `aspect-ratio: 1 / 1;` 作为默认占位。
- **平滑自适应过渡**：在 `.omx-chat-media-tail__thumb` 的 `transition` 中追加 `aspect-ratio 0.2s ease`。
- **内边距微调**：`.omx-chat-media-tail__rail` 的 `padding` 由 `2px 3px 2px 3px` 更新为 `padding: 4px 3px;`。
- **滚动渐隐遮罩优化**：`.omx-chat-media-tail__rail.cs-down`、`.cs-up`、`.cs-up.cs-down` 的遮罩距离由 `16px` 弱化收敛为 `8px`。

## 5. DOM 尺寸监听与自适应流转
1. 图片类型：监听 `img` 的 `load` 事件并触发 `applyThumbRatio(img.naturalWidth, img.naturalHeight)`；若同步检查 `naturalWidth > 0 && naturalHeight > 0` 则立即生效。
2. 视频类型：监听 `vid` 的 `loadedmetadata` 事件并触发 `applyThumbRatio(vid.videoWidth, vid.videoHeight)`；若同步检查 `videoWidth > 0 && videoHeight > 0` 则立即生效。
3. JSDOM 防御：非浏览器环境或尺寸为 0 时优雅回退，不抛出异常。

## 6. 验收用例（Acceptance Criteria）
- **AC-1**：`clampRatio` 正确钳制标准比例（9:16 为 0.5625，16:9 为 1.7778，1:1 为 1.0）。
- **AC-2**：`clampRatio` 极限超窄高素材（如 1:10）钳制至 0.5；极限超宽素材（如 10:1）钳制至 2.0。
- **AC-3**：`clampRatio` 面对非法输入（0、负数、null、undefined、NaN、Infinity）均安全回退至 fallbackRatio。
- **AC-4**：CSS 规则中 `.omx-chat-media-tail__thumb` 具有 `aspect-ratio: 1 / 1;` 且 transition 包含 `aspect-ratio 0.2s ease`。
- **AC-5**：CSS 规则中 rail padding 为 `4px 3px;`，遮罩渐隐为 `8px`。
- **AC-6**：DOM 渲染与测试套件 100% 绿色通过。
