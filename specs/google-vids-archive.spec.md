# 规格：移除并归档 Google Vids 生成插件，回退剪辑窗口的生成集成（Issue #3209）

## 背景与授权

用户决定放弃 Google Vids（谷歌 AI 视频生成，走本机无头通道）这条产品线：**只摘掉 Google Vids 这一块**，插件里其它能力（视频拆解、视频处理、语音/深度等）保留并继续可用；源码**在仓库内归档留档**（含一份说明）；剪辑窗口**回退到「生成面板并入」之前**（恢复纯剪辑工具，四区布局维持现状）。

## 用户操作旅程

1. 用户打开桌面应用 → 侧栏、产品舞台、剪辑窗口里**都不再出现** Google Vids 入口与生成面板。
2. 用户打开剪辑窗口 → 恢复为纯剪辑：左侧不再是生成面板宿主，中播放器、右素材/属性、下时间线照常可用。
3. 用户使用「视频拆解 / 视频处理」等能力 → **照常可用**，行为不变。
4. 维护者想找回 Google Vids 实现 → 在仓库 `archive/google-vids/` 读到完整源码与归档说明，按说明可还原。

## 验收标准

- **AC1 界面无残留**：全应用（含剪辑窗口）不再有 Google Vids 的入口、面板、标题或「生成记录」。
- **AC2 生成通道下线**：本机无头生成 HTTP 路由、生成任务存储、生成驱动、对外提供的任务查询能力全部移除；中枢侧对应的本机生成通道与模型接线一并移除。
- **AC3 其它能力不受影响**：视频拆解（`video_analyze` / `video_depth` / `video_reverse_prompt`）与视频处理（`video_process`）仍注册、仍可用，测试全绿。
- **AC4 剪辑插件已回退**：剪辑窗口恢复纯剪辑形态，四区布局与既有剪辑操作不变。
- **AC5 归档完整**：`archive/google-vids/` 含全部 Google Vids 源码（仅源码，不含构建产物）与 `README.md`（来源、范围、移除原因、还原步骤、遗留项）。
- **AC6 门禁全绿**：受影响插件的测试、阶段契约、边界、防劣化、产品基线全过。
- **AC7 真机证据**：真实浏览器验收截图证明剪辑窗口无生成面板、且剪辑四区正常。

## 保留项（不得移除）

- `plugins/omnimux-video` 的视频拆解与视频处理能力：`src/understand/**`、`src/engine/**`、`src/config.js`、`src/errors.js`、`src/host-seat.js`、`prompts/**`、`scripts/depth_engine.py`。
- `plugins/omnimux-clip` 的四区布局、播放器、素材面板、时间线。
- 官方组件与供应商契约的既有实现（本次只回退「生成列」相关改动）。

## 验证方式

- `pnpm --filter omnimux-video test`、`pnpm --filter omnimux test`、`pnpm --filter omnimux-clip test`
- `pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs`、`pnpm check:boundaries`、`pnpm verify:product-baseline`
- 真机验收旅程（工作树内真实浏览器）：剪辑窗口打开、四区可见、无生成面板、无 Google Vids 入口；留存截图。
