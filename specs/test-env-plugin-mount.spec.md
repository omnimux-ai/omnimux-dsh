# 隔离测试环境插件自动装配与应用级真实验收改造规格

- 任务分支：`feat/test-env-plugin-mount-fix`
- 涉及文件：`scripts/test-env-bootstrap.mjs`、`scripts/worktree-app-qa.mjs`、`scripts/test-env-bootstrap.test.mjs`、`scripts/worktree-app-qa.test.mjs`
- 关联痛点：彻底打通隔离工作树测试环境中任务插件无法装载的长期遗留缺口（消除 core-only 限制，实现真实插件挂载）。

## 一、背景与问题根因

### 1.1 历史遗留缺口
在 Issue #1815（`specs/test-env-flow-smooth.spec.md`）中，为了快速跑通生命周期，在非目标中显式写明：*“不实现任务插件自动装入私有 profile”*。
导致 `scripts/test-env-bootstrap.mjs`：
1. 仅在临时环境启动了官方空壳底座（`--profile web`）；
2. 硬编码返回 `evidenceLevel: 'core-only', taskPluginsInstalled: false`；
3. 启动后的测试页面中根本不存在任何 OmniMux 插件（工作流画布、图像生成、多素材画廊、技能市场等全都不存在）；
4. Agent 在工作树里无法对改动的前端插件进行真实页面操作与截图，被迫形式主义交差或抱怨工具链缺失。

### 1.2 改造目标
1. **自动装配 profile omnimux 运行骨架**：
   - 当启动测试环境时，若本地存在预热好的 Dev 环境模版（`~/.omnimux-dev/profiles/omnimux`），自动将其安全复用进隔离的私有 `DSH_HOME/profiles/omnimux`；
   - 零网络开销、秒级挂载、彻底杜绝离线装包死锁与包版本冲突；
2. **应用以 `--profile omnimux` 正式启动**：
   - 启动时装载全量 OmniMux 插件清单；
   - 将 `taskPluginsInstalled` 翻转为 `true`，`evidenceLevel` 升级为 `full`；
3. **扩展应用级真实验收断言**：
   - `scripts/worktree-app-qa.mjs` 增加对插件挂载有效性的真实验证，确认 OmniMux 插件已成功注入页面；
4. **保持自清理与防污染铁律**：
   - 测试结束后完整释放进程、端口并销毁私有目录，绝不污染全局开发版与生产版。
