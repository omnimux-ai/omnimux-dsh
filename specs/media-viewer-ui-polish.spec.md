# 媒体生成面板 UI 优化规格说明书（Media Viewer UI Polish Spec）

## 1. 目标（Objective）
基于产品经理（许清楚）发布的《媒体生成面板 UI 优化 PRD 原型与 UI 元素/文案字典规格（Spec Plan）》与根目录 `design.md`（v2.0 原生 DSH 体系适配），对媒体生成面板及底栏触发器/参数配置控件进行像素级 UI 对齐与微观交互治理：
1. 修复比例线框几何，补齐 7 款比例几何尺寸并提供 20px × 20px 居中盒，彻底消除 3px 小黑点塌缩问题。
2. 规范声音分段及图文排版，新增 `.omx-inline-flex-center` 布局类，规范分段标题文案（统一为「声音」与「生成方式」），去除所有括号废话（如 `(Image)`、`(Video)`）。
3. 分段控制器（Track & Pill）对齐 `design.md` §2.2，保持容器 32px / 内边距 2px / 内块 26px / 胶囊圆角 999px / 边框与阴影微动效标准。
4. 底栏触发器胶囊微观基线与图标垂直对齐，确保 SVG 图标居中、时长标签及间隔点微观对齐。

## 2. 需修改的文件（Project Structure & Target Files）
- `plugins/omnimux/src/client/media-viewer/styles.js`
- `plugins/omnimux/src/client/media-viewer/MediaConfigControls.jsx`

## 3. UI 元素与文案字典锁定（Zero Improvisation Gate）
- 图像生成方式选项：`['文生图', '图生图', '多图参考']`
- 图像比例选项：`['1:1', '16:9', '9:16', '4:3', '3:4', '21:9']`
- 视频生成方式选项：`['文生视频', '首帧', '首尾帧', '全能参考', '视频编辑']`
- 视频比例选项：`['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '自适应']`
- 视频参数分组标题：
  - 生成方式（禁止写为「生成模式」）
  - 比例
  - 清晰度
  - 声音（禁止写为「有声」）
  - 时长
- 声音分段选项：`['有声', '无声']`
- 模式切换菜单项：`['图像生成', '视频生成']`（严格剔除 `(Image)` 和 `(Video)` 英文括号废话）

## 4. 详细样式契约（Design Token & CSS Spec）

### 4.1 比例线框与容器
```css
.omx-ratio-wire-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.omx-ratio-wire {
  border: 1.5px solid var(--dsw-alias-label-secondary);
  border-radius: 2px;
  box-sizing: border-box;
  display: block;
}

.omx-ratio-card.is-active .omx-ratio-wire {
  border-color: var(--dsw-alias-label-primary);
}

.ratio-1-1 { width: 16px; height: 16px; }
.ratio-16-9 { width: 20px; height: 11px; }
.ratio-9-16 { width: 11px; height: 20px; }
.ratio-4-3 { width: 18px; height: 14px; }
.ratio-3-4 { width: 14px; height: 18px; }
.ratio-21-9 { width: 20px; height: 9px; }
.ratio-auto { width: 16px; height: 12px; border-style: dashed; }
```

### 4.2 图文内联居中规范
```css
.omx-inline-flex-center {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  line-height: 1;
  vertical-align: middle;
}
.omx-inline-flex-center svg {
  display: block;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  color: currentColor;
}
.omx-inline-flex-center span {
  font-size: 12px;
  line-height: 1;
}
```

### 4.3 分段控制器 Track & Pill
```css
.omx-mode-track {
  height: 32px;
  padding: 2px;
  gap: 2px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.omx-mode-pill {
  flex: 1;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: all 140ms cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  cursor: pointer;
}

.omx-mode-pill.is-active {
  background: var(--dsw-alias-bg-elevated, #1c1c1f);
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
```

### 4.4 底栏触发器胶囊微观基线与垂直对齐
```css
.omx-capsule-trigger svg {
  display: block;
  flex-shrink: 0;
  vertical-align: middle;
}

.omx-param-duration-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  line-height: 1;
}

.omx-dot {
  display: inline-block;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1;
  margin: 0 1px;
  user-select: none;
}
```

## 5. 测试与验证策略（Testing & Verification）
- 执行 `node --test plugins/omnimux/src/client/media-viewer/media-viewer-composer.test.js` 确保现有 68 个用例持续 100% 通过。
- 执行 `node scripts/guard-ui-rules.mjs` 扫描修改的目标文件，确保 UI01~UI10 零违规。
- 实施反过度设计逐行自检，确认文案 100% 匹配白名单，无任何多余 Badge、图标或 Emoji。
