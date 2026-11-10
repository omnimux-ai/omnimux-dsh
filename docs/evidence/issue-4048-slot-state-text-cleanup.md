# Issue #4048 验收证据 · 去掉卡槽下方常驻状态文案

- 任务分支：`agent/workflow-slot-state-text-cleanup-issue-4048`
- 基线：`origin/main`
- 范围：仅展示层。`SlotWells.tsx` 删除常驻 `wf-slot-well__state` 文本；`components.css` 删除对应死样式。数据层 `slotBindings` 清理不在本次（涉及显示=提交/autoFill 语义重构，另行跟进）。

## 验证命令与真实输出

### 定向测试
`node --import ./test-setup.mjs --test src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs src/shared/graph/slotStateTextContract.e2e.test.mjs src/shared/graph/slotSubmissionConsistency.test.mjs`
```
ℹ tests 15
ℹ pass 15
ℹ fail 0
```

### 包级全量测试（cwd `plugins/omnimux-workflow`）
```
ℹ tests 3150
ℹ pass 3150
ℹ fail 0
```

### 类型检查
`tsc -p tsconfig.canvas.json --noEmit` → exit 0
`tsc -p tsconfig.host.json --noEmit` → exit 0

### 隔离工作树真实浏览器
`node scripts/worktree-web-qa.mjs workflow` → ✅ PASS（真实内核 · 动态端口 · 1280x713）
- runId：`b3a306e9-9798-44cd-b7e6-ec85dd6d688b`
- 报告：`.workbuddy/evidence/worktree-qa/b3a306e9-9798-44cd-b7e6-ec85dd6d688b/worktree-qa-report.json`
- 截图：`.workbuddy/evidence/worktree-qa/b3a306e9-9798-44cd-b7e6-ec85dd6d688b/workflow.png`
说明：该脚本验证 omnimux-workflow 插件在隔离工作树真实渲染；槽位具体行为由确定性用例覆盖，Dev 真机归人工。

## 回归
- `slotInteractionRefinement.test.mjs`：invalid / inactive / pending / input_unavailable 均不渲染 `wf-slot-well__state` 与「不兼容/不可用/等待中/未使用/无效」。
- `slotStateTextContract.e2e.test.mjs`：读取实际 SlotWells 源码与主题，断言无状态文案节点/样式，防止回归。
