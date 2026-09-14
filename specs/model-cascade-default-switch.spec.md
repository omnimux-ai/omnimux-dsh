# 规范 · 模型级联菜单默认模型切换与跨品牌隔离修复 (Issue #1702)

## 1. 业务背景与问题定义

在工作流画布中，材质节点（文生文/生图/生视频等）使用三级级联选择器（`ModelCascadeMenu`）让用户选择品牌、模型与渠道策略。
当前存在两个交互体验与数据流缺陷：
1. **未切换默认模型**：当节点已选中某一模型（例如 Google 的 `gemini-3.8-flash`）时，用户点击左侧一级菜单中的另一个品牌（例如 DeepSeek），一级菜单打上勾选高亮，但底层并没有切换选中该品牌下的模型，用户必须再手动点击二级列表中的模型。
2. **跨品牌模型严重穿透串台**：在上述点击 DeepSeek 的情况下，二级模型列表的第一项竟然错误显示了上一个品牌的模型 `gemini-3.8-flash`，且其右侧带有绿色对勾。

## 2. 根因剖析与根治方案

### 2.1 根因分析
1. **状态脱节**：`ModelCascadeMenu` 内部的 `handleBrandClick` 只修改了局部状态 `activeBrandId`，没有触发 `handleSelectModel` 或更新 `activeModelId`，也没有向节点 `emit`，导致当前活跃品牌与当前活跃模型产生分裂。
2. **列表回退边界判定失真**：为了防止已持久化但在目录（catalog）中暂无定义的模型在列表中被隐藏，原代码实现了 `needsActive` 逻辑。然而其判定条件仅为 `shownBrandId === activeBrandId && activeModelId && !rows.some(r => r.id === activeModelId)`，完全漏掉了**该模型是否真正属于当前品牌**的校验。当 `activeBrandId` 变成 deepseek，而 `activeModelId` 仍是 gemini 时，`needsActive` 误将 gemini 插入了 deepseek 的模型列表。

### 2.2 根治契约
1. **品牌从属强校验**：
   在 `shownModels` 计算中，补全 `needsActive` 必须满足 `brandForModel(activeModelId, allowedBrands) === shownBrandId`。不属于当前品牌的模型绝对禁止插入到该品牌的二级列表中。
2. **配置各二级菜单的默认模型**：
   建立多模态（text / image / video）下各品牌的默认模型配置表：
   - `text`: openai -> `gpt-5.5`, anthropic -> `claude-opus-4-6`, google -> `gemini-3.8-flash`, deepseek -> `deepseek-v4-flash-vision-exp`, minimax -> `minimax-h3`
   - `image`: openai -> `gpt-image-2.5`, google -> `nano-banana-2`, bytedance -> `seedance-2-0-fast`, kling -> `kling`, midjourney -> `midjourney`, xai -> `grok-imagine-image-2`
   - `video`: bytedance -> `seedance-2-0-fast`, openai -> `gpt-5.5`, minimax -> `minimax-h3`, kling -> `kling`, alibaba/happyhorse -> `wan-3.0`, google -> `gemini-3.8-flash`, xai -> `grok-imagine-video-1-5`
   同时配置通用回退机制：优先使用配置的默认模型；若在当前品牌可用模型列表中未匹配到，则回退到该品牌可用模型的第一项；若均无则使用通用品牌默认值。
3. **点击一级菜单立即切换默认模型**：
   重构 `handleBrandClick`：当用户点击一级菜单（`brandId`）时，解析该品牌在当前模态下的默认模型 `targetModelId`，并立即执行选中逻辑（`handleSelectModel(targetModelId)`），同步更新 `activeModelId`、`activeBrandId`、渠道分组并提交节点。
4. **保持悬停与点击边界清晰**：
   悬停一级菜单（`handleBrandHover`）仅用于预览该品牌下的二级菜单，不触碰选中态与节点提交；只有点击一级菜单才触发切换与写入。

## 3. 验收标准与测试用例

1. **点击一级菜单切换**：
   - 处于某一模型状态下，点击任一其他品牌一级菜单，`activeModelId` 立即变更为该品牌的默认模型。
   - 对应的渠道策略与渠道分组同步更新，并触发 `onSelect` 回调。
   - 一级菜单对应品牌显示 Check 图标；二级菜单对应默认模型显示 Check 图标。
2. **跨品牌隔离验证**：
   - 模拟当前 `activeModelId` 为 `gemini-3.8-flash`，查看 DeepSeek 品牌下的二级列表，列表中绝对不包含 `gemini-3.8-flash`。
   - 模拟当前 `activeModelId` 为 `deepseek-v4-flash-vision-exp`，查看 Google 品牌下的二级列表，列表中绝对不包含 `deepseek-v4-flash-vision-exp`。
3. **回归与兼容性**：
   - 现有测试 17/17 必须全部通过。
   - 新增针对默认模型切换、品牌从属校验的自动化测试。
