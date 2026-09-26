# 规格：修复项目库新建项目在已有工作区确认时因 Promise 丢失导致无法继续

Issue: #2700 · 模块: omnimux-workflow · 风险: R2

## 一、目标（Objective）

解决用户在「项目」库新建本地项目时，选择已存在项目档案的物理目录，弹窗提示「当前工作区已有项目，要在该项目新建创作页吗？」后，再次点击主操作按钮无响应且无法继续加页跳转的阻断性缺陷。

### 验收标准（Success Criteria）
1. **Promise 正确回传**：`ProjectLibraryPage.jsx` 透传 `onSubmit={handleDialogSubmit}`，确保异步提交结果（包括 `{ ok: false, existing: true, error: '...' }`）完整返回给 `NewLocalProjectDialog`。
2. **确认态状态流转闭环**：`NewLocalProjectDialog` 捕获到 `{ existing: true }` 或接收到 `projects.existingConfirm` 错误信息后，将 `confirmedExisting` 置为 `true`。
3. **按钮文案自适应切换**：处于确认态时，主操作按钮文案自适应由 `projects.dialog.submit`（「创建项目」）切换为 `projects.existingConfirmSubmit`（「新建创作页」），给用户明确的确认交互预期。
4. **二次提交成功加页**：用户在确认态下点击「新建创作页」时，请求 payload 携带 `{ confirmedExisting: true }`，后端 `runNewProject` 判定已确认，调用 `addBlankPage` 在已有项目中追加新创作页，并关闭弹窗跳转进画布。

## 二、执行命令（Commands）

- 单测验证：`pnpm --filter omnimux-workflow test`
- 专属测试：`node --test plugins/omnimux-workflow/src/client/projects/NewLocalProjectDialog.test.mjs`
- 门禁检查：`pnpm check`
- 物化同步：`./scripts/sync-to-app.sh omnimux-workflow`

## 三、涉及文件与结构（Project Structure）

- 页面入口：`plugins/omnimux-workflow/src/client/projects/ProjectLibraryPage.jsx`
- 弹窗组件：`plugins/omnimux-workflow/src/client/projects/NewLocalProjectDialog.jsx`
- 弹窗单测：`plugins/omnimux-workflow/src/client/projects/NewLocalProjectDialog.test.mjs`

## 四、代码风格与交互实现规范（Code Style）

1. **零自由发挥文案**：严格使用 `locales.js` 既有文案字段：
   - `projects.existingConfirm`: `当前工作区已有项目，要在该项目新建创作页吗？`
   - `projects.existingConfirmSubmit`: `新建创作页`
   - `projects.dialog.submit`: `创建项目`
2. **零多余修饰**：保持现代 SaaS 科技极简风格，不添加额外装饰图标与口号式文本。
3. **双重防御逻辑**：
   ```jsx
   // NewLocalProjectDialog.jsx
   useEffect(() => {
     if (error && (error === t('projects.existingConfirm') || error.includes(t('projects.existingConfirm')))) {
       setConfirmedExisting(true)
     }
   }, [error, t])
   ```

## 五、测试策略（Testing Strategy）

在 `NewLocalProjectDialog.test.mjs` 中新增单元测试：
- 模拟首轮提交返回 `{ ok: false, existing: true, error: 'projects.existingConfirm' }`；
- 断言首次提交时 `confirmedExisting` 不存在或为 `false`；
- 断言收到 `existing: true` 或该错误后，按钮文案变为 `projects.existingConfirmSubmit`；
- 断言用户第二次点击按钮时，提交 payload 携带 `{ confirmedExisting: true }`。

## 六、研发边界（Boundaries）

- **总是做（Always）**：保持前后端协议向后兼容；所有改动通过独立 worktree 进行；修改后执行全量测试与代码审查。
- **先问（Ask First）**：涉及新依赖引入或非当前缺陷范围内的样式重构。
- **绝不做（Never）**：直接在主检出修改跟踪代码；跳过产品文案核定与代码审查。
