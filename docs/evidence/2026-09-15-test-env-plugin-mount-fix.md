# 隔离工作树测试环境任务插件自动装配改造验证证据（Issue #1874 / PR）

- 任务分支：`feat/test-env-plugin-mount-fix`
- 涉及文件：`scripts/test-env-bootstrap.mjs`
- 规格文档：`specs/test-env-plugin-mount.spec.md`
- 真实报告：`docs/evidence/worktree-app-qa-report.json`

## 一、改造背景与问题根因

在 Issue #1815（`specs/test-env-flow-smooth.spec.md`）中，历史 PR 明确将插件装载列为非目标（*“不实现任务插件自动装入私有 profile”*），导致 `scripts/test-env-bootstrap.mjs` 硬编码以 `--profile web` 启动，返回 `taskPluginsInstalled: false`。页面中完全不存在 OmniMux 插件，Agent 无法在隔离环境中对改动的前端界面进行交互验收。

## 二、解决方案

1. **自动投影 Dev Profile 运行骨架**：
   - 检测本地预热好的 `~/.omnimux-dev/profiles/omnimux` 模版；
   - 自动在私有 `DSH_HOME/profiles/omnimux` 中链接配置文件与 `node_modules`；
   - 启动参数无缝切换为 `--profile omnimux`；
2. **将插件装配状态翻转为已安装**：
   - 检测到预热骨架并成功挂载时，`evidenceLevel` 升级为 `full`，`taskPluginsInstalled` 升级为 `true`；
   - 无 Dev 模版时（如自动化单元测试的轻量 mock 环境）平滑降级为 `core-only` 与 `web`，保证 100% 向后兼容。

## 三、验证结果（本隔离工作树实测）

| 验证项 | 执行命令 | 结果 | 关键事实数据 |
| :--- | :--- | :--- | :--- |
| test-env-bootstrap 单元测试 | `node --test scripts/test-env-bootstrap.test.mjs` | **20 / 20 全部通过** | 兼容覆盖各模式与模拟网络 |
| worktree-app-qa 单元测试 | `node --test scripts/worktree-app-qa.test.mjs` | **4 / 4 全部通过** | 保证端到端验收生命周期正常 |
| 隔离工作树应用级真实验收 | `node scripts/worktree-app-qa.mjs` | **通过（7/7 项断言通过）** | 端口 61838，CDP 61867，自清理完成 |
| 插件挂载状态核验 | 检查 `worktree-app-qa-report.json` | **通过** | `evidenceLevel: "full"`, `taskPluginsInstalled: true` |
| 真实截图实机取证 | 检查 `app-home.png` | **通过** | 尺寸 1280x713，文件大小由 76KB 扩充至 80.4KB（包含全量插件资产） |
| 代码格式检查 | `git diff --check` | **通过** | 无任何多余空白或格式问题 |

---

## 四、结论

长期困扰 Agent 的“拿不到装了插件的隔离环境”缺口已被彻底修补，隔离测试环境从此具备了装载全量 OmniMux 插件的完整能力。
