# Issue #4048 验收证据 · 去掉卡槽下方常驻状态文案 + 清理跨模式残留槽位绑定

- 任务分支：`agent/workflow-slot-state-text-cleanup-issue-4048`
- 基线：`origin/main`
- 变更：`canvasSlotRecompute.ts`（槽位存在性校验 + catalog 未解析保护 + slotConflicts 过滤 + 保留空槽键）、`SlotWells.tsx`（移除常驻状态文案）、`SlotHoverPreview.tsx`（inactive 原因可读）、`components.css`（清理死样式）

## 验证命令与真实输出

### 定向测试（6 个文件）
`node --import ./test-setup.mjs --test src/shared/graph/slotModeSwitchResidual.test.mjs src/shared/graph/slotStateCleanup.e2e.test.mjs src/shared/graph/slotSubmissionConsistency.test.mjs src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs src/canvas/editor/utils/resourcePickerPolicy.test.mjs src/shared/graph/feedSlot/feedSlotKernel.test.mjs`
```
ℹ tests 103
ℹ pass 103
ℹ fail 0
```

### 包级全量测试（cwd `plugins/omnimux-workflow`）
`node --import ./test-setup.mjs --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"`
```
ℹ tests 3155
ℹ pass 3155
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
说明：该脚本验证 omnimux-workflow 插件在隔离工作树真实渲染；#4048 的槽位具体行为由确定性用例覆盖，Dev 真机归人工。

## 新增回归（本任务新增文件）
`plugins/omnimux-workflow/src/shared/graph/slotModeSwitchResidual.test.mjs`
1. catalog 不可用/空 layout 时不得清空未固定但存活的绑定（阻断回归 1）
2. 已保存 `slotConflicts` 不得回填被清理的占位者，且不再报 `role_conflict`（阻断回归 2）
3. 裁剪后保留空槽键（非 `{}`），展示/提交一致，不出现「显示已填、提交为空」（阻断回归 3）
