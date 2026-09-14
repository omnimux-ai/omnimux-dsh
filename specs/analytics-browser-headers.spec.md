# omnimux-analytics 埋点补齐浏览器 User-Agent 与请求头

Issue: #1674 · Track B · 插件：`omnimux-analytics` · 风险初判 R2

## 1. 目标

解决 `omnimux-analytics` 宿主侧上报请求虽然收到 `HTTP 200 {"beep":"boop"}` 但在 Umami 后台与数据库中被静默丢弃、导致事件计数始终为 0 的问题。
在 `queue.js` 中补齐标准的浏览器 `User-Agent` 以及官方脚本所带的 `x-umami-website-id`、`x-umami-hostname` 请求头，使事件被 Umami 服务端真正入账。

## 2. 验收标准（可观察）

| # | 标准 | 判定方式 |
| --- | --- | --- |
| A1 | 上报请求携带标准浏览器 User-Agent | `buildRequest` 生成的 `request.headers` 包含标准的桌面 Chrome/macOS `user-agent`（或通过配置项覆盖），`defaultSend` 发起 fetch 时携带该头 |
| A2 | 上报请求携带 x-umami-* 头 | `request.headers` 包含 `x-umami-website-id` 与 `x-umami-hostname` |
| A3 | 单元测试全绿 | `pnpm --filter omnimux-analytics test` 100% 通过（断言请求头包含 User-Agent 与 x-umami 头部） |
| A4 | 契约自检脚本同步 | `scripts/contract-probe.mjs` 测试真实包含请求头，运行输出 `CONTRACT OK` |
| A5 | 真实上报可落库入账 | 向独立站点 `dee7cef3-7da5-4a5b-8cc2-6381418d0303` 发送真实事件，Umami API 查询事件计数增加 |
| A6 | 隔离工作树 Web QA 验证通过 | `node scripts/worktree-web-qa.mjs analytics` 通过（无报错，渲染几何为正，截图归档） |

## 3. 命令

```sh
# 单测
pnpm --filter omnimux-analytics test

# 契约自检（联网）
node plugins/omnimux-analytics/scripts/contract-probe.mjs

# 隔离工作树浏览器验证
node scripts/worktree-web-qa.mjs analytics
```

## 4. 结构

| 路径 | 作用 |
| --- | --- |
| `plugins/omnimux-analytics/src/queue.js` | 增加 `DEFAULT_USER_AGENT` 常量，`buildRequest` 中附带 `headers`，`defaultSend` 中使用 `headers` |
| `plugins/omnimux-analytics/src/queue.test.js` | 断言请求头结构 |
| `plugins/omnimux-analytics/scripts/contract-probe.mjs` | 同步使用 `request.headers` 发起请求 |

## 5. 隐私与安全边界

- `User-Agent` 使用固定通用的标准桌面浏览器标识（macOS Chrome），不提取用户宿主机器敏感硬件信息或指纹。
- 不泄露任何 prompt、arguments 或输出内容。
- 仅修改插件自身代码，不触碰桌面壳仓库。
