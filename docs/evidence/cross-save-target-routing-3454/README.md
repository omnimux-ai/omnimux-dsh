# #3454 保存分流：隔离工作树验收证据

- 任务：Issue #3454（worktree `cross-save-target-routing`，分支 `agent/cross-save-target-routing-issue-3454`）
- 时间：2026-10-20
- 运行环境：本任务隔离 worktree，headless Chrome（动态端口），无共享 Dev 状态

## 真实浏览器验收（worktree Web QA runner）

命令（worktree 根目录）：

```
node scripts/worktree-web-qa.mjs inspiration
```

结果：

```
▶ 正在验收 inspiration ... ✅ PASS (1.74s, 端口: 62455, 截图: 1280x713)
📋 验收汇总: 1/1 项通过。
```

- 截图：`inspiration.png`（1280x713，真实浏览器内核渲染并做 PNG 解码校验）
- 结构化报告：`worktree-qa-report.json`（7 项断言全 pass，runId 见文件）
- 证据边界（如实说明）：该 runner 是最小 Stage 夹具，证明的是「本任务的 `omnimux-inspiration` 客户端 bundle 能在真实浏览器中构建、加载并渲染 Stage 外壳」；它**不**装载带抖音/小红书账号数据的完整 App，也不覆盖保存按钮/账号卡片的数据路径。账号监控平台标识、平台筛选、终态原因由下面的单测断言覆盖；Dev 45120 真机验收属人工职责。

## 自动化检查（真实计数）

宿主插件 `plugins/omnimux-inspiration`：

```
node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js
# tests 1653 / suites 335 / pass 1653 / fail 0 / deny-network 0 outbound
```

扩展 `plugins/omnimux-browser/extension`：

```
npx vitest run
# Test Files 139 passed (139) / Tests 1491 passed | 1 expected fail (1492)
```

扩展构建与类型检查：

```
node scripts/build.mjs          # ✓ built in 510ms（dist/ 为本地构建产物，不入库）
npx tsc -p tsconfig.json --noEmit   # 仓库存在既有无关报错；本任务新增/修改文件无新增错误
```

Stage / UI 契约：

```
node scripts/verify-stage-contracts.mjs   # PASS: 14 Stage components; 8 registered sidebar targets
node --test scripts/verify-anti-slop.test.mjs   # 3 pass / 0 fail
```

## 覆盖到的功能断言（非浏览器）

- 6 平台（x/tiktok/youtube/instagram/douyin/xiaohongshu）主页 → account、作品/短链 → content（`rival-parsers.test.js`、`url-normalizer.test.js`）
- classify 路由 → POST 账号导入 → 抖音/小红书账号落成 `error / platform-unsupported / next_auto_refresh_at=null`，且 `cloud.calls=0`、tick 不再 due（`rival-routes.test.js`、`rival-refresh.test.js`、`rival-accounts-service.test.js`）
- 平台标识（抖音/小红书手绘 path）、未知平台不退化为 X、筛选「全部」首位（`rival-platforms.test.js`）
- 扩展分流纯函数、后台先分类再分流、按钮/成功态/toast 文案 zh/en、失败不冒充成功、UID 平台 toast 不拼 `@uid`（`save-target-routing.spec.ts`、`save-inspiration-rpc.spec.ts`）

## 未覆盖 / 已知限制

- 未在真实 host + 真实浏览器里端到端演练「TikTok 主页点保存 → 账号监控出现账号」（本机 host 属共享 Dev，真机验收归人工）；由 host 路由测试与扩展契约测试分别覆盖两端。
- 抖音/小红书账号导入仍会按既有「一次刷新周期」预扣 2 次采集额度（`runCycle` 守卫 `callsUsed=0`、云端 0 调用），预算路径本任务未调整。
