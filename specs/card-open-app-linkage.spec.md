# 规格：探索模板卡片文案对齐与直通 AI 应用详情全链路贯通

## 1. 任务背景与核心诉求
- **用户反馈事实**:
  1. 卡片悬停浮现的按钮文案仍为旧的「复刻」，图标为旋转刷新，与已升级的「AI 应用」属性脱节，预期应为「打开应用」（英文 `Open app`）；
  2. 点击卡片或悬停按钮时，预期必须真正平滑跳转至对应的「AI 应用」详情页面（左侧表单、右侧示例/历史）。

## 2. 详细改造点
1. `TemplateCardItem.jsx`:
   - 识别应用卡片类型：`const isApp = template.type === 'app' || !!template.appId || !!template.manifest`；
   - 当为应用类型时，悬停按钮文本显示为**「打开应用」**（英文 `Open app`）；
   - 按钮图标切换为清晰的右斜向上箭头（`ICON_EXTERNAL_LINK`）；
2. `ExploreTemplatesSection.jsx`:
   - 在 `handleItemSelect` 中，不仅写入 manifest 到本地缓存，而且调用 `claimProductStage('omnimux-apps')` 激活应用主舞台；
   - 同时分发 `omnimux-app-open` 事件（携带完整 `id`, `appId`, `manifest`, `title`），确保 `AppWorkspaceView` 能够精准定位并展开该应用详情；
   - 若宿主 `sidebar.openTab` 可用，同步执行侧栏标签聚焦；
3. 单元测试与端到端测试：
   - 更新卡片渲染断言；
   - 验证点击卡片能够正确执行阶段切换与应用广播。

## 3. 验收标准
- 探索模板 7 张大卡片悬停统一展示「打开应用」；
- 点击卡片 100% 触发跳转至 `omnimux-apps` 产品主舞台并载入对应应用表单；
- 单测与端到端测试全部通过。
