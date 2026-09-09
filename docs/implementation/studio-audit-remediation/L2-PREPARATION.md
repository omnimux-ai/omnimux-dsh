# Studio 隔离 L2 准备

## 状态与边界

本次只在任务树准备依赖和启动说明，没有启动 Host，没有建立 profile，没有读取或复制凭据。源码开发依赖 frozen install 已闭合，真实 Host 与浏览器验收未通过。

任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/studio-audit-remediation`。正式入口为本树 `scripts/dev-env.sh`，不得用自建服务器、私有 harness 或 HTML 注入冒充 L2。

## 启动前置

1. 验收责任人核对最终 Git HEAD 和 clean 状态。在 `plugins/omnimux-studio` 执行 README 中 frozen install、test、build。
2. 检查官方 `DSH_SRC` 已有完整 CLI/web-app/ui-chat 安装闭包，只读使用，不修改或重建官方仓。检查稳定 seed 中 locale/ui-primitives 0.1.2-rc.1、betterSidebar 0.18.0 的兼容装配和受管 snapshot/lock。
3. 当前 `scripts/dev-env.sh:521-537,678` 的 start 会自动尝试复制 Dev credentials。这超出本轮“只在任务树写入、缺凭据只报告不取密钥”的授权，因此本轮未执行 start。不要把更换 DEV_HOME 或伪造 profile 当作绕过方式。由主理人安排满足此边界的正式无凭据启动能力或取得明确 L2 初始化授权。
4. 获准后使用 `bash scripts/dev-env.sh start studio-audit-remediation omnimux-studio --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/studio-audit-remediation`。由入口分配 44201–44299 端口，最多一个在研链接；profile 必须属于 `~/.dsh-dev/tasks/studio-audit-remediation`，不写共享 Dev/Prod。
5. 核对 `.l2-dev.env` 的 SOURCE、COMMIT、PROFILE_DIR、URL、PORT，记录 Host PID/启动时间。使用 ego-browser 与 `scripts/ego-live-qa.mjs` 的正式 openL2EgoPage/共享 verify:live 路径，不保存 token。Studio 是 betterSidebar Tab，当前静态 Stage 清单的8个 targets不是 Studio live覆盖，独立QA需核实共享探针对该Tab的正式可用覆盖，不改门禁以跳过。

## 必须补的真实 UI 证据

320/768/1200 面板宽度下参数单行、模型菜单不被水平滚动裁切；亮/暗宿主样式不变；两 cwd × 两 session 与 repoRoot 切换隔离；十轮重载无重复Tab；Agent详情同草稿；IME/粘贴/两次退格/灯箱焦点；样例ready/error与Mock下载语义。未取得这些证据之前整体 IS_PASS 为 NO。
