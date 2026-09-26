# 存量预置工程孤立节点清洗与应用表单运行时拓扑防御规格（Spec Plan）

**版本**：v1.0.0-PROD  
**负责人**：产品经理 · 许清楚 / 系统架构师 · 高见远 / 前端开发 · 裴像素  
**状态**：APPROVED & IN_PROGRESS  
**适用范围**：`omnimux-apps`、`omnimux-workflow`、`omnimux` 官方内置短视频应用清单、预置工作流工程与表单渲染引擎。

---

## 一、业务痛点与根因剖析

### 1. 业务痛点
用户在打开官方内置应用（例如《手机与网页交互实机演示》、《3D 视效粒子》等）时，左侧表单界面赫然显示「解说人声音色」下拉输入项，并提供“活力女声（电商促销爆款）”等选项。然而：
1. 底层工程画布中，该「旁白解说与音色 (Voice TTS)」节点是一个入度为 0、出度为 0 的纯孤立节点，未连接下游任何视频生成节点；
2. 用户在表单中无论怎么配置该音色，后台工作流执行引擎根本不会调度该孤立节点，产物视频完全没有应用该音色；
3. 用户产生强烈的“表单欺骗感”与困惑（为什么未连接的孤儿节点会进入表单？）。

### 2. 根因剖析
- **增量已修，存量未洗**：PR #2698 成功修复了创作者在画布上重新“发布应用”时的动态拓扑剪枝门禁，但官方 8 款预置短视频应用（`app-creatify-*.workflow.json` 与 `app-builtin-product-video.workflow.json`）在历史静态数据中硬编码塞入了未连线的 `node-slot-voice-tts` 孤立节点；
- **内置清单硬编码**：`builtin-apps.json`、`builtinCatalogData.ts`、`featured-apps-data.js` 的 `formSchema` 与 `fieldMappings` 显式声明了 `voice` 表单字段；
- **前端缺少运行时防线**：`AppFormPanel.tsx` 纯静态读取 `manifest.formSchema.properties`，没有基于底层工作流快照（`snapshot`）做实时的节点有效性与可达性校验。即使存在未连线的死节点，依然原样渲染表单输入控件。

---

## 二、双轨彻底根治治理架构（Dual-Track Architecture）

```
┌─────────────────────────────────────────────────────────────┐
│                 存量静态数据彻底清洗 (Track 1)               │
│  - 8 款预置工作流 JSON 移除孤立 node-slot-voice-tts 节点     │
│  - builtin-apps.json 移除 voice 表单属性及映射              │
│  - builtinCatalogData.ts / presetWorkflows.js 同步清洗      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               客户端运行时拓扑防御门禁 (Track 2)             │
│  - AppFormPanel 渲染前执行 Runtime Reachability Filter       │
│  - 校验 fieldMapping 所绑定的 nodeId 是否在 snapshot 中有效  │
│  - 纯孤立死节点 (InDeg===0 && OutDeg===0) 在运行时静默剔除   │
│  - 存量副本、历史工程 100% 自动免疫悬挂输入项                 │
└─────────────────────────────────────────────────────────────┘
```

### 轨一：存量静态数据彻底清洗（Static Data Clean）
1. **预置工作流文件清洗**：
   - 目标文件：
     * `plugins/omnimux-apps/catalog/presets/app-creatify-app-demo.workflow.json`
     * `plugins/omnimux-apps/catalog/presets/app-creatify-3d-cute-vfx.workflow.json`
     * `plugins/omnimux-apps/catalog/presets/app-creatify-apparel-tryon.workflow.json`
     * `plugins/omnimux-apps/catalog/presets/app-creatify-chasing-product.workflow.json`
     * `plugins/omnimux-apps/catalog/presets/app-creatify-fall-down-durability.workflow.json`
     * `plugins/omnimux-apps/catalog/presets/app-creatify-product-spotlight.workflow.json`
     * `plugins/omnimux-apps/catalog/presets/app-creatify-ugc-selfie.workflow.json`
     * `plugins/omnimux-apps/catalog/presets/app-builtin-product-video.workflow.json`
   - 清洗内容：删除未连线的 `node-slot-voice-tts` 节点，更新 `metadata.nodeCount`。
