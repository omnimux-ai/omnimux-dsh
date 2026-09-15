# 规格说明：专家市场卡片头像统一为像素小人头像并与输入框全域收敛规范

- **任务编号**：Issue #1898
- **分支名称**：`agent/market-pixel-avatar-issue-1898`
- **目标领域**：专家市场与 Agent 预设选择器视觉收敛（`omnimux-market` & `omnimux`）

---

## 1. 问题背景与根因定位

在此前进行的 Agent 头像收敛中，主输入框的预设菜单已成功接入确定性像素艺术头像（`pixel-avatar.js`），但专家市场依然存在视觉割裂：
1. 专家市场数据定义（`expert-market.ts` 与 `plazaUtils.js`）写死了历史 3D/AI 写实人物肖像图片路径（`catalog/covers/expert-*.png`）；
2. 专家市场卡片组件（`ExpertCard.jsx`）直接加载上述写实肖像，未接入像素艺术头像生成算法；
3. 主中枢输入框增强器（`agent-preset-enhancer.js`）曾错误地将市场专家的写实图片列为“专属封面”，导致输入框与专家市场两处逻辑脱节。

本任务将专家市场卡片头像彻底统一为与图 2 完全一致的像素小人头像，并移除对旧写实图片的依赖，实现全域视觉 100% 一致。

---

## 2. 变更设计

1. **统一像素头像算法共用或同源映射**：
   - 将确定性像素头像生成器（`pixel-avatar.js`）作为专家头像的唯一真源；
   - 在 `plugins/omnimux-market` 中，专家数据的 `avatar` 统一使用对应的像素头像数据（或由卡片直接根据专家 ID 渲染像素头像）。
2. **清理专家市场卡片对历史旧图的依赖**：
   - 改造 `ExpertCard.jsx`，头像展示统一为像素头像；
   - 更新 `DEFAULT_MARKET_EXPERTS` 的头像定义与状态；
   - 避免加载失效的本地图片，头像加载失败兜底同样回退为对应 ID 的像素头像。
3. **收敛主中枢输入框映射**：
   - 清理 `agent-preset-enhancer.js` 中的 `BUILTIN_EXPERT_COVERS` 写实照片映射；
   - 确保 `resolveAgentPresetAvatar` 对所有专家一律生成确定性像素艺术头像。
4. **契约与单测保障**：
   - 更新并扩充 `agent-market-avatar-convergence.test.js`，验证输入框与专家市场针对所有垂直专家生成的头像 100% 逐字相同；
   - 更新 `experts-market.test.ts`，确保市场 API 与卡片单元测试全绿通过。

---

## 3. 验收标准

1. 专家市场中 8 位垂直专家（Shopee运营专家、YouTube创作者专家、亚马逊运营专家、TikTok Shop运营专家等）卡片头像全部展示为图 2 风格的像素艺术小人；
2. 输入框 Agent 预设下拉列表中，垂直专家的头像与专家市场卡片头像完全 1:1 一致；
3. 彻底停用并移除针对 `catalog/covers/expert-*.png` 的写实图片特化绑定；
4. 单元测试与端到端收敛测试 100% 通过。
