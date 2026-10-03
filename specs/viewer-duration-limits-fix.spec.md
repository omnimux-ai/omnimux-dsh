# Spec: 视频参数浮层「时长」滑块区间刻度错位修复

## 背景与问题
媒体查看器/输入框参数浮层（`MediaConfigControls.jsx` 视频模式）中，时长滑块下方应显示范围刻度 `4s`（左）与 `15s`（右）。实际渲染中两个刻度堆叠在同一行左侧（呈现为 `4s15s`），因为 JSX 引用的 `omx-duration-header` / `omx-duration-val-text` / `omx-duration-range-input` / `omx-duration-limits` 四个类在样式表中从未定义，浏览器回落为无布局的默认样式。

## 验收标准
1. 打开视频生成参数浮层，时长区域标题「时长」居左、当前值「Ns」居右同行显示。
2. 滑块下方 `4s` 贴滑块左端、`15s` 贴滑块右端，两端对齐。
3. 不新增可见节点，不改变已有交互与取值范围（min=4, max=15, step=1）。
4. 真实浏览器截图证据：浮层内 4s/15s 分别位于滑块两端。

## 改动面
- `plugins/omnimux/src/client/media-viewer/styles.js`：补齐四个缺失类（纯 CSS，无 JSX 变更）。

## 验证
- `pnpm --filter omnimux-viewer test`（结构断言回归）
- `node --test scripts/verify-anti-slop.test.mjs`
- 工作树内真实浏览器截图证据
