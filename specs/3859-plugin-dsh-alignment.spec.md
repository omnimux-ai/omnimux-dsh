# 3859 plugin dsh alignment

## 背景
21 个插件 verify:plugin-load 全过，但 peer 声明混乱：4 个插件（viewer/market/intercept/studio）混着 0.1.x 旧版本号，omnimux-browser 源码注释假设 dsh 0.1.5 的 Gateway wireStream / agent 事件契约。

## 假设
- viewer/market/intercept/studio 的 peer 里 `0.1.x` 旧引用只是历史残留，源码本身不依赖这些版本；统一成 `>=0.2.1-rc.3 <0.3.0` 后 plugin-load 仍全过
- omnimux-browser 在 rc.3 pin 下能跑，但注释里的 `dsh 0.1.5 Gateway wireStream` 假设在 rc.5 已有偏差；按 rc.3→rc.5 diff 核对（wireStream/follow 零变更）适配层行为等价，仅需清理版本注释
- 统一 peer 只动 package.json，无功能变化；browser 适配只动注释/错误文案，不改插件对外行为
- **新增**：`omnimux-analytics`/`omnimux-market` 监听已删除的 `agent/session-start`（rc.3/rc.5 均无此事件）是死代码；迁移到 `agent/created`（载荷 `{ agent, source: string, signal }` 完全兼容）后功能恢复

## 证伪方式
- `pnpm verify:plugin-load` 21/21 全过；改动插件逐一 `pnpm --filter <pkg> test` 通过
- `rg agent/session-start` 在仓库插件源码里零命中；analytics/market 改用 `agent/created` 后 `sessionIdFromExec(agent)` 仍拿到同一个 `agent.session` 对象
- browser 源码里不再有 `0.1.5` 旧版本假设注释（rc.3+ wireStream 契约为准）；`installSettingsSection`/`settingsNamespace` 注释保留为历史叙述但标注 rc.3 已移除
- `node scripts/impact-matrix.mjs --git-diff --base origin/main` 的 browser.required 若命中则补 worktree web 证据

## 验收
- P1 四个插件 peer 统一为 `>=0.1.0-rc.6 || >=0.2.1-rc.3 <0.3.0-0`（与其他 12 个插件一致）
- browser 适配层按 rc.5 diff 校对，旧版本假设注释清理；功能等价
- verify:plugin-load 全绿

## 新用户基线
本任务只改 `package.json` 版本声明和 `omnimux-browser/src/index.ts` 宿主适配注释/契约检查，不新增运行时依赖、不引入本地端口/路径/凭据假设。新装用户与现状一致：插件依旧通过 cordis inject 拿到 `typertGateway`/`connection` 服务，拿不到时报同样的初始化错误；无需用户额外配置。
