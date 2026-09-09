# Studio QA 返修报告

## 结论与边界

源码修复已完成，工程一致性检查 IS_PASS: YES；可交独立 QA，整体运行验收仍 BLOCKED，不可合并放行。

修复基线：`b62414c6785f85155798e94c5b48378da7e3466b`。仅修改任务工作树的 Studio 前端、必要共享探针及测试/证据；未修改官方 DSH、外部 kit、主仓源文件、Dev/Prod profile，未启动 L2 或调用真实模型。未 push、merge 或物化。

## 修复

- Q1：锁定 kit 只有带 eager 全局 CSS 副作用的公共入口，没有可释放组件入口。Studio 仅消费 Button，改用本插件最小原生封装和已受 dependency effect 管理的局部 CSS；控件32px/8px、官方 token、disabled/focus/pressed/hover 保持。原生控件有明确 UI01 特例理由；没有修改外部 kit 或 build alias。原锁定依赖包保留，不做无关依赖迁移。
- Q2：cancel 先删除 job、发布唯一 cancelled 终态并退款，再 abort/cancel 外部可重入函数。覆盖同步失败、abort事件、订阅者重入、迟到回调。
- Q3：文档、references 和结果遍历先稠密化，空洞不再被 every/some 跳过。
- Q4：patch 只接受声明字段，禁止改变所属 mode；完整验证引用 id/fileId/name/mime、source/fixtureId、去重，以及 mode/submode 不变量。无效提交保持状态和余额原子不变。
- Q5：主页场景 chips 按真实 fixture type 过滤，scope store 持有筛选，独立于图片三维筛选；补图片示例正文装配和确认，不自动提交/扣点。
- 正式 probe：显式 `selectStages('studio')` 注册 community-tab 目标，通过 production client 捕获其 Tab，再在真实页面走公共 workbench open。严格要求当前session、唯一openedTab、activeTab、非空可见内容、无错误和真实PNG。原 `all` 八项、sidebar选择判定不变；Studio不伪装sidebar Stage。未执行正式L2 probe，不能把其离线自测写成运行通过。

## 验证

| 检查 | 实际结果 |
|---|---|
| 原独立 QA | 29/29；测试文件原样保留 |
| 全 Studio（原29 + 新5） | 34/34，`QA-round3.log` |
| 共享 live/ego + Studio 新增2 | 25/25，`probe-round3.log` |
| Studio build | 成功，80,148 bytes |
| plugin boundaries | 2236 sources通过（新增scene测试前的执行）；最终静态复跑另见 `static-round2.log` |
| Stage contract | 11 Stage / 原8 sidebar targets通过 |
| UI01–UI10 | 296客户端文件、0违规 |
| git diff --check | 源码/文档通过；纳管原始日志后 cached check 报日志中的 Node AssertionError 空白行尾空格，保留原始字节，不声称全量通过 |
| 完整 gates | 149项：143pass、6fail，0skip；`gates-round3.log` |

原独立 QA SHA256：`d86717f14a7b22cfac032b30638e5c38dcdc449a066a20922ce6be7b7015d3fa`，与 QA-REPORT.md 一致。QA-REPORT.md、QA-round1.log为原始历史 FAIL 证据，不覆写为 PASS。

新增真实回归：实际依赖解析 bundle 求值/依赖未就绪/十次注入释放、Host style节点和字节保留；fixture完整引用快照与缺字段逐项拒绝；取消重入；场景store隔离；真实React/jsdom点击chips和图片装配。它们属于离线契约，不替代 ego-browser。

## 门禁环境与剩余

1. 根 `pnpm verify:stages` / `pnpm test:gates` 在执行脚本前触发自动install，现有 clip 的相对 file依赖解析到不存在的 `omnimux-dsh/personal/dsh-ui-kit`，失败。随后用 `node scripts/verify-stage-contracts.mjs` 与 `npm run test:gates` 执行完全相同脚本；不改 package script或门禁。
2. 临时fixture从任务树node_modules取依赖，初次报 pngjs/esbuild/acorn/react缺失。仅在本树node_modules补只读指向已安装依赖的链接，之后相关25项通过；没有安装/改写依赖源码或外仓。
3. 最终完整gates的4项sync-repeat-install失败：`Network access disabled by the environment; can't reach ... pnpm-11.7.0.tgz`。不请求权限或绕过下载限制。
4. 另外2项package-files失败：assets声明的`runtime/cpython-3.13.15+20260807-darwin-arm64`与`darwin-x64`不存在。不创建空运行时、不改assets产品范围。
5. L2 `start` credentials复制未获bootstrap授权，未启动；正式Host/ego证据、主题、尺寸/IME/下载/关闭生命周期仍须主理人取得明确授权后交独立QA验证。无需因此回退已通过的源码修复。

提交采用精确文件清单；ignored新源码、测试和原始QA材料使用按文件 `git add -f`，未修改共享exclude。构建生成物不纳管。
