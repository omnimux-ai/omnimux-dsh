# H3 六项修复工程报告（待独立 QA）

## 固定范围

- 插件树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/h3-contract-fixes-838`
- 插件 base：`867b192ecf6aa35be4e1639db7351a89bea782c7`；代码 HEAD：`c92cf777deaf0b17e70acd5fd780f1df733aa6df`。
- 网关树：`/Users/x/Desktop/Project/OmniMux/.worktrees/h3-contract-fixes-192`
- 网关 base：`795039a95dc2d4332360b1061141a20a93194e87`；代码 HEAD：`1a739a659c5ef8fa929adb25257463299f73e6fb`。
- 两个 base 为任务开始 fetch origin/main 后创建的仓内隔离树。保留主树无关脏文件。只本地提交，无 push/merge/部署、真实模型调用、真实账务、凭据初始化、共享 profile、viewer 或官方 DSH 写入。
- Issue：omnimux-ai/omnimux-dsh#838 依赖 laozhong86/OmniMux#192；不以 Issue 关闭代替验收。

## 六项对应

| 缺陷 | 实现 | 工程证据 |
| --- | --- | --- |
| P1 GET 抢占 polling CAS | `relay/relay_task.go` 的实时读取仅更新响应快照，不持久化终态；polling 保持账务唯一所有权 | `relay_task_realtime_test.go` 真 SQLite + 实际 GET/poll 函数，成功/失败 × 两种先后顺序；重复 stale worker 无重复退款 |
| P1 canonical 媒体丢失 | `media_inputs.go` 有序归一与模式校验，`model_mapping.go` canonical operation 优先；冲突/错误角色/不支持模式拒绝 | `contract_regression_test.go` 有效最终本地 HTTP 请求及无效不发送；`cross_repo_test.go` 实际 Hub→Adaptor 三组最终 URL/完整 body |
| P1 COMPLETED 空产物成功 | `polling.go` 无视频完成回 IN_PROGRESS，等待实际产物 | result 空、404、429、503、断网及有效视频测试 |
| P2 reference DTO 字段 | `dto.go` 与 `payload.go` 使用三类 reference URL 数组；首帧用 image_url | 保序双图双视频 body 断言，不截断为单项 |
| P2 detail 数组吞错 | `polling_http.go` 解析 msg/loc/type，确定性4xx失败、暂态重试 | 422 detail数组保留原因；401失败；429/5xx不误判成功 |
| P2 720p/7000错误声明 | `video-models.yaml` 768p/50000；`guard.js` 旧720p明确要求重新选择 | Hub专项5/5；严格离线模型门禁通过 |

另外 #831 测试实际调用 `pollOpenAiMediaTask`，succeeded 返回产物、failure 抛 omnimux-failed，均只发一次 fetch。

## 文件

插件：`plugins/omnimux/src/catalog/contract/submit-guard/{guard.js,h3-contract.test.js}`、`plugins/omnimux/src/catalog/specs/video-models.yaml`、`scripts/h3-cross-repo-fixtures.mjs`、`docs/references/fal-h3-contract.md`。
网关：`FORK_CUSTOMIZATIONS.md`、`relay/{relay_task.go,relay_task_realtime_test.go}`、`relay/channel/task/fal/{dto.go,payload.go,model_mapping.go,media_inputs.go,polling.go,polling_http.go,adaptor_test.go,integration_test.go,contract_regression_test.go,cross_repo_test.go}`。

## 实际命令和结果

插件树：
- `npm --prefix plugins/omnimux test`：1360/1360 PASS（修正一次无关模型误替换前运行；该误替换随后恢复，专项与模型门禁再次通过）。
- `node --test plugins/omnimux/src/catalog/contract/submit-guard/h3-contract.test.js`：最终5/5 PASS。
- `node --test scripts/verify-auto-serving.test.mjs`：10/10 PASS。
- `node scripts/verify-model-contracts.mjs --strict`：PASS，最终 fingerprint `00922927356fb263`；18 registered/16 required，0 error/0 warning。
- `node scripts/verify-plugin-boundaries.mjs`：2209源文件 PASS。
- `node scripts/registry-tool.mjs verify`：FAIL，隔离树缺少 `plugins/omnimux-workflow/dist/index.js`，未写占位入口。
- `pnpm verify:model-contracts`：pnpm依赖预检查尝试install后报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；不对共享node_modules执行强制清理，改为直接执行相同package脚本得到上述离线门禁结果。

网关树：
- `OMNIMUX_DSH_FIXTURE_ROOT=<插件树> GOPROXY=off GOSUMDB=off go test ./relay/channel/task/fal ./relay -count=1`：最终PASS，实际跨仓fixture已启用（不属于跳过结果）。
- `GOPROXY=off GOSUMDB=off go test ./service ./model ./relay/... -count=1`：相关全包PASS（之后polling增加错误优先、删除重复路由，再重跑fal/relay PASS）。
- `GOPROXY=off GOSUMDB=off go build ./... && GOPROXY=off GOSUMDB=off make test`：build FAIL `main.go:42:12: pattern web/dist: no matching files found`；make未运行。不冒充全仓build通过。
- 两树 `git diff --check`：PASS；网关本地提交core-change gate与Caddy模板gate通过，含明确用户授权scope trailer。

## 全局检查与限制

IS_PASS: YES（本次源码跨文件一致性与定向离线工程回归；不是完整发布门禁或独立QA PASS）。

媒体三类共用严格校验后的DTO，未为每个端点另建重复Go struct；endpoint决定允许字段，完整JSON断言保证引用与首帧互斥。保留已有9图3视频，体积30/50MB与MIME并未核实为官方限制，改标产品policy；不因其缺证删除已确认数量支持。公网文档依据及产品子集见 `../references/fal-h3-contract.md`。本轮未增加音频UI或Turbo参考能力。

GET/poll为两种确定性顺序与重复worker验证，不是并发压力或race证明。跨仓fixture覆盖3个有效Hub请求及Hub拒绝2个非法请求；更多非法请求/no-send由gateway边界用例覆盖。没有真实供应/生成验收。

## 独立 QA 下一步（主理人派发）

1. 固定两树代码SHA复读diff，独立复测六项与#831，不沿用旧评审手写PASS。
2. 设置 `OMNIMUX_DSH_FIXTURE_ROOT` 后运行上述跨仓Go测试；未设变量会Skip，不可称跨仓PASS。
3. 通过正式本地构建入口补齐任务树web/workflow构建产物后重跑全仓build/registry门禁；不使用占位文件绕过。
4. 使用正式隔离L2、至多一个plugin link和共享verify:live+ego-browser，核对768p与旧值提示、多图多视频请求内容和失败回显。历史44204双主树link不构成证据。正式依赖不满足则单列BLOCKED，不改共享profile或viewer绕过。
5. 本工程未派发QA、未发布；独立QA、L2及完整构建前不具备合并/关闭验收条件。
