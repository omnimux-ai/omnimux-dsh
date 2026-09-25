# Issue #2647 真实浏览器端到端质量验证报告

## 1. 验证目标与结论
- **结论判定**：**PASS (100% 达标)**
- **业务验证目标**：
  1. 彻底移除 `(工程默认 · 作者推荐)` 文本提示；
  2. 收起按钮与下拉浮层首项统一展示纯净模型名称（如 `Seedance 2.0`）；
  3. 下拉浮层首项副标题极简展示为 `工程预设推荐模型`；
  4. 解决历史缓存缺少 `snapshot.nodes` 误回退为「智能推荐 (默认)」的缺陷，实现多层级健全推导。

## 2. 真实浏览器场景实测明细

| 场景编号 | 测试场景描述 | 预期表现 | 真实浏览器实测读数 | 判定 |
|---|---|---|---|---|
| **场景一** | 影视级应用配置 Seedance 2.0 (含 nodes) | 收起按钮展示纯净 "Seedance 2.0"；下拉首项标题 "Seedance 2.0"，副标题 "工程预设推荐模型" | 收起按钮: `Seedance 2.0`<br>首项标题: `Seedance 2.0`<br>首项副标题: `工程预设推荐模型` | **PASS** |
| **场景二** | 历史本地缓存仅有 workspaceId (nodes 为空) | 健全识别 creatify 预设与视频分类，推导为 "Seedance 2.0"，杜绝智能推荐 | 触发器文本: `Seedance 2.0` | **PASS** |
| **场景三** | 图像类应用 (category === 'image') | 健全识别图片分类，推导为 "GPT Image 2.5" | 触发器文本: `GPT Image 2.5` | **PASS** |

## 3. 留存截图证据
- `docs/evidence/issue-2647-clean-model-name.png`：场景一纯净模型名称与展开菜单截图
- `docs/evidence/issue-2647-history-cache-nodes-empty.png`：场景二历史缓存 nodes 缺失推导截图
- `docs/evidence/issue-2647-image-category-model.png`：场景三图像类应用推导截图

---
*验证执行时间: 2026-09-25T03:45:42.571Z*
*环境: Headless Google Chrome (CDP)*
