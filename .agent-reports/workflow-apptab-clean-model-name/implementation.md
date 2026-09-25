# 工程师实现报告 · Issue #2647 移除模型下拉后缀提示并增强工程默认模型推导

## 1. 任务背景与核心改动
- **任务编号**：Issue #2647
- **规格说明书**：`specs/clean-model-name-and-robust-default.spec.md`
- **实施责任人**：工程师 寇豆码（Kou）
- **核心目标**：
  1. 彻底移除生成模型下拉框收起态和展开首项标题中的 `(工程默认 · 作者推荐)` 冗长后缀文本，界面回归极简专业；
  2. 解决部分历史本地缓存中仅存有 `workflowBinding: { workspaceId: "..." }`、缺失 `snapshot.nodes` 时错误回退为「智能推荐 (默认)」的缺陷，增加多层级健壮推导；
  3. 全量测试通过，通过真实无头 Chrome 浏览器进行全流程端到端交互验收。

## 2. 改动清单与文件明细

| 文件路径 | 改动性质 | 核心改动要点 |
|---|---|---|
| `plugins/omnimux-workflow/src/client/projects/appTabWidgets.js` | 核心逻辑新增 | 实现并导出 `resolveDefaultNodeModelId(manifest)`，支持四层级健壮推导：<br>1. 优先读取 `defaultModel` / `metadata.defaultModel` 并归一化；<br>2. 遍历 `snapshot.nodes` 识别主生成节点模型并跳过 slot/import；<br>3. 识别 creatify / builtin 预设及 workspaceId 回退 `seedance-2.0`；<br>4. 根据应用分类识别：图片分类回退 `gpt-image-2.5`，视频或缺省回退 `seedance-2.0`。 |
| `plugins/omnimux-workflow/src/client/projects/AppTab.jsx` | 界面与推导重构 | 1. 引入并复用 `resolveDefaultNodeModelId`，使 `defaultModelName` 100% 能够解析出友好模型名称；<br>2. 下拉框收起按钮直接展示纯净模型名称 `{defaultModelName \|\| 'Seedance 2.0'}`，彻底去除 `(工程默认 · 作者推荐)` 后缀；<br>3. 下拉菜单首项主标题直接展示纯净模型名称，副标题极简展示为 `工程预设推荐模型`，彻底消灭「智能推荐 (默认)」。 |
| `plugins/omnimux-workflow/src/client/projects/appTabWidgets.test.mjs` | 单元测试扩充 | 1. 扩充针对 `resolveDefaultNodeModelId()` 的全分支测试（显式声明、节点拓扑排他识别、历史缓存 nodes 缺失、图片分类推导、空入参兜底）；<br>2. 补充 `AppTab.jsx` 源码静态防回退断言（绝不含 `工程默认 · 作者推荐`，绝不含 `智能推荐 (默认)`，首项副标题为 `工程预设推荐模型`）。 |
| `plugins/omnimux-workflow/tests/apptab-form-widgets.e2e.test.mjs` | 端到端测试同步 | 1. 将默认模型展示断言更新为纯净的 `Seedance 2.0`，断言不包含 `(工程默认 · 作者推荐)`；<br>2. 将复杂节点拓扑的主模型断言更新为纯净的 `可灵 Kling O3`；<br>3. 补充场景 5：历史缓存仅含 workspaceId 时默认模型健全推导为 `Seedance 2.0`；<br>4. 补充场景 6：图片类应用无 nodes 时健全推导为 `GPT Image 2.5`。 |
| `scripts/verify-issue-2647-browser-e2e.mjs` | 真实浏览器验证 | 编写真实无头 Chrome 浏览器 (CDP) 端到端自动化验收脚本，覆盖三大核心场景并输出高清截图与报告。 |
| `docs/evidence/workflow-apptab-clean-model-name-issue-2647-verified.md` | 质量验收凭证 | 记录无头 Chrome 浏览器三场景真实 DOM 与几何尺寸测试读数，全部场景 PASS。 |

## 3. 全局一致性自检

1. **接口与类型对齐**：调用端（`AppTab.jsx`）与推导实现端（`appTabWidgets.js`）完全对齐，导出名与签名 100% 一致。
2. **跨文件引入合法性**：所有模块、React hooks、规范表引用完备无误，无循环依赖，无悬空未定义变量。
3. **零空桩与代码完整性**：绝对禁止 `pass`、`TODO`、未实现桩函数，所有分支逻辑全部完整落地。
4. **文案规范扫描**：零违规词汇，无空白换行异常（`git diff --check` 通过）。
5. **门禁与测试运行结果**：
   - `omnimux-workflow test`：2066/2066 通过（100%）；
   - `omnimux-apps test`：82/82 通过（100%）；
   - `omnimux-workflow build`：顺利完成构建；
   - `scripts/verify-issue-2647-browser-e2e.mjs`：三大场景在真实无头 Chrome 中实测 100% 达标。

## 4. 自检结论判定
- **IS_PASS: YES**（自检全绿，代码完整合规，可交审查员审秋毫进行行级代码审查）。
