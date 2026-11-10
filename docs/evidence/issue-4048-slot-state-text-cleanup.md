# Issue #4048 验收证据 · 去掉卡槽下方常驻状态文案 + 清理跨模式残留槽位绑定

- 任务分支：`agent/workflow-slot-state-text-cleanup-issue-4048`
- 基线：`origin/main`
- 变更：`canvasSlotRecompute.ts`（槽位存在性校验）、`SlotWells.tsx`（移除常驻状态文案）

## 验证命令与真实输出

### 定向测试
`node --import ./test-setup.mjs --test src/shared/graph/slotSubmissionConsistency.test.mjs src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs src/shared/graph/slotStateCleanup.e2e.test.mjs`
```
ℹ tests 105（含新增）
ℹ pass 105
ℹ fail 0
```

### 包级全量测试（cwd `plugins/omnimux-workflow`）
`node --import ./test-setup.mjs --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"`
```
ℹ tests 3152
ℹ pass 3152
ℹ fail 0
```

### 类型检查
`tsc -p tsconfig.canvas.json --noEmit` → exit 0

### 新增回归
- `slotSubmissionConsistency`：当前 layout 不存在的槽位（未固定 pinned=false）绑定在重算时被清理；pinned=true 保留。
- `slotInteractionRefinement`：`invalid / inactive / pending` 任一状态均不渲染 `wf-slot-well__state`，且无「不兼容/不可用/等待中/未使用/无效」文案。
- `slotStateCleanup.e2e.test.mjs`：切换生成方式后，残留槽位绑定经重算与展示/提交读取均不再出现。