2. **预置应用清单清洗**：
   - 目标文件：
     * `plugins/omnimux-apps/catalog/builtin-apps.json`
     * `plugins/omnimux-apps/src/shared/builtinCatalogData.ts`
     * `plugins/omnimux-workflow/src/client/projects/presetWorkflows.js`
     * `plugins/omnimux/src/client/session-guide/templates/featured-apps-data.js`
   - 清洗内容：彻底删除 `formSchema.properties.voice`、`fieldMappings.voice`，若有 `demoSnapshot.voice` 一并剔除。

### 轨二：表单渲染层运行时拓扑防御（Runtime Reachability Defense）
1. 在 `plugins/omnimux-apps/src/client/AppFormPanel.tsx` 中：
   - 在计算有效字段条目 `fieldEntries` 时，引入 `filterReachableFormFields` 算法：
   - 若 `manifest.workflowBinding?.snapshot` 提供有 `nodes` 与 `edges`，构建节点出度/入度与有向连线表；
   - 针对每个表单字段 `fieldKey`，获取其绑定的 `mapping.nodeId`；
   - **剔除规则**：若该 `nodeId` 在工作流中存在，但其 `inDegree === 0 && outDegree === 0`（未连入任何上游，也未连出任何下游，纯悬挂死节点），则在表单渲染前将其从可见字段列表中过滤排除！
   - 确保终端用户界面零虚假输入项，真正实现“所见即所跑”。

---

## 三、UI 元素白名单与文案字典规格（UI & Copy Spec）

清洗后，官方短视频应用表单中**仅允许出现以下核定白名单字段**：

| 字段标识（Field Key） | 元素类型 | 标题（Title） | 占位与辅助说明（Description） | 状态契约 |
|---|---|---|---|---|
| `product_image` | `product-link` / 媒体卡 | `商品主图 / 白底图` | `粘贴商品链接、从商品库选择或本地上传` | 必填（*） |
| `copywriting` | `textarea` 文本域 | `核心卖点与旁白分镜` | `填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏` | 必填（*） |
| `aspect_ratio` | `ratio-cards` 比例卡片 | `视频成片比例` | `选择适用的平台播放比例` | 选填（默认 9:16） |
| `__model__` | `select-single` 下拉框 | `生成模型` | `选择生成底座模型，智能推荐为当前场景最优模型` | 选填（默认 Seedance 2.0 / MiniMax-H3） |
| **`voice`（解说人声音色）** | **禁止出现** | **彻底剔除** | **严禁在表单中渲染悬挂音色控件** | **PROHIBITED** |

---

## 四、实施计划与验收标准（Plan & AC）

### 1. 任务拆解
- **Task 1**：清洗 8 款 preset workflow JSON，剔除 `node-slot-voice-tts` 孤立节点；
- **Task 2**：清洗 `builtin-apps.json`、`builtinCatalogData.ts`、`presetWorkflows.js`、`featured-apps-data.js` 中的 `voice` 字段声明与映射；
- **Task 3**：在 `AppFormPanel.tsx` 中实装运行时拓扑可达性校验，过滤孤立节点表单项；
- **Task 4**：更新相关单测断言（如 `builtinFormWidgets.test.mjs` 等），补充端到端测试；
- **Task 5**：PM 终验、OCR 代码审查、QA 全量测试通过后合入主线。

### 2. 量化验收标准（AC）
- **AC-1**：打开《手机与网页交互实机演示》等短视频应用，表单中绝不包含「解说人声音色」字段；
- **AC-2**：预置工作流导入画布后，画布节点中不再含有悬挂的 `node-slot-voice-tts` 音频卡片；
- **AC-3**：运行时拓扑防御生效，任何旧工程中若包含出度为 0 且入度为 0 的孤立节点，表单自动忽略该字段；
- **AC-4**：`omnimux-apps` 与 `omnimux-workflow` 单元测试与端到端测试 100% 全部通过。
