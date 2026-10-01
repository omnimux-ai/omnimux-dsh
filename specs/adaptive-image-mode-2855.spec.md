# 规格说明：图像生成方式与素材卡槽消费端自适应算法

**Issue**: #2855  
**状态**: 草案 / 待验证  
**范围**: `plugins/omnimux/src/client/media-viewer/`  
**边界要求**: 仅修改消费端逻辑，绝对不改动后端与执行中枢代码。

---

## 1. 目标与设计原则

### 目标
解决用户在媒体查看器中需要手动在弹窗中选择“生成方式”（文生图、图生图/图片编辑、多图参考）的冗余交互，通过消费端算法根据素材卡槽（Slot）中的图片数量自动完成自适应匹配：
1. **素材卡槽为空（0 张图）**：算法自动匹配 **文生图**（`operation = 'text_to_image'`，底栏胶囊与参数回显展示 `文生图`）；
2. **素材卡槽为单张图（1 张图）**：算法自动匹配 **图片编辑**（`operation = 'image_edit'`，底栏胶囊与参数回显展示 `图片编辑`）；
3. **素材卡槽为多张图（>1 张图）**：算法自动匹配 **多图参考**（`operation = 'multi_reference'`，底栏胶囊与参数回显展示 `多图参考`）。

### 核心设计原则
1. **零中枢改动**：中枢（`plugins/omnimux/src/media/`）协议与路由逻辑保持原样，仅在查看器客户端消费端（`MediaViewerComposer.jsx`、`MediaConfigControls.jsx`、`media-slot.js`）完成映射与回显自适应。
2. **零手动负担**：移除需要用户手动在参数面板中切换生成方式的要求，输入框上方卡槽常驻待命，素材增减实时驱动生成方式无感切换。
3. **单向真理源**：以卡槽内的有效素材集合（Buckets）为唯一真理源，推导出 `activeOp` 与 `imageOpMode`，杜绝卡槽状态与选项按钮脱节。

---

## 2. 关键操作旅程 (User Journeys)

### Journey 1: 空卡槽默认文生图
1. 用户进入图像生成查看器，未添加任何参考图片，卡槽为空。
2. 消费端算法检测到卡槽图片数为 0，自动匹配为“文生图”。
3. 底部胶囊回显为 `文生图 · 1:1 · 1K · 1`。
4. 用户输入提示词并点击生成，前端自动派发 `operation: 'text_to_image'`。

### Journey 2: 放入单图自动自适应为图片编辑
1. 用户在上方大图点击“添加评论”完成局部打点，或点击卡槽“添加图片”载入 1 张图片。
2. 卡槽内图片数变为 1。
3. 消费端算法即时响应，自动将生成方式切换为“图片编辑”。
4. 底部胶囊回显实时变为 `图片编辑 · 1:1 · 1K · 1`，参数弹窗内同步指示为图片编辑。
5. 用户提交时，前端自动派发 `operation: 'image_edit'` 并附带参考图与打点参数。

### Journey 3: 放入多图自动自适应为多图参考
1. 用户继续向卡槽添加第 2 张图片，卡槽图片数变为 2。
2. 消费端算法即时响应，自动将生成方式切换为“多图参考”。
3. 底部胶囊回显实时变为 `多图参考 · 1:1 · 1K · 1`。
4. 用户若清空卡槽，卡槽图片数归 0，生成方式瞬间自动回退为“文生图”。

---

## 3. 技术实现细节

### A. 算法映射规则
- `imageCount === 0` -> `activeOp = text_to_image`, `imageOpMode = '文生图'`
- `imageCount === 1` -> `activeOp = image_edit`, `imageOpMode = '图片编辑'`
- `imageCount > 1` -> `activeOp = multi_reference`, `imageOpMode = '多图参考'`

### B. 组件改造点
1. `MediaSlot.js`:
   - 保持 `deriveAdaptiveOperation` 的纯函数映射契约与操作降级保护。
2. `MediaViewerComposer.jsx`:
   - 监听当前图片模型的素材列表变化，计算当前卡槽的有效图片数量。
   - 自动驱动 `config.setImageOpMode(modeName)`。
   - 保证在图像模式下卡槽常驻可交互，支持空态拖入与打点入槽。
3. `MediaConfigControls.jsx`:
   - 将参数弹窗内的“生成方式”设置为自适应展示指示器（与卡槽状态联动），取消脱离卡槽的强制手动切换。
   - 底栏胶囊回显严格跟随自适应的 `imageOpMode`。

---

## 4. 验证计划
1. 单元测试：`media-slot.test.js` 与 `media-viewer-composer.test.js` 验证 0/1/多图自适应推导。
2. 契约门禁：`media-config-controls.e2e.test.js` 与 `media-viewer-pure-visual-sync.e2e.test.js` 通过。
3. 真实浏览器 CDP 实测：验证 0 图显示文生图、打点入槽变图片编辑、加多图变多图参考。
