# 工作区应用 Tab 表单控件升级与旧工程翻新 · 验证证据（Issue #2607）

## 一、验证概览
- **任务目标**：升级 `AppTab.jsx` 表单引擎，支持 `options`/`enum` 统一解析、比例卡片（`ratio-cards`）、定制单选下拉（`select-single`）、分段选项卡（`segmented-tabs`）、多选胶囊（`multi-tags`）与资产库卡片（`library-picker`）；翻新 7 款经典旧预设应用配置。
- **环境**：Node.js v25.8.0 / JSDOM Real DOM 仿真环境 / esbuild 打包运行时。
- **证据状态**：VERIFIED (PASS)。

---

## 二、关键控件真实 DOM 挂载与交互证据

### 1. 经典应用（app-creatify-chasing-product 巨型商品撞屏与荒诞追逐）
- **视频成片比例 (`aspect_ratio`)**：
  - DOM 结构：`.omx-apptab-ratio-grid` 包含 3 个 `.omx-apptab-ratio-card`（9:16、16:9、1:1，40px 高度、8px 圆角）；
  - 交互行为：默认 9:16 处于 `is-active`；点击 16:9 卡片后，16:9 卡片获得 `is-active`，原 9:16 卡片失去 `is-active`，表单值同步更新为 `'16:9'`。
  - 结论：彻底解决原有普通单行文本框退化问题。
- **解说人声音色 (`voice`)**：
  - DOM 结构：`.omx-apptab-select-single` 定制下拉菜单组件，包含 `.omx-apptab-select-trigger` 与 `.omx-apptab-select-options`；
  - 交互行为：默认触发器呈现「活力女声（电商促销爆款）」；点击触发器展开 4 项音色菜单，点击「沉稳男声（数码科技大片）」后，触发器即时更新文本并自动收起下拉面板；
  - 结论：展示 label、提交 value，无原生裸 select 样式破坏。
- **商品主图 (`product_image`)**：
  - DOM 结构：已选状态卡片化呈现为 `.omx-apptab-picked`，包含素材缩略图、标题、副标题与 `.omx-apptab-picked-clear` 移除按钮；
  - 交互行为：点击移除按钮清空字段，平滑回落为 `.omx-apptab-library-trigger`（展示「从资产库选择…」带资产库文件夹图标）。

### 2. 复合选项卡与多选胶囊控件
- **分段选项卡 (`segmented-tabs`)**：
  - DOM 结构：`.omx-apptab-seg-tabs` 并排选项卡；
  - 交互行为：点击第二项切换 `is-on` 激活态，第一项失去激活态。
- **多选胶囊 (`multi-tags`)**：
  - DOM 结构：`.omx-apptab-multi-box` 包含平铺标签与上限计数器；
  - 交互行为：逐项点击勾选，当达到 `maxItems = 3` 上限时，未被选中的第 4 项自动置灰锁定（具备 `disabled` 属性与 `.is-locked` 类名）；取消已选项目后自动解锁。

---

## 三、测试通过证据
1. `node --test plugins/omnimux-workflow/tests/apptab-form-widgets.e2e.test.mjs plugins/omnimux-workflow/src/client/projects/appTabWidgets.test.mjs plugins/omnimux-workflow/src/client/projects/appTab.test.mjs`：
   - 23 tests, 6 suites, 23 pass, 0 fail.
2. `pnpm --config.verify-deps-before-run=false --filter omnimux-apps test`：
   - 77 tests, 10 suites, 77 pass, 0 fail.
3. 全量构建产物打包：
   - `omnimux-workflow/lib/client.js`（434,551 bytes）与 `omnimux-apps/lib/client.js`（173,693 bytes）正常输出。
