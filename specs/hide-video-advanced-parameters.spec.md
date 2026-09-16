# 创作画布隐藏视频参数弹窗「高级参数」区块规格 (Hide Video Advanced Parameters Spec)

- 任务工作树：`.worktrees/hide-video-advanced-params`（分支 `agent/hide-video-advanced-params`，基线 `origin/main` @ `cc0e10c1c`）
- 日期：2026-09-16
- 上游与用户指令：用户 2026-09-16 明确指示「把高级参数都隐藏下，无论是否有提供？ -> 确认隐藏」。

## 1. 背景与问题

目前创作画布的视频参数弹窗（`VideoParamPopover`）底部渲染了一个名为「高级参数」的区块（`section[data-testid="wf-video-advanced-parameters"]`），里面包含了：
- AI 水印开关（`watermark`）
- 内容审核开关（`nsfwCheck`）
- 返回尾帧开关（`returnLastFrame`）
- 联网搜索开关（`webSearch`）
- 输出格式 / 参考任务类型 / 生成类型等枚举

### 现状问题
1. **上游真实接口不支持**：经排查，上游网关对视频请求体启用了严格字段白名单限制，中枢在向网关发包时根本不传递 `watermark` 与 `nsfwCheck`（若多传直接报 400 错误）。因此这两个开关开或关均没有任何实际效果，属于无效选项。
2. **认知与操作干扰**：绝大多数社媒出片场景仅关注“生成模式、画幅比例、清晰度/分辨率、时长、声音”五大核心出片要素，底部的“高级参数”不仅无实际效用，反而让弹窗变长、增加认知负担。

## 2. 目标

1. 在创作画布视频参数浮层（`VideoParamPopover`）中，彻底隐藏「高级参数」区块（`data-testid="wf-video-advanced-parameters"`）。无论模型契约是否声明了支持 `watermark`、`nsfwCheck`、`returnLastFrame` 等，均不再向用户渲染该区块。
2. 保持特定业务模式所需的输入框（如文档/网页转视频的 `data-testid="wf-video-url-input"`）不受影响，在对应模式下依然能正常输入。
3. 保持数据结构与提交逻辑向后兼容，已保存的历史工程若存有相关参数不报错。

## 3. 验收标准（可测试）

- **AC-1 (高级参数区块彻底不渲染)**：打开视频参数配置弹窗时，DOM 中不再包含 `[data-testid="wf-video-advanced-parameters"]` 节点，标题为「高级参数」的区域不再展示。
- **AC-2 (五大核心出片控制项完好)**：
  - 模式切换（多模式时可见）
  - 画幅比例（aspectRatio）
  - 分辨率/清晰度（resolution）
  - 时长调节（duration）
  - 声音开关（sound）
  以上五项在支持时正常渲染，且功能交互完好。
- **AC-3 (文档与网页地址输入不受影响)**：当处于需要文档或网页链接的生成模式时，`wf-video-url-input` 依然正常渲染。
- **AC-4 (单测与断言同步收敛)**：更新 `VideoParamPopover.test.mjs` 等相关测试用例，断言高级参数区块不再出现。
- **AC-5 (全量门禁通过)**：`pnpm verify:model-contracts --strict` 及工作流插件测试全绿通过。

## 4. 不做事项

- 不删除中枢 specs 中已有的模型契约声明（保持契约客观记录历史）。
- 不影响图像生成参数面板（图像面板本身无该高级参数区块）。
