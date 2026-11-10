# Issue #4032 验收证据 · 清理 V1 画布残留绑定并抑制槽位裸「不可用」

- 任务分支：`agent/workflow-prune-stale-slot-binding-issue-4032`
- PR：#4035
- 基线：`origin/main`（f3723267）
- 关键提交：主修复 + 评审跟进（edge 源交叉校验、回归用例、规格同步）

## 验证命令与真实输出

### 包级全量测试（cwd `plugins/omnimux-workflow`）
`node --import ./test-setup.mjs --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"`
```
ℹ tests 3142
ℹ pass 3142
ℹ fail 0
```

### 类型检查
`tsc -p tsconfig.canvas.json --noEmit` / `tsconfig.host.json` / `src/director/tsconfig.json` → exit 0

### 静态门禁
- `verify:slots`：✓ 2729 client files，0 violations
- `verify:stages`：PASS 13 Stage components
- `verify:stage-scroll`：7 页合规

### 隔离工作树真实浏览器
`node scripts/worktree-web-qa.mjs workflow` → ✅ PASS（真实内核 · 动态端口 · 1280x713 截图）
说明：该脚本验证的是 omnimux-workflow 插件在隔离工作树的真实渲染；#4032 的槽位具体行为由
`slotUnavailableRecovery.e2e.test.mjs` 与 `slotInteractionRefinement` 等确定性用例覆盖。

## 端到端/集成回归固化
`plugins/omnimux-workflow/src/shared/graph/slotUnavailableRecovery.e2e.test.mjs`
- 上游被删除后，未固定残留绑定在重算中被清理，展示侧无填充态 / 无 `input_unavailable`
- `pinned` 用户选择在供给失效时保留为可停用的无效意图
