# #765 五页分割线内缩与发布工具栏防裁切最小实现阶段报告

- **实施工程师**：寇豆码（Alex / Kou）
- **基线 Commit**：`a6ac030815ce94f71e81b4533dbdca212c5aa978`（最新独立 fetch 的 main）
- **任务工作树**：`.worktrees/cross-page-dividers-765-rebased`
- **任务分支**：`agent/cross-page-dividers-765-rebased`
- **参考依据**：`.workbuddy/evidence/issue-765-ui-current-main-review.md`
- **全局一致性审查判定**：**IS_PASS: YES**

---

## 1. 任务背景与实施范围

针对 #765 涉及的“五页一级分割线内缩、数据分析页第二条底线内缩、发布页面工具栏防裁切及组件无障碍完善”需求，在结合最新已合入 PR #865（引入固定 kit 制品 `dsh-ui-kit-0.1.0.tgz`）与 QA94 只读复核报告的基础上，严格落实最小、干净的源码实现方案：

1. **拒绝旧包整体覆盖**：严格保护最新 main 中已由 PR #865 引入的 TypeCard Button/span 重构与相关 CSS，不进行大包整体覆盖。
2. **剔除冗余去边框样式**：由于 PR #865 的固定 kit 在 `PageHeader.module.css` 中已原生包含 `border-bottom: none`，旧 Hub 中覆盖 `.dshUk-PageHeader-pageHeader` 的样式属于重复冗余，本轮明确不予引入，避免掩盖依赖关系。
3. **精准收敛至 5 个目标源码文件**：严格仅针对目标文件进行最小增量变更，消除一切多余文件与测试噪声。

---

## 2. 变更源码文件清单与具体改动

| 序号 | 目标文件 | 变更性质 | 改动要点说明 |
| --- | --- | --- | --- |
| 1 | `plugins/omnimux/src/client/styles.js` | CSS | 增加项目/发布/分析/资产/产品五页一级 Divider（`margin-inline: 20px / 24px`）、分析页第二条底线（`margin-inline: 20px; padding-inline: 0`）与项目库 720px 媒体查询；**不添加** PageHeader 边框覆盖规则。 |
| 2 | `plugins/omnimux-publish/src/client/PublishStage.jsx` | JSX | 将传递给 `PublishControlBar` 的 `channelFilter / onChannelChange` 修正为与 `usePublishFeed` 和子组件完全匹配的 `modeFilter / onModeChange` 接线。 |
| 3 | `plugins/omnimux-publish/src/client/views/PublishControlBar.jsx` | JSX | 去除 `FilterBar`；解构为 `.omnimux-publish-tabs` 与 `.omnimux-publish-control-tools`（`role="toolbar"`）；三视图按钮恢复 32px 并补齐 `aria-label` / `aria-pressed`；`SearchField` 改为弹性类名与 `onValueChange` / `clearLabel`；`DropdownSelect` 补齐 `aria-label`、`placeholder` 与 `undefined` 降级。 |
| 4 | `plugins/omnimux-publish/src/client/locales.js` | JS (i18n) | 补齐 zh 与 en 词典中的 4 组中英文案（`filter.sort`, `filter.type`, `filter.mode`, `search.clear`）。 |
| 5 | `plugins/omnimux-publish/src/client/styles.js` | CSS | 调整 `.omnimux-publish-action-row` 与 `.omnimux-publish-control-bar` 为弹性换行布局；增加 tabs/control-tools/search 自适应规则；**严格保留** main 中合入的 `.omnimux-publish-type-card` 与 `span` 样式。 |

---

## 3. Git Diff 统计

```text
 plugins/omnimux-publish/src/client/PublishStage.jsx    |  4 +--
 plugins/omnimux-publish/src/client/locales.js      |  8 +++++
 plugins/omnimux-publish/src/client/styles.js       | 41 +++++++++++++++++++++-
 plugins/omnimux-publish/src/client/views/PublishControlBar.jsx | 37 ++++++++++++-------
 plugins/omnimux/src/client/styles.js               | 19 ++++++++++
 5 files changed, 93 insertions(+), 16 deletions(-)
```

经 `git diff --check` 核验，0 告警，0 格式/行尾空格瑕疵。

---

## 4. 本地测试与契约验证结果

在工作树中执行针对性单测与 Stage 契约检查：

1. **`omnimux-publish` 单元测试**：
   - 执行：`node --test src/*.test.js src/shared/*.test.js src/client/*.test.js`
   - 结果：**254/254 PASS**（0 fail, 0 skipped, 时长 1122ms）。
   - Client Bundle 编译：`node scripts/build-client.mjs` 成功构建（输出 `lib/client.js` 275690 字节）。
2. **`omnimux` 插件全量测试**：
   - 执行：`node scripts/run-tests.mjs`
   - 结果：**1408/1408 PASS**（0 fail, 0 skipped, 时长 2705ms）。
3. **`omnimux-workflow` UI/Stage 相关测试**：
   - `src/projects/projects.test.mjs`：**5/5 PASS**。
   - `src/client/projects/*.test.*`：**50/50 PASS**。
4. **全量 Stage 组件契约验证**：
   - 执行：`node scripts/verify-stage-contracts.mjs`
   - 结果：`PASS: 11 Stage components; 9 registered sidebar targets and their runtime contracts.`。
5. **其它关联插件**：
   - `omnimux-products`：**78/78 PASS**。
   - `omnimux-analytics`：核心单测全部通过。

---

## 5. 全局一致性审查（Global Consistency Review）

- **Cross-file import consistency**：无缺失 import，未使用的 `FilterBar` 已清理，各子模块组件导入完全合规。
- **Interface contract compliance**：`PublishControlBar` 接收属性与 `PublishStageContent` 传参完全对齐；`SearchField` 回调适配 `onValueChange`；Dropdown 各选项均正确映射。
- **Data flow correctness**：`modeFilter` 与 `setModeFilter` 数据流完整畅通，未引入冗余状态。
- **No duplicate implementations**：未重复声明已有 CSS；未添加与固定 kit 冲突的边框覆盖规则。
- **Verdict**：**IS_PASS: YES**

---

## 6. 后续状态与交付约束

- **约束遵从**：
  - 本次变更完全限制在独立工作树 `.worktrees/cross-page-dividers-765-rebased` 内。
  - 未修改任何官方 DSH/Prod 文件，未执行 `git push` 或 `git merge`，未物化 Dev。
  - 主仓 main 工作区保持完全干净。
- **后续衔接**：代码已就绪，等待主理人与 QA 进行后续代码评审、PR 发起以及合并后 Dev 环境（45120）以真实 ego-browser 进行最终 UI 验收。
