# Issue #2055 · 宿主机抓图 fake-IP 修复 · 验证证据

工具链：`node tmp/media-fetch-fakeip-probe.mts`、`node tmp/adversarial-verify.mts`、`plugins/omnimux-browser` 测试套件。
本机环境：DNS 由透明代理接管（`/etc/resolver` → `198.18.0.2`，Surge 增强模式 fake-IP），所有公网域名解析为 `198.18.x.x`。

## 1. 修复前后（同一台机器、同一地址）

| URL | 修复前 | 修复后 |
| --- | --- | --- |
| `https://www.baidu.com/img/flexible/logo/pc/result.png` | `bad-request` | `ok` / `image/png` / 6617 B / 魔数 `89504e47` |
| `https://pbs.twimg.com/media/GFx1234abcd.jpg`（不存在） | `bad-request` | `http-error` 404（真实 CDN 应答，证明请求已出网） |

同地址不经守卫的直连对照：`200 image/png 6617 bytes`（系统解析 303ms；把 fake 地址钉给 socket 并保留 Host/SNI 238ms）。
即：链路健康，修复前唯一的阻塞点就是「解析答案落在 `198.18.0.0/15` 被判为非公网地址」。

原始记录：`docs/evidence/browser-media-fetch-fakeip-before.json`、`docs/evidence/browser-media-fetch-fakeip-after.json`。

## 2. 对抗性验证（35 项全通过，脚本 `tmp/adversarial-verify.mts`）

| 攻击面 | 用例 | 结果 |
| --- | --- | --- |
| URL 层语义漂移 | 旧实现 vs 新实现逐值对比 35 个地址（含空串、非地址、`[::1]`、大小写、`172.32.0.1` 等边界） | 全部一致 |
| 解析答案指向本机 | `127.0.0.1` `127.0.0.2` `10.0.0.1` `172.16.0.1` `192.168.1.1` `169.254.169.254` `100.64.0.1` `0.0.0.0` `224.0.0.1` `255.255.255.255` `::1` `fd00::1` `fe80::1` `::ffff:127.0.0.1` | 全部拒绝，回调空数组 |
| 混合解析 | 公网 + 私网；fake 地址 + 云元数据 `169.254.169.254` | 整体拒绝 |
| 面板指名 URL | `127.0.0.1:1` / `127.1.2.3` / `198.18.0.1` / `[::1]` / `localhost` / `router.local` / `svc.internal` / 云元数据地址 / `file:` / `data:` / `blob:` / 带用户名密码 | 全部 `bad-request` |
| 重定向逃逸 | 公网 302 → `127.0.0.1`；公网 302 → `198.18.0.1` | 逐跳校验仍拦截，`bad-request` |
| 修复目标 | 公网域名 + fake 解析答案 | 成功取回字节；真实公网图片 6617 B PNG |
| 两层判定不对称 | `198.18.0.1` `198.18.35.226` `203.0.113.1` `2001:db8::1` | URL 层拒绝 / 解析答案层放行（仅在保留段） |

原始记录：`docs/evidence/browser-media-fetch-fakeip-adversarial.txt`。

## 3. 自动化测试

| 命令 | 结果 |
| --- | --- |
| `./node_modules/.bin/vitest run tests/public-media-transport.spec.ts tests/public-media-request.spec.ts tests/media-fetch.spec.ts` | 74 passed（0 failed） |
| `./node_modules/.bin/vitest run`（omnimux-browser 全包） | 198 passed；3 个文件 0 test 收集失败（`composition.spec.ts`、`session-purge.spec.ts`、`e2e/bridge-extension.e2e.spec.ts`，缺 `@deepseek-ai/*` 依赖，主检出同样失败） |
| `./node_modules/.bin/tsc -p tsconfig.json --noEmit` | 无错误 |
| 扩展包 `extension` 全量 `vitest run` | 主检出 20 failed / 1134 passed；工作树 19 failed / 1135 passed —— 均为既有环境问题（工作树缺 `.agent-reports/` 基线夹具等），本任务未触碰任何扩展源码 |

## 4. 未覆盖 / 残余风险

- IPv6 ULA 形式的代理假地址（如 sing-box 默认 `fdfe:dcba:9876::/96`）仍被拒；现网无实测证据，未做投机放行。
- 真实浏览器内的完整点击链路（页面点亮 → 后台端口 → 桥 → 宿主）由既有扩展测试覆盖，本次未在真实 Chromium 内重放；本机 `<PROXY>` 环境下的端到端证据是宿主侧真实网络抓图。
- 未验证其他代理软件（非 Surge）的 fake-IP 段是否都在已放行范围内。
