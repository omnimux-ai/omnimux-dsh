# 规格说明：媒体查看器生成结果持久化与素材卡槽样式精细化

**Issue**: #2851  
**状态**: 草案 / 待验证  
**范围**: `plugins/omnimux/src/client/media-viewer/`  

---

## 1. 目标与关键操作旅程

### 目标
1. **生成结果本地持久化**：解决用户在“图像生成/媒体查看器”中直接生成的图片与视频在页面刷新、重新打开或切换会话后在列表丢失的问题。在 `media-viewer-store.js` 中增加 localStorage 持久化能力，使得刷新重开后历史生成成果与对应打点标注均可完整复现。
2. **素材卡槽组件样式精细化**：解决素材卡槽内文字“添加图片/添加视频/添加音频/添加参考”因宽度限制折行成两排、空卡槽纯生硬虚线框且无底色微质感的问题。调整为圆角 10px、单行不折行、半透明微质感层叠背景、细腻平滑悬停动效，角标与移除按钮细节打磨，严格遵循极简现代工业设计规范。

---

## 2. 关键操作旅程 (User Journeys)

### Journey 1: 生成结果持久化与重开恢复
1. 用户在“图像生成”查看器中输入提示词，点击生成图片。
2. 图片生成成功，`store.addMedia` 与 `store.updateMedia` 将其标记为 `completed` 并载入状态。
3. 状态立即安全同步写回 `localStorage`（保存最近 100 条有效媒体记录及标注映射，不持久化瞬态 `generating` 任务）。
4. 用户刷新页面（F5 / Cmd+R）或重启应用重新打开查看器：
   - 查看器初始化时自动从 `localStorage` 读取并恢复媒体列表；
   - 之前生成的图片完好展示在缩略图轨道和当前大图视口中，无需重新生成。

### Journey 2: 素材卡槽单行居中与精致微质感
1. 用户在未添加素材或选择图生图模式时，输入面板上方呈现素材卡槽。
2. 卡槽文字显示为“添加图片”（或“添加视频”/“添加音频”/“添加参考”），文字保持单行居中不折行（`white-space: nowrap`），排版舒展。
3. 卡槽容器具备 10px 现代圆角与半透明微质感浅色层叠底色，边框为细腻虚线。
4. 鼠标悬停时平滑轻微浮起、边框与背景同步微提亮；添加素材后，卡片具备柔和景深阴影，右上角移除按钮与左上角标记角标精致对齐。

---

## 3. 技术设计契约

### A. 存储契约 (`media-viewer-store.js`)
- **Key**: `omnimux:media-viewer:store:v1`
- **读容错**: `loadPersistedState()` 在非浏览器环境（Node.js / SSR）或 JSON 异常时优雅降级返回 `null`。
- **写节制**: 过滤 `status === 'generating'` 的瞬态任务；仅保留最新 100 项，防止超出存储配额。
- **状态同步**: `addMedia`、`updateMedia`、`setActiveId`、`commitAnnotation`、`removeAnnotation`、`clearAnnotations` 统一触发持久化。

### B. 样式契约 (`styles.js`)
- `.omx-slot-add`:
  - `border-radius: 10px`
  - `background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.035))`
  - `border: 1px dashed var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.16))`
  - `span`: `white-space: nowrap; font-size: 11px; font-weight: 500; letter-spacing: -0.2px;`
  - Hover: `background: var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.07)); border-color: var(--dsw-alias-border-l4, rgba(255, 255, 255, 0.3)); transform: translateY(-1px) translateX(var(--slot-shift, 0px));`
- `.omx-slot-card`:
  - `border-radius: 10px`
  - `box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35)`
  - 图片/视频: `border-radius: 9px; object-fit: cover`
  - `.omx-slot-badge-mark`: `border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 600; backdrop-filter: blur(8px);`
  - `.omx-slot-remove`: `width: 20px; height: 20px; border-radius: 999px; backdrop-filter: blur(4px);`

---

## 4. 验证与回归计划
1. 单元测试：`media-viewer-store.test.js` 覆盖持久化写入、读取、异常容错、容量截断测试。
2. 现有测试：`pnpm test` 相关用例全部保持 100% 绿灯。
3. 真实浏览器/CDP 验证：验证卡槽视觉效果，验证刷新后生成结果的保留。
