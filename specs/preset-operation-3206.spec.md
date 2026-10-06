# 规格：内置 AI 应用模板必须显式声明视频 operation（Issue #3206）

## 1. 用户旅程与验收标准

**旅程**：用户在「AI 应用」里对一个内置应用点「创建副本」→ 进入副本画布 → 打开视频生成节点配置面板 → 直接提交生成。

**修复前**：面板出现 `⚠ <槽位名> · 素材不可用，请替换或重试`，且最小输入不满足（`readyToSubmit:false`），副本不可用。
**修复后**：无该冲突条，图片槽位正常绑定到首帧，最小输入满足，可直接提交。

**可测验收**：

1. 8 套含视频节点的内置应用模板（`plugins/omnimux-apps/catalog/presets/*.workflow.json`）中，视频生成节点的 `data.params` 不再含 `mode` 字段，且含显式 `operation`。
2. `plugins/omnimux-workflow/src/client/projects/presetWorkflows.js` 的 `PRESET_WORKFLOW_MAP` 与 `plugins/omnimux-apps/src/shared/builtinCatalogData.ts` 的快照与 (1) 一致。
3. 每条指向视频生成节点的边，其 `data.targetSlot` 必须落在该节点 `operation` 的卡槽集合内。
4. 生成器 `scripts/transpile-creatify-workflows.mjs` 同步产出上述结构，重新生成不会回退。
5. `node scripts/qa-verify-preset-workflow-standards.mjs` 通过。

## 2. 根因

模板把「首帧」写在 `data.params.mode`，而当前代码只认 `data.params.operation`（`readPreferredOperationId`）。`params.operation` 缺失 → 操作按上游素材指纹推断并回落 catalog 默认 `video_multi_ref` → 边的 `data.targetSlot:"first_frame"` 在该操作布局里不存在 → `slot_removed` + `min_unsatisfied`。

`seedance-2-0#first_frame` 是 listed 操作，其槽位就是 `first_frame`，因此槽位名无需改动，缺的只是显式 operation。

## 3. 写域

| 文件 | 改动 |
| --- | --- |
| `scripts/transpile-creatify-workflows.mjs` | 生成器：`mode` → `operation` |
| `plugins/omnimux-apps/catalog/presets/*.workflow.json`（8 个） | 模板数据同步 |
| `plugins/omnimux-workflow/src/client/projects/presetWorkflows.js` | 前端预设镜像同步 |
| `plugins/omnimux-apps/src/shared/builtinCatalogData.ts` | 静态内联镜像同步 |
| `scripts/qa-verify-preset-workflow-standards.mjs` | 新增回归断言 |

## 4. 非目标

- 不修已落盘的存量坏副本（其 `params.operation` 已写死为 `video_multi_ref`），需单独迁移任务。
- 不改导入层剔除派生字段（`slotConflicts` / `compat`），另开 Issue。
- 不改 `resolveSlotOperation` 的视频早退分支。

## 5. 新用户基线

不依赖任何开发机状态：三处镜像都是随包发布的静态数据，全新安装即生效；缺该修复时的错误表现就是本文 §1「修复前」描述。

## 6. 文档影响

`docs/contracts/node-input-submission.md` 已要求区分「渠道限制未知 / 素材元信息未读取 / 素材不可用」；本次修复属模板数据纠正，不改变契约语义，无需更新契约文档。
