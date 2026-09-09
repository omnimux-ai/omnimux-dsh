# H3 #838 已授权 L2 初始化与运行验收

日期：2026-09-09 11:35–11:37 Asia/Shanghai；QA：Edward。

## 结论与 Routing

**初始化完成；Host 启动失败；运行验收 BLOCKED。** 当前阻塞不再是凭据 bootstrap 授权，而是已受管 viewer 与官方 Host API 不兼容。源码第二轮 PASS 沿用 `REPORT-round2.md`，本次是用户追加授权后的环境验收，不新增第三轮源码测试。Routing：主理人协调 #839 正式兼容制品交付，QA 在依赖满足后接续。不能关闭整体任务或标记合并放行。

## 固定身份

| 项目 | 实际值 |
|---|---|
| Plugin 任务树 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/h3-contract-fixes-838` |
| Plugin HEAD | `72b30196691b9e40439fe08b6c0674191d37e2f2` |
| Gateway 任务树 | `/Users/x/Desktop/Project/OmniMux/.worktrees/h3-contract-fixes-192` |
| Gateway HEAD | `6341b07b55569dbe90ec0dceff8b4525b199f7cc`；实查干净 |
| 新任务身份 | `h3-838-l2`，不是旧 `h3-qa` |
| DSH_HOME | `/Users/x/.dsh-dev/tasks/h3-838-l2` |
| PROFILE_DIR | `/Users/x/.dsh-dev/tasks/h3-838-l2/profiles/omnimux-dev-h3-838-l2` |
| SOURCE | Plugin 任务树的 `plugins/` |
| 唯一在研 link | `node_modules/omnimux` → 本任务 `plugins/omnimux` |
| 稳定 seed | `/Users/x/.omnimux-dev/profiles/omnimux` |
| 官方 DSH_SRC | `/Users/x/Desktop/Project/Github/deepseek-harness` |
| 官方 DSH_SRC HEAD | `dd6322d604e00eec1ba5e0c8541159906a21094a`；只读消费，没有改 pin 或官方文件 |
| 分配端口 | `44201`，预期 URL `http://127.0.0.1:44201/`；**未实际监听** |
| Host PID | `6991`；取证时已不存在 |
| watch | 未生成 watch.pid，未启动 |
| .l2-dev.env | 不存在；无成功运行绑定，不手写伪造 |

## 实际正式入口与结果

从 `/Users/x/Desktop/Project/omnimux-desktop-fork` 执行一次：

```sh
OMNIMUX_PRODUCT_DIR=<Plugin任务树> \
OMNIMUX_PLUGINS_DIR=<Plugin任务树>/plugins \
OMNIMUX_L2_SEED_PROFILE=/Users/x/.omnimux-dev/profiles/omnimux \
DSH_DEV_HOME=/Users/x/.dsh-dev OMNIMUX_DEV_LEGACY_HOME=0 \
DSH_SRC=/Users/x/Desktop/Project/Github/deepseek-harness \
yarn omnimux:dev start h3-838-l2 omnimux --source=<Plugin任务树>
```

正式链为 `scripts/omnimux.mjs dev` → 当前任务树 `scripts/dev-env.sh`，不是主树双 link，也未调用 #839 未交付脚本。

- 启动时间：`2026-09-09T11:35:02.306501+08:00`；结束 `11:35:57.529405+08:00`；**exit 1**。
- 正式入口完成 credentials/settings 任务副本、官方 CLI→web-app→ui-chat 闭包检查、受管 snapshot 克隆及 pnpm 私有 node_modules 安装；未出现 pnpm 失败或未受管 seed 拒绝。
- 任务 `.credentials.yaml` 为非 symlink 的普通文件、权限 `0600`。源路径为 `/Users/x/.dsh-dev/.credentials.yaml`，由正式函数复制。启动后任务文件与源字节不等；未输出内容或秘密哈希，不把后验相等当作复制成立依据。复制成立来自正式入口成功标记；没有人工改写源凭据。
- `node_modules` 顶层指向工作区的 link 实查只有 Hub 一项；其他制品通过正式克隆/安装建立，没有追加 workflow 主树 link。
- 正式入口报告 Host 20s 内未监听并 exit1。完整 `host.log` 的内存分类检出 `SyntaxError`、`does not provide an export named 'installSettingsSection'`，同时引用 `@crosery/dsh-viewer` 和 `@deepseek-ai/dsh-settings`；没有 `ERR_MODULE_NOT_FOUND`，没有正式 `dsh web:` 登录入口。
- `kill(pid, 0)` 实查进程不存在；`lsof -nP -iTCP:44201 -sTCP:LISTEN` 非0、无监听。启动失败后没有重启。
- 启动 stdout/stderr 只在内存采集，不保存原始尾日志、token 或登录链接。`l2-authorized-start.json` 是字段白名单摘要；其中 `viewerSettingsImportFailure=false` **仅表示入口打印的尾部没有该字符串**，并非完整 Host 日志没有错误。完整日志结构化复核确认上述缺失导出。

