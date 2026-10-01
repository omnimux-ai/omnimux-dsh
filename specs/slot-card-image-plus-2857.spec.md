# 规格说明：素材卡槽纯视觉加号图框样式与移除文字标签

**Issue**: #2857  
**状态**: 草案 / 待验证  
**范围**: `plugins/omnimux/src/client/media-viewer/`  

---

## 1. 目标与视觉规范对齐

### 目标
根据用户提供的设计参考截图以及历史纯视觉无文字卡槽工程规范（#755 / #2807），重构优化素材卡槽空态展示形态：
1. **纯视觉零文字**：彻底移除空态卡槽内的文字节点（“添加图片”、“添加参考”等文字），消除小尺寸容器内容纳文字导致的折行、字号过小或拥挤感。
2. **居中加号图片图标（ImagePlus）**：卡槽正中渲染标准图片加号图标（左侧圆角相框与山丘太阳、右上角嵌入加号 `+`），直观清晰表达“添加图片”的动作语义。
3. **保留无障碍支持**：通过 `aria-label` 与 `title` 属性保留完整的动作语义（如“添加图片”/“添加参考”/“首帧”），悬浮时浏览器提供原生原生提示，屏幕阅读器正常朗读。

---

## 2. 交互与布局契约

### A. 图标设计
- 采用精致标准的矢量加号图片图标：
  - 外框：`<rect>` / `<path>` 构成的带圆角相框；
  - 内容：山丘与圆形太阳；
  - 角标：右上角精确嵌套高对比 `+` 加号符号。
  - 尺寸：22px × 22px，在 64px 容器内处于绝对水平与垂直几何中心。

### B. 容器样式 (`.omx-slot-add`)
- 尺寸：64px × 64px（与填充素材卡片 100% 保持 1:1 等大）。
- 边框：`border: 1px dashed var(--dsw-alias-border-l3)`。
- 底色：`background: var(--dsw-alias-bg-layer-2)`。
- 悬停：`background: var(--dsw-alias-bg-layer-3); border-color: var(--dsw-alias-border-l4); transform: translateY(-1px) translateX(var(--slot-shift, 0px));`。
- 图标居中：`display: flex; align-items: center; justify-content: center; padding: 0;`。

---

## 3. 验收与回归
1. `media-viewer-composer.test.js` 验证空态分流与文案无障碍契约。
2. 自动化门禁 `auto-qa-gate.mjs` 静态检查 100% 通过。
3. 真实运行环境通过 CDP 进行视觉截图复检并比对用户参考图。
