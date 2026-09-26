# 媒体生成面板「张数纯数字」与「底栏回显生成方式」规格说明书（Media Viewer Batch Digits & OpMode Trigger Spec）

## 1. 目标（Objective）
基于产品经理（许清楚）发布的最新 Spec 规范及根目录 `design.md`（v2.0 原生 DSH 体系适配），对媒体生成配置控件 `MediaConfigControls` 及其底层触发器/面板进行两项关键交互与视觉对齐改进：
1. **底栏触发器回显生成方式**：在 `mode === 'image'` 的底栏参数摘要胶囊最前补充当前生成方式（如“文生图”），使底栏胶囊完整展示「生成方式 · 比例 · 清晰度 · 张数」，与参数摘要字符串保持一致。
2. **张数选项及底栏回显统一为纯数字**：
   - 底栏参数摘要尾部张数由带单位的 `<span>{imageBatch}张</span>` 调整为纯数字 `<span>{imageBatch}</span>`；
   - 参数摘要字符串 `parameterSummary` 去掉末尾的“张”字，格式统一为 `${imageOpMode} · ${imageAspect} · ${imageRes} · ${imageBatch}`；
   - 参数面板内「张数」分段选项内部文本由 `{cnt}张` 调整为纯数字 `{cnt}`（即 `1`、`2`、`4`，严禁任何后缀单位），保持极简高信噪比。

## 2. 需修改的文件（Project Structure & Target Files）
- 规格工件：`specs/media-viewer-batch-digits-and-opmode-trigger.spec.md`
- 业务源码：`plugins/omnimux/src/client/media-viewer/MediaConfigControls.jsx`
- 测试用例：`plugins/omnimux/src/client/media-viewer/media-config-controls.e2e.test.js`
- 验证截图：`docs/evidence/batch-digits-opmode-verified.png`

## 3. UI 元素与文案字典锁定（Zero Improvisation Gate）
依据产品经理核定白名单，UI 元素与文案必须 100% 逐字对齐：
- **图像生成方式**：`['文生图', '图生图', '多图参考']`（默认 `文生图`）
- **图像清晰度**：`['1K', '2K', '4K']`
- **图像张数选项**：`['1', '2', '4']`（纯数字展示，严禁任何“张”或其他单位字符）
- **底栏图像参数触发器胶囊内容**：
  - 前缀标识：`<span className="omx-param-compact-label" aria-hidden="true">参数</span>`
  - 展开子项：
    - `<span>{imageOpMode}</span>`（如 `文生图`）
    - `<span className="omx-dot">·</span>`
    - `<span>{imageAspect}</span>`（如 `1:1`）
    - `<span className="omx-dot">·</span>`
    - `<span>{imageRes}</span>`（如 `1K`）
    - `<span className="omx-dot">·</span>`
    - `<span>{imageBatch}</span>`（如 `1`，纯数字，无“张”后缀）
- **参数摘要字符串（Title / Aria-Label）**：
  `${imageOpMode} · ${imageAspect} · ${imageRes} · ${imageBatch}`（例如 `文生图 · 1:1 · 1K · 1`）

## 4. 详细实现契约（Implementation Details）

### 4.1 `MediaConfigControls.jsx`
1. **底栏触发器胶囊（`id="paramSummaryTriggerBtn"`）**：
   在 `mode === 'image'` 分支的渲染模板中：
   ```jsx
   {mode === 'image' ? (
     <>
       <span>{imageOpMode}</span>
       <span className="omx-dot">·</span>
       <span>{imageAspect}</span>
       <span className="omx-dot">·</span>
       <span>{imageRes}</span>
       <span className="omx-dot">·</span>
       <span>{imageBatch}</span>
     </>
   ) : (
     ...
   )}
   ```
2. **参数摘要文本 `parameterSummary`**：
   ```javascript
   const parameterSummary = mode === 'image'
     ? `${imageOpMode} · ${imageAspect} · ${imageRes} · ${imageBatch}`
     : `${videoGenMode} · ${videoAspect} · ${videoRes} · ${hasSound ? '有声' : '无声'} · ${duration}s`;
   ```
3. **参数面板内张数选项**：
   ```jsx
   <div className="omx-param-subcol omx-subcol-sound">
     <div className="omx-param-title">张数</div>
     <div className="omx-mode-track">
       {['1', '2', '4'].map((cnt) => (
         <button
           key={cnt}
           type="button"
           className={`omx-mode-pill ${imageBatch === cnt ? 'is-active' : ''}`}
           onClick={() => setImageBatch(cnt)}
         >
           {cnt}
         </button>
       ))}
     </div>
   </div>
   ```

## 5. 测试与验证策略（Testing Strategy）
1. **自动化 E2E / 单元测试**：
   更新 `plugins/omnimux/src/client/media-viewer/media-config-controls.e2e.test.js`：
   - 验证面板内张数按钮内容为 `{cnt}` 且严格不包含 `{cnt}张`；
   - 验证底栏参数胶囊首项包含 `<span>{imageOpMode}</span>`；
   - 验证底栏参数胶囊尾项张数包含 `<span>{imageBatch}</span>` 且无“张”字；
   - 运行 `node --test plugins/omnimux/src/client/media-viewer/media-config-controls.e2e.test.js` 测试必须 100% 通过。
2. **无头浏览器实机渲染与截图证据**：
   使用 Playwright 在无头环境中加载包含 `MediaConfigControls` 的真实 UI，验证其底栏胶囊与张数分段控制器的实际渲染效果，并将证据图保存至 `docs/evidence/batch-digits-opmode-verified.png`。

## 6. 边界与质量守则（Boundaries）
- **总是做（Always）**：
  - 严格保持 `design.md` 的色彩 Token、几何基准与胶囊圆角体系不变；
  - 严格保持已有 video 模式及其他选项逻辑不变；
  - 提交前全量运行测试套件。
- **先问（Ask First）**：
  - 调整除张数和生成方式回显以外的组件结构；
  - 修改通用模型级联目录或状态机对外导出契约。
- **绝不做（Never）**：
  - 私自添加任何装饰性 Emoji、图标、胶囊标签（如“推荐”、“新品”）；
  - 在纯数字选项旁添加单位后缀或括号说明。
