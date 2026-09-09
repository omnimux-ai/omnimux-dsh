# #837 独立返修复验报告

## 结论

**源码 E1 与本地包回归 PASS；完整验收 BLOCKED，不可合入或 Dev 物化。**

- 固定 base：`867b192ecf6aa35be4e1639db7351a89bea782c7`；head：`11f8655858feb57373fa7649dc9b7cce07deca24`。2026-09-09 本轮开始树干净，未 fetch/commit/push/merge。
- 路由：**QA → NoOne（测试缺陷已修、本地回归通过）；L2 依赖 → Engineer/主理人**。没有发现需返修的 #837 源码新缺陷；NoOne 仅限本地测试，不表示完整放行。
- 用户已有此次 L2 初始化授权，正式入口已复制现有开发 credentials/settings 到任务私有 home；没有泄露内容、真实付费、模型调用或真实资产 root 变更。

## 独立检查与两轮控制

| 检查 | 结果 | 证据 |
|---|---|---|
| E1 代码检查 | document keydown 覆盖挂载生命周期；Escape 清 pending timer 并隐藏；卸载清理，不阻断热键传播 | StorageSettingsButton.jsx:24–36 |
| 第一轮：原定向35项 + package5项 | 40 tests / 39 pass / 1 fail；新增包清单断言误比较递归遍历序与全路径序，QA 自修两侧排序 | qa-reverify-round1.log |
| 第二轮：完整 assets test script | **354 tests / 354 pass / 0 fail / 0 skipped**，exit 0；含未修改的独立 pending Escape 用例 | qa-reverify-round2-package.log |
| Stage 合同 | **10 Stage / 8 sidebar PASS** | qa-reverify-stages.log |
| 当前包源码核验 | **54 当前源码/入口文件一致、3373归档成员、排除规则 PASS** | qa-reverify-current-package.json |
| git diff --check | PASS | 本轮执行 |
| 正式 L2 start | exit 1：初始化成功，Host 导入 viewer 失败 | qa-reverify-l2-start.log |
| 正式 verify:live | exit 1：缺 `.l2-dev.env`，尚未创建/消费浏览器请求 | qa-reverify-live-preflight.log |

覆盖率未测量；各命令用例重叠，不相加。两轮结束，不进入第三轮。

## 测试缺陷与安全检查保留

`plugins/omnimux-assets/src/final-package-qa.test.js` 的 QA-PKG01 同时要求历史包固定身份及当前源码身份，源码变更后两者不可兼得。本轮仅将固定历史压缩大小/hash、成员数和解包大小改为核验当前 `.final-pack.json` receipt：实际 tgz 的 size、SHA-1、SHA-512 SRI、entryCount、unpackedSize，以及逐文件 path/size/mode。仍保留独立 tar 安全路径/重复成员、缓存与测试排除、实际包源码字节匹配及供应 payload 不变检查。receipt 证明当前打包一致性，不冒充第三方签名或历史发布身份。

缺失 inventory **没有用 production integrity 生成**：从本仓 `.worktrees/assets-storage-766/plugins/omnimux-assets/runtime/evidence/` 只读取得原始独立清单，先校验既有测试固定 SHA，再复制到本任务 ignored runtime/evidence，复制后重新核验：

- arm64：`42bd4322a4dc4c541fed79ed5b50e7975642b110d1c53531a51e075dc78cd3b4`，1809项。
- x64：`3cca72f9afc999a5544ef7547025f3e1229a315c94418b7665fc60739703d767`，1805项。

两个独立清单与 production integrity 语义相同但文件字节/hash不同，未冒充来源。QA-PKG02/03 原固定指纹、全 payload bytes/modes/links、架构、112 notices和供应脚本指纹断言完全保留；QA-PKG04 中文迁址/no-PATH/7 tools/HTTP/重启也通过。证据清单属测试夹具，未进入发布包；未来新工作树仍需提供这些有来源的 fixture，不应静默绕过。

当前包未重打：`plugins/omnimux-assets/omnimux-assets-0.2.0.tgz`，48,587,949 B，SHA-256 `4038e8426c7fc30a44ceffc7c28e41d38d132de8cb348e8ed574b4ac8f81ba3c`。

## L2 真实阻碍

正式命令：

```sh
bash scripts/dev-env.sh start assets-settings-tooltip-837 omnimux-assets --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-settings-tooltip-837
```

先核实 seed viewer 已为 `file:.materialize-snapshots/plugins/@crosery/dsh-viewer`，有锁、现有 credentials/settings seed、尚无 #837 task home。只读核实 viewer lib 第3行导入 `installSettingsSection, settingsNamespace`；Host settings 模块实际仅导出 `SettingsConflictError, SettingsProvider, default, redactSecrets`，两者不兼容。

- Seed：`/Users/x/.omnimux-dev/profiles/omnimux`；viewer 0.1.0 lib SHA-256 `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`。
- Host 安装锚点：`/Users/x/Desktop/Project/Github/deepseek-harness/apps/cli/package.json`；正式 CLI→web-app→ui-chat 与受管源预检通过，但预检没有覆盖 viewer 的导出兼容性。
- Task home：`/Users/x/.dsh-dev/tasks/assets-settings-tooltip-837`。
- Profile：`/Users/x/.dsh-dev/tasks/assets-settings-tooltip-837/profiles/omnimux-dev-assets-settings-tooltip-837`。
- 正式 pnpm 11.7.0 安装1822包，分配44201，assets link 精确指向本工作树。Host PID记录98774，核实已退出；lsof确认44201无监听，无 watcher启动、无 `.l2-dev.env`。
- 当前 task `host.log` 实际错误：`failed to import loader entry viewer (@crosery/dsh-viewer): The requested module '@deepseek-ai/dsh-settings' does not provide an export named 'installSettingsSection'`。
- 仅一次正式启动，无删除viewer、替换Host、改官方/kit/外仓、共享App强杀或 seed重写。
- `verify:live` run ID：`65223c6d-35af-4542-b588-8e279740344d`；`.workbuddy/evidence/live-qa/65223c6d-35af-4542-b588-8e279740344d/live-qa-report.json` 是身份前检失败，不是 runtimeProof。
- ego-browser `listTaskSpaces` 实际可用，只有其他任务73/76，未接管。Host不可用，未创建无效任务Tab或执行认证导航，不以旧Dev截图替代。

## 未执行验收矩阵

以下全部 **NOT RUN / L2 BLOCKED**：桌面/窄屏 × zh/en × light/dark八组合；body portal、中心误差≤1CSS px/8px间隔、32px按钮/16px图标；侧栏展开折叠/resize/scroll；Tab focus ring、Enter/Space、pending及visible Escape、Dialog关闭与重入；搜索/类型/排序/视图切换/工具栏单行。缺当前唯一 task/Tab/URL/PNG/runtimeProof/SHA运行绑定。Electron不适用（无壳平台专属变更）。

## 下一步与责任

主理人/依赖工程负责人先提供经正式纳管、与现有Host兼容的 viewer seed及证据；本任务不修外部仓或删除viewer。seed更新后按正式生命周期刷新本任务依赖，不能直接 start 复用旧 node_modules 误称更新，再绑定准确SHA启动并派独立ego+verify:live专项矩阵。当前没有后台运行工作、没有计划唤醒工具可用；本报告回传主理人接续依赖协调，不承诺自动重试。前序初始化授权继续有效，不需重复索要。