## viewer 受管 receipt 与兼容边界

当前 seed 存在一份已提交的旧受管事务，不是“没有 receipt”：

- journal：`/Users/x/.omnimux-dev/profiles/omnimux/.materialize-transactions/18dd9c91-5389-4370-9c3e-281d6a2a96bd/journal.json`。
- id：`18dd9c91-5389-4370-9c3e-281d6a2a96bd`；phase：`COMMITTED`；name：`@crosery/dsh-viewer`；version：`0.1.0`。
- request tarball SHA256：`7786848ddbabca4cc2dc05dc0bdb3d2cdef99b16b2fd195764a542c30d6a4907`。
- afterDigest：`30c831e102da5e31ced561e3de7872cab317924a2aa159148b85e53fbef2c5c6`。
- seed manifest 依赖为 `file:.materialize-snapshots/plugins/@crosery/dsh-viewer`。
- seed source、seed installed、任务 source、任务 installed 的 `lib/index.js` 四者 SHA256 全为 `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`，均包含旧 `installSettingsSection` 引用。

该 COMMITTED 证明旧制品的磁盘纳管，不证明 API 兼容；本次真实 Host 失败直接证明当前可消费制品仍未满足兼容依赖。没有修改 #839 任务、共享 seed、公共 Dev/Prod、官方 DSH；没有消费其他会话未交付的转换实现。

## 未运行项目及证据限度

| 验收 | 状态 / 原因 |
|---|---|
| ego-browser 页面 / 同 Tab 登录 | BLOCKED：Host 已退出且无正式登录入口；未创建新浏览器任务，无截图或 DOM |
| 共享 verify:live | NOT RUN：.l2-dev.env 缺失且 Host 不可用；没有在相同已知缺口下重复旧失败探针，没有 request/runId/runtimeProof |
| H3 Max / Turbo 双模型目录 | 运行专项 NOT RUN；离线证据见第二轮报告，不替代当前 UI |
| 768p / 旧720p提示 | 运行专项 NOT RUN，同上 |
| 首帧 / 有序参考参数展示 | 运行专项 NOT RUN，同上 |
| 真实生成、付费、网关生产调用 | 未执行；没有把 mock 当作出片 |

## 下一步、owner 与收尾状态

1. **#839 owner / 主理人**：交付当前官方底座兼容的 viewer 正式受管制品及可消费目标 receipt，核实 source/installed 内容身份。旧 COMMITTED 及单测通过均不能替代该证据。
2. **主理人 / QA**：依赖真实满足后，通过正式入口刷新或重建这个任务的稳定依赖；既有 `start` 不会自动刷新已有 node_modules，因此不能仅盲目 restart。先确认正式刷新流程和仍然唯一的任务 Hub link，不手改 node_modules，不引入第二 link。
3. **QA**：重新核验 Host、port、SOURCE/HEAD 与有效 `.l2-dev.env`，再用同任务 ego-browser 和共享 verify:live 完成无付费双模型目录、768p、首帧/参考参数验收。既有初始化授权保持有效，不重复询问。

任务 profile 保留供恢复，失败原始日志仅留任务 profile，不复制到仓库。旧 `h3-qa` 未动。所有后台作业已收集（bash-132 exit1）；没有常驻 Host/watch 或待收集 job。当前工具集没有可用原生定时续查工具，未创建或声称存在自动等待；外部依赖由主理人协调接续。当前无 `report` 工具，通过本文件及最终结构化消息回传。

本次未改产品源码、测试预期、网关源码，无 commit/push/merge。任务 HEAD 不变，`git diff --check` exit0；仅新增本报告和脱敏启动摘要，原 REPORT-round2.md 保持不变。
