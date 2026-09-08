# Issue #773 / #774：T01 公共能力核验

状态：**T01 公共能力核验报告已完成（仅静态核验）**。先建立报告再增量记录；未实现 UI/Host，未进行功能运行验收。

## 增量记录 1：输入与消费链

- PRD 1–824 行与架构 1–1111 行已完整读取；不依赖并行生成的 specs。原架构第 698 行 6h 已被本轮用户指令 24h 覆盖。
- `docs/harness-pin.md:18–30` 登记 alpha.3 / dd6322d604e00eec1ba5e0c8541159906a21094a，且明确 shipping Desktop 子模块 pin 才对 App 有权威性。
- 官方默认 clone 实测 HEAD dd6322d604e00eec1ba5e0c8541159906a21094a；桌面 fork 实测 HEAD 947a5b2c579eb3ee68794ebd47bb86a772d1a242，gitlink 与子模块 HEAD 均 a66e4702047846cdaa10c66c9d3df3951f5ea70d。没有 fetch 或切换基线。
- 已安装 `/Applications/OmniMux Dev.app/Contents/Resources/build-info.json:2–17` 声明 App 2.0.5、package-dev、DSH rc.1 / a66e470204；安装锚点只读解析的 web-app/skill/ui-conversation/app-boot package 版本均 rc.1。此为安装态静态声明，不证明 45120 进程已加载这些字节。
- 正式 L2 `scripts/dev-env.sh:35–38,216–257` 默认消费官方 clone CLI，而非 Dev App 安装包；桌面 `scripts/omnimux.mjs:25–32,45–57,152–154` 转发到产品脚本，可显式绑定本任务树。
- 默认 Dev seed 白名单读取 `package.json.dependencies`：287 项均 file:；286 项精确符合受管路径且源 package.json 存在；`@crosery/dsh-viewer` 为绝对 file: tarball，不符合 `dev-env.sh:283–308` 的精确受管断言。只输出包名与路径类型，不输出实际备份路径；未读取凭据或 Skill 正文。该结果来自本轮复核，不来自其他任务日志；未启动 L2，不能声称 L2 启动失败或 runtime BLOCKED。
- CLI 锚点直接 resolve 某包出现 MODULE_NOT_FOUND 不等于闭包缺失：正式 preflight 是 CLI→web-app→ui-chat 的逐级解析，后续按其准确链核查，不用直接解析误判。


## 授权与基线

- 核验日期：2026-09-08；执行者：工程师寇豆码；结论仅回主理人。
- 产品任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`。
- 实测 HEAD/base：`580234923268673562cacb5cd01aebdb780339e1`；branch：`agent/market-skill-workshop-issue-773`；首次 `git status --short` 为空。
- 唯一产出为本报告及必要脱敏证据。不安装依赖、不实现 UI/Host、不写配置/profile、不扫描用户 Skill 正文、不调用模型 API、不启动/重启 App、不提交推送、不改官方源码或其他工作区。
- 主树 Market/Hub dirty 不属于本任务；PM/架构正在写的 `docs/specs/2026-09-08-skill-workshop/` 不依赖、不修改。
- 完整输入：PRD `.workbuddy/skill-workshop-prd.md` v0.1.1（824 行）；架构 `f65ca6f53880-job_output.txt`（1111 行）；读取进度另见后续核验记录。
- 最新用户决策覆盖旧稿：自动更新默认关闭，主动开启即查，后续 **24h** 冷却；推荐从普通区去重，精选仅推荐；未装开启先确认，安装成功启用，关闭不删除；精简详情提供确认卸载和同源手动更新。

## 证据等级

- `SUPPORTED_STATIC`：所查精确版本的公开契约/源码支持；不代表当前运行环境验收。
- `VERIFIED_RUNTIME`：仅限本轮真实隔离运行证明；本轮尚无此证据，禁止授予。
- `UNVERIFIED`：尚无法把静态声明与实际消费/运行实例对应，或缺必要验证。
- `UNAVAILABLE`：仅限明确检查的公开接口/版本不提供该能力；不得外推所有 shipping/安装版本均不支持。

## 增量记录 2：关键公共接口与风险

- 官方 clone 与桌面 a66e 子模块的 Skill Registry、filesystem 核心源码 SHA-256 完全相同；安装 rc.1 的 `dsh-skill/lib/index.js:250–264,298–305` 也可见同类 winner-only get 与近层覆盖行为。安装包声明 types 路径，但实际未带该 `.d.ts`，因此只读编译 JS 补证，未安装任何包。
- 所查公开 `SkillRegistry` 只有 registerProvider/register/list/snapshot/get；provider control 只有 signal/invalidate。未见统一 deny-first policy、持久 enabled 或事务加载屏障；`get(name)` 只取胜者，返回 undefined 不回退同名次选。上述属于限定源码版本的静态能力缺口，不是实际运行不支持声明。
- filesystem 默认根包含项目 `.dsh/skills`、项目 `.agents/skills`、custom roots、`DSH_HOME/skills`、全用户 `.agents/skills` 与 bundled；仅隔离 DSH_HOME 并不隔离全用户 agents roots。只核对根目录元信息，未枚举或读用户 Skill 正文。
- Market 默认安装根由 home 而非 profile ID 决定；`cfg.skillsDir` 可覆盖，但 catalog provider 注册不传 cfg，仍按 home/skills 解析；首次 catalog 安装还可能先落默认根再复制到自定义根。真实生效配置未读取，作用域保持 UNVERIFIED。
- 公开 Client `ctx.sessions.create({workspaceId?,cwd?,sessionId?})` 与 `scope/scopeOf/sessionOf/binding` 存在；Host ensureSession 按 ID 合并创建并核对 cwd/preset。workspace attach 失败返回 `session/workspace-attach-failed`，携带已创建的 sessionId；不得另造 ID 重试。
- `slash/input-insert-text` 请求 `{text,span:{start,end,draftRev},continue?}`；同步 bail 成功严格 true，失败 undefined。实际实现只做文本 draftRev CAS，不提供附件/phase 的整体 CAS；需调用方立即重读目标快照并禁止非 plain 或非空目标，不能将事件说明的泛称 phase guard 当实际代码已支持。
- `ctx.connection.requestRejection(req)` 是公开、只读请求认证 seam；所查 clone/a66e/安装 rc.1 均有，返回 401/403/undefined。它不返回用户 principal 或操作能力；Origin 比较只有 host，不含协议；缺失 Origin 也可通过 trust 层。上传必须另加精确 configured Origin 及操作/作用域授权，不能导入 BrowserAuth 私有类、读取 token 或复制弱 guard。
- 正式 L2 preflight 在 `start` 中并非零写 dry-run：`dev-env.sh:673–687` 在 preflight 之前创建 TASK_HOME，并可能复制 credentials/settings。故本轮只复刻无秘密的声明断言，不调用 start/preflight 函数。本次未创建 `~/.dsh-dev/tasks/skill-workshop-773`。

## 1. 证据路径、版本和适用范围

下文 `P/`、`H/` 等不是新路径，而是为表格压缩的精确前缀：

| 前缀 | 绝对根 |
|---|---|
| P | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773` |
| H | `/Users/x/Desktop/Project/Github/deepseek-harness`，HEAD `dd6322d604e00eec1ba5e0c8541159906a21094a` |
| D | `/Users/x/Desktop/Project/omnimux-desktop-fork`，HEAD `947a5b2c579eb3ee68794ebd47bb86a772d1a242` |
| S | `D/deepseek-harness`，HEAD `a66e4702047846cdaa10c66c9d3df3951f5ea70d` |
| A | `/Applications/OmniMux Dev.app/Contents/Resources/app.asar.unpacked` |
| I | `A/node_modules/@deepseek-ai` |
| M | `/Users/x/.omnimux-dev/profiles/omnimux/node_modules/omnimux-market` |

### 1.1 消费关系

| 面 | 本轮证实的关系 | 尚不能证明 |
|---|---|---|
| 产品声明 | P/docs/harness-pin.md:18–30 = alpha.3/dd632；P/plugins/omnimux-market/package.json:65–85 仍有 wildcard peers、旧 rc.8 dev primitive；pin 不是 lock 的全闭包 | 不是所有构建依赖均 alpha.3，也不是 App runtime identity |
| 默认未来 L2 | P/scripts/dev-env.sh:35–38,217–257,719–721 → H/apps/cli/lib/bin.js；CLI→web-app→ui-chat 逐级 require.resolve 成功，cli bin 与 chat lib 存在；所解析官方 package alpha.3 | 未 import/boot，无已加载字节或全部依赖闭包验证；脚本不比较 harness-pin 的 SHA |
| 桌面源码 | D 的 gitlink 与 S HEAD 均 a66e；公开相关源码只读比较 | D 当前 HEAD 不等安装 App build commit；D/src/preset-profile.ts 有他人 25增1删，不以该工作副本证明 shipping 行为 |
| 正式 Dev 安装态 | build-info 声明 2.0.5/package-dev、build commit 7e3dd15b69、rc.1/a66e470204；I 中 web-app/skill/ui-chat/ui-conversation/app-boot package 声明 rc.1；M package 0.2.13-omni.0，main lib/host.js | 未访问 45120、不查进程环境/日志、不获取 cookie/token，不能证明当前 45120 已加载哪个 App/Host/插件 |
| GUI | 当前 DSH GUI 43120 仅为本次代理载体 | 绝不将其用于 OmniMux Dev 或 L2 验收 |

S 与 H 的 `packages/skill/skill/src/index.ts`、`packages/skill/skill-filesystem/src/index.ts`、`packages/client/connection/src/{index,rpc,rpc-host,api-request-trust}.ts`、`packages/host/webserver/src/index.ts`、输入 contract/facade/hub 内容一致。session-controller 的 commands/agent/service 文件整体不同，分别检查了 create/attach 相关段，并补查安装编译 JS，未把整个 rc.1 当成 alpha.3 同义版本。

可复查指纹：

- H 与 S Registry src SHA-256：`bdec27a0ba5dc4063f7987dd2989e70e077de58a55a4e37d29a897bd690a6eb0`。
- H 与 S filesystem src SHA-256：`a243bb909e763c07b69dd96d22d6c36d281a9cef23a672f8142a00f46630bcfd`。
- M/lib/host.js SHA-256：`9764df637fa57ed9b3d1fd6befd1c7401e9e306b560fea619d3ceea243eb1b8f`。
- M/lib/local-api.js SHA-256：`822a95d9ab8666cb70fa8178e601767cb1cff9dc631eee818fd2892f00f0cb95`。

### 1.2 根与隔离

1. P/plugins/omnimux-market/src/config-store.ts:10–20,46–52,65,111–145：home 为 env DSH_HOME 或 ~/.dsh；默认 root=home/skills；overlay home/omnimux-market.json 可改变 skillsDir。Host:55–58 合并配置与 overlay。**未读取此实际配置文件**，不能宣称 cfg 最终值。
2. P/plugins/omnimux-market/src/expert/paths.js:19–43：profileDir 有独立 env/profile 推导，skillDir 则只有 home/skills/token；profile ID 不参与 skill 安装根。相同 DSH_HOME 默认跨 profile 共享 Skill，不可宣传仅本项目/仅此 profile。
3. P/plugins/omnimux-market/src/install.ts:84–115：catalog 安装先 installItem(home)，再按 cfg.skillsDir 复制；provider `catalog-provider.js:173,220–224` 使用 resolveHome、未使用 cfg.skillsDir，Host:260 注册未传 opts。自定义安装根必须与 filesystem custom roots、catalog/JIT 统一核实，不能仅改一个字段。
4. H/packages/skill/skill-filesystem/src/index.ts:36–40,49–73,160–175,241–260：同层优先级 project-dsh 100、project-agents 200、runtime 250、custom 300、user-dsh 400、user-agents 500、bundled 600；Market 900。provider roots 可 includeDefaultRoots=false，自定义 provider 名和根；这属于 provider 配置能力，不等于统一停用。
5. 目录元信息：`~/.omnimux-dev`、其 `skills`、其 profile 与 `~/.agents/skills` 均存在且不是 symlink；本任务 L2 root 不存在。没有枚举 Skill 条目或读取任何用户 Skill 内容，未验证目录写权限、跨卷/别名、有效配置覆盖、真实 cwd/preset。
6. 未来隔离 L2 仍须核对 `DSH_AGENTS_HOME`、filesystem explicit agentsHome/customSkillDirs/bundledSkillDir、项目根和 catalog 的 OPC 外部候选；仅 DSH_HOME 隔离不足。P/catalog-provider.js:89–159 的读取/JIT 路径不能在本轮调用。

## 2. 能力矩阵

`UNAVAILABLE` 限定于表内已检查公开契约；所有 actual live 状态仍 `UNVERIFIED`。本轮没有任何 `VERIFIED_RUNTIME` 项。

| ID / 能力 | 等级 | 精确静态证据 | 结论 / 缺口 |
|---|---|---|---|
| C01 来源发现与完整性 | SUPPORTED_STATIC | H/packages/skill/skill/src/index.ts:233–268,472–490 | snapshot 返回 winners、complete；不返回所有安装副本，不能充当库存全量 |
| C02 scoped winner 与读取 | SUPPORTED_STATIC | H Registry:502–518,553–564；I/dsh-skill/lib/index.js:250–264,298–305 | get(name,{cwd,scope,signal})；近 scope 覆盖远层，rank 只在层内比较 |
| C03 单 provider 生命周期/缓存失效 | SUPPORTED_STATIC | H Registry:271–277,注册方法、521–550；H filesystem:41–43,61–71,183–192,224–229 | control.invalidate 与 dispose，不是第三方任意全局 invalidate/屏障；watch 默认稳定延迟200ms |
| C04 跨 filesystem/provider/preset 持久拒绝优先 | UNAVAILABLE | H/packages/skill/skill/lib/types/index.d.ts:227–299；I/dsh-skill/lib/index.js:250–311 | 所查公开面无 setAllowed/deny policy；墓碑/隐藏目录/仅改 Market provider 不等于全层拒绝 |
| C05 首装/更新/卸载 transaction barrier | UNAVAILABLE | 同上；H Registry:508–518,521–550；H filesystem:719–744 | 无 acquire/release barrier、带租约验证、load drain 或 registry/file journal 原子提交接口；对本次所查版本不具备完整公共协议 |
| C06 对当前 winner 做结果核对 | SUPPORTED_STATIC | H Registry:86–93,502–518,749–781；H filesystem:206–221 | 可核对 definition.name/path/provider/source/invocation/content 并做内容指纹；必须自己要求正文非空，validateDefinition 只检查 content 为 string |
| C07 指定非胜出目标、停用态无副作用验证 | UNAVAILABLE | H SkillViewOptions:104–120；provider API:261–268；P/catalog-provider.js:141–159,216–224 | 无 getExact(path/provider/locator)/peek/noJit/ignorePolicy/lease 参数；get 可能触发 JIT 写盘。只读观察不能调用真实 Market get |
| C08 实际有效 cfg/root/profile 隔离 | UNVERIFIED | 本报告1.2；P/host.ts:55–58；安装 M/config-store.js:7–14 | 可证默认与覆盖规则，不能证实际实例根或全部来源作用域；写入返回 SCOPE_UNVERIFIED 直到隔离核实 |
| C09 预分配 Session ID 幂等 | SUPPORTED_STATIC | H api/session-controller/src/client/contract/sessions.ts:31–39；agent.ts:227–263,430–459；I/dsh-api-session-controller/lib/index.js:245,566–592 | 同 ID 创建/采用并核对 cwd、子代理归属和显式 preset；不是永久 operationId 去重，不阻止新随机 ID 重放 |
| C10 workspace attach 失败保留实体 | SUPPORTED_STATIC | H commands.ts:98–110；S commands.ts:99–111；I api-session-controller:581–587；H client/sessions/manager.ts:566–578 | 已创建会话保留并以 ungrouped 进入 manager，异常含 ID；以原 ID 重试，不删会话，不生成新 ID |
| C11 Client scope/public addressability | SUPPORTED_STATIC | H contract/sessions.ts:99–122；service.ts:395–410,460–485 | 成功 create 后同步可 binding/scope；open 是单独动作；未知 scope 为 undefined。失败不享有 create resolve 的同步保证 |
| C12 输入文本 CAS 与消费确认 | SUPPORTED_STATIC | H ui-conversation contract/input.ts:16–21,94–98,157–161；input/hub.ts:113–120；facade.ts:542–549；I ui-conversation/lib/client.js:11888–11894,12317 | actx.bail('slash/input-insert-text', request) 严格 true 才标记消费；undefined 不成功；不 emit 后假定写入 |
| C13 附件/phase/意图一体 CAS | UNAVAILABLE | H facade.ts:227–243,284–315,542–549；contract/input.ts:321–334 | draftRev 仅编辑器内容变化；附件变化不增 rev；insertText 不检查 phase。不提供 actionId/TTL/已消费集合，调用方需保护 |
| C14 Host 连接认证 | SUPPORTED_STATIC | H connection/src/rpc.ts:159–179；rpc-host.ts:95–99；I/client-connection/lib/index.js:529–532 | requestRejection(req) 可在任意 Web route body 前使用；undefined=认证与基础 trust 通过，不等操作许可 |
| C15 精确 Origin 公共校验 | UNAVAILABLE | H connection/api-request-trust.ts:99–115；I/client-connection:178–191 | 基础 fence 比较 host 而非完整 origin，且允许 absent Origin；所查公共接口无精确 Origin helper，须在产品边界加强，不能取 forwarded-host 自证 |
| C16 Skill 操作权限公共 seam | UNVERIFIED | H connection/rpc.ts:99–104,159–179；P/hub.md:29–42；P/omnimux/src/auth/identity.js:19–105 | 所查无连接 principal→Skill 安装根/操作授权接口；Hub identity.require 是云登录，不是该请求的本地安装许可，且可能联网/写 cache，未调用 |
| C17 body 前资源限额/流式 route | SUPPORTED_STATIC | H host/webserver/index.ts:42–48,221–228；connection/http-bridge.ts:47–66 | 原始 req handler 可以先认证/权限/Origin/Content-Length 再流式计量+超时。共享 fetch.register 仅 GET/HEAD，不能虚构 POST streaming API |
| C18 现 Market 上传安全底座 | UNAVAILABLE | P/local-api.ts:35–49,322–330；P/restart.ts:45–80；M/local-api.js:30–43，M/restart.js:42–83 | 已安装代码同样先无界 body，再弱 Origin；Host exact route 不自动认证。不应复用作新写入口 |
| C19 本地全量查询 / 远程全量排序计数 | SUPPORTED_STATIC / UNVERIFIED | P/skill-aggregate.ts:86–104,110–164 | catalog 可全量合并；远程截80 + extraRemote/totalApprox，不证明跨源过滤去重后的精确全集与全局最近 |
| C20 L2 受管 seed 与实际运行 | UNVERIFIED | P/dev-env.sh:283–308,655–722；本轮脱敏声明检查 | 当前默认 seed 不满足静态纳入前提，未运行；无 L2/浏览器/进程证据，不授予 runtime |

## 3. 拒绝、缓存与事务结论

- `invocation` 是候选/定义上的两个布尔字段，不是系统全局 deny。H/tool-skill/src/index.ts:138–145、189–195 分别在模型/用户加载边界检查，Registry list/get 本身 invocation-neutral。不能将 raw get 返回 definition 当作启用证据。
- 近层 preset 能遮蔽全局高优先级 provider；同层 provider get 返回 undefined 后 Registry 不会回退次选，但这不构成跨层拒绝策略。
- 缓存 key 包含 cwd、scope chain、revision；持久 enabled 若不进入公共拒绝层，即使列表刷新仍不能保证所有 loaders 遵守。Market registerProvider factory 丢弃 control，当前没有依赖启停变更的 invalidate。
- filesystem 每次 get 按 locator 重读正文，watch 失效异步；首次写入到扫描根、更新 rename 空窗、旧 candidate 指向新文件都需要加载屏障。P/install.ts:60 把 `.tmp-*` 放安装根，filesystem:719–731 仅特殊跳过 `.system`，不保证点目录不可见。现安装先 rm target，不能承担恢复事务。
- 可静态实现 staged manifest/hash/CRC/锁/journal 状态机和故障 fixture；但 rename+JSON 不是同一原子提交，也不能在缺屏障时偷偷把首装视为安全例外。
- 精确验证必须区分 Registry `get(name,options)` 与 provider `get(candidate,options)`。Registry summaries 不保留 path/locator；definition.path 可选。非胜出目标、停用包、同名外部来源不能以另一个 winner 的合法正文冒充注册成功。

## 4. 会话与输入可实施合同

1. Client 公共 `ctx.sessions` 与 Host 的 `ctx.sessions` 不是同一 API：此处 create/scope 来自 `@deepseek-ai/dsh-api-session-controller/client` 的 ISessions，不能在 Host 上直接套 Client 签名。
2. 一次显式用户意图固定 actionId、sourceSessionId、targetSessionId、workspaceId 或 cwd（二选一）、skill identity 和有效期。预分配全新 B，重复请求只重用 B；公开 API 不提供 actionId，去重由业务负责，且不能把已采用的非空旧 B 认作空白新建。
3. create resolve 返回 SessionId，不返回 input、preset 变更或自动 open；create 未包含自动 prompt/send。Host 创建仍可能触发插件生命周期副作用，本轮未运行，不把“零模型”从类型推成实际统计。
4. attach 错误的 SessionCreateError 保存 rpcError 与 requestedSessionId（H service.ts:95–109）；manager 记录已创建 ungrouped。保留意图与 B，以同 ID 重试绑定；不要将异常视为没有实体。
5. public scope 需经 sessions.scope/scopeOf，不能自己复制 scope symbol；不存在 `.scope(id).input` 的已确认 API。输入读面经 session slot 标准 props `useInput`/InputZone.input，见 H ui-conversation/contract/slots.ts:127–135,155–161,197–200。可采用绑定 B 的轻量 session-scope occupant 处理意图，不需第二 composer。
6. 只有 B 正确、当前仍允许该意图、phase=plain、draft 空、imageIds 空、revision 未变且在有效期内时，构造空 span `{start:0,end:0,draftRev}`。在相同同步边界读取目标快照并 bail，期间不 await。若用户切 C，取消/失效而非写 C；若 B 有编辑/附件，保留且提示，不 setDraft 强盖。
7. `true` 代表已应用文本，不等 Host Skill 已加载；返回 undefined 可能未挂载、stale span 或失败，不能删除 intent 或新建会话。后续有界重试只针对 B，严格一次消费；用户清空后 revision 增加也不得重新自动预填。
8. 已发送上下文不能被“停用”追溯撤回；新会话试用未装/停用目标仍依赖 T03 的真实准备能力，不可用旧 JIT 绕过确认。

## 5. 上传安全可行性与必须补齐处

### 5.1 合法组合顺序

后续新写路由可以继续使用现有 `webServer.register`，但必须同时 inject 公共 `connection`，在**第一次读流之前**依序执行：

1. 固定 path + HTTP method 分派，拒绝未知方法，不依赖 body.method 判定写权限。
2. `connection.requestRejection(req)`，保留 401/403，缺服务 fail-closed。
3. 与受信 Host/部署配置绑定的精确 scheme/hostname/effective-port Origin 校验；拒绝 null、缺失、多个值、跨站和不符协议/端口；不盲信 X-Forwarded-Host/Proto，不用 Referer/loopback 缺 Origin 兜底。
4. 当前操作和真实安装 scope 的许可检查（如用户确认阶段、operationId 与 revision/根绑定、只允许受管目标）；其公共跨域请求主体授权能力目前未证实，需主理人转架构确定，不得把 cookie 有效或云账号 logged_in 当成无限安装权。
5. 检查类型、声明长度及已选格式；之后再计量 raw stream、时间/取消/并发限额，超额断开，完整响应体与实际解压量分别计量。

精确 Origin 可在已绑定的本地明文 L2/Dev Host 上由配置+socket 正确取得，但代理/TLS/File Electron 场景必须核验实际部署；不从前端传来的任意 origin 参数授权自己。上述是实现可行性，不是本轮已实现。

### 5.2 不可采用的捷径

- 不能新增自己的 cookie/token 校验或调用 authorizeIndex 代替普通请求认证；不读取 BrowserAuth secrets。
- `connection.fetch.register` 公共 method 仅 GET/HEAD（H/rpc.ts:109–130），不能类型断言伪造 POST。
- RPC handler 收到 payload 前，http-bridge 已读取全部 body，默认300MiB；其 generic cap 可防无限读取，但不能满足本上传20MiB/1MiB的流前操作授权与专属资源界限。
- Hub apps/origin.js:8–19 允许缺 Origin 且只检查本地主机名，不符合本轮要求；不得跨包导入它或复制作为安全补丁。
- 操作权限缺口可在架构确认后的产品域权限合同中实现最小检查；若必须依赖新的 Host 公共 authority，按项目跨仓规则由主理人处理，工程本轮不建外部 Issue。

## 6. 正式 L2 检查与下一阶段命令

### 6.1 本轮实际检查结果

| 检查 | 结果 |
|---|---|
| CLI bin、逐级 web-app/ui-chat 解析、chat lib | 静态路径存在且可解析；未执行 CLI |
| 默认 seed package/patch/snapshot/lock/workspace 文件 | 元信息存在 |
| dependencies 精确 file: 纳管 | 287项中286项符合；@crosery/dsh-viewer 为绝对 file tarball，不符合脚本 |
| 受管声明对应源 package.json | 符合声明的286项无缺失；未作全部源 hash/锁安装证明 |
| lock 可迁移正则断言 | false；未输出原 lock 内容或秘密 |
| better-sidebar settingsNamespace 旧 import | 受管 lib 未发现该字符串；未动态 import dsh-settings |
| task home | 尚不存在，未新建 |
| L2/45120/browser | 均未执行，因此无运行验收状态 |

**结论：当前默认 seed 有可证明的静态门禁不满足项，但未执行 start，不能写成“本轮 L2 启动失败”。** 下阶段先由主理人获得环境责任方的受管修复证据，然后同次只读重核 seed。旧 mem/其他任务声称修复或故障都不能替代当次声明检查。

### 6.2 为什么不运行所谓 preflight

P/dev-env.sh 的 start:661–687 会先停已有任务 Host、迁移旧 profile、创建 task home，并自动复制 credentials/settings 后才做 assert_l2_source_deps。clone:361–382 会复制 seed 受管内容并运行 pnpm install；start:707–723 link 目标插件后启动 Host。因此 start 既不是 dry-run，也不在本次仅报告授权内。没有通过 source bash 函数、写 ~/.dsh-dev 或更换其他 seed 来绕过。

### 6.3 下阶段有条件允许的正式命令（本轮未执行）

前置条件：主理人明确安排 L2 实施、T02/T03/T04 有独立代码验收基础、seed 当次合规、目标任务名没有他人进程、离线 Skill fixtures 根和所有有效 filesystem/catalog 根已审查。不批准自动拷贝凭据/配置时仍不得执行 start，需环境责任方提供正式安全初始化条件；本报告不新增初始化脚本。

在 `/Users/x/Desktop/Project/omnimux-desktop-fork` 作为 cwd 执行现有公开入口：

```sh
OMNIMUX_PRODUCT_DIR=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773 \
OMNIMUX_PLUGINS_DIR=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773/plugins \
DSH_SRC=/Users/x/Desktop/Project/Github/deepseek-harness \
OMNIMUX_L2_SEED_PROFILE=/Users/x/.omnimux-dev/profiles/omnimux \
OMNIMUX_DEV_LEGACY_HOME=0 ALLOW_SEED_FROM_PROD=0 \
DSH_AGENTS_HOME=/Users/x/.dsh-dev/tasks/skill-workshop-773/agents-home \
yarn omnimux:dev start skill-workshop-773 omnimux-market \
  --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773
```

- 这是显式 alpha.3/dd632 默认 L2 基线；如需要与 shipping rc.1 完全同基线，须主理人先指定已准备且未修改的 rc.1 CLI 安装闭包，不能只替换 DSH_SRC 到缺 build 的 S 或猜 App 根能作 CLI。
- `DSH_AGENTS_HOME` 仅解决 env 默认 roots；若配置显式覆盖仍不能保证隔离。命令不覆盖 shared profile、不带 sync/restart App/Prod 参数。
- 记录实际 URL（44201–44299）、task、profile、SOURCE、产品 SHA、Host package/bundle指纹；**此版脚本未直接写 `.l2-dev.env`，不能照架构假定文件自动存在**。未来按正式 QA 工具生成身份记录。
- 业务浏览器验收加载 ego-browser，按 `scripts/ego-live-qa.mjs` 的公开准备流程和 `pnpm verify:live market --target=l2 --url=<实际L2地址>` 请求；pending/exit2 不是通过。未获得工具能力则只阻挡浏览器分支，不伪造验收。
- 在 L2 的零模型测试中仅注册受控 filesystem/provider/preset fixture，排除真实用户 agents roots、Market外部/JIT副作用，测试进程中 prompt/submit/model invocation 计数均0。

## 7. T02/T03/T04 可推进范围与 AC 门槛

本表是下一阶段工作建议；本轮没有实施授权扩展或功能代码变更。

| 任务 | 可先推进 | 不能宣称完成 / 被挡 AC | 最小下一验证 |
|---|---|---|---|
| T02 查询/库存 | 类型、推荐元数据与来源 identity 透传；本地全量查询/去重/分区/快照分页；unknown/null/error 分类；仅 fixture 的真实目录只读 inventory | 真实 cfg/root 未证实，AC21–23/49 的有效作用域未验收；跨源全局最近/精确计数 AC17/19 无全量数据证据 | 合成来源超80项、重复slug不同source、推荐0/1/多分类；受控根权限错误/外链/未知来源，不读真实用户库存 |
| T03 离线校验事务 | 格式/路径/CRC/资源限额验证器设计与 fixture；跨进程锁、CAS、journal/recovery 状态机；同一提交服务、24h默认关偏好/资格逻辑 | C04/C05/C07/C08/C16 未解除，不能开放首装/更新/卸载成功或假启停；AC24–26、29、34–37、44、45–48 的真实全链路不通过 | 验证器不执行脚本；每事务阶段故障/断电恢复、双Host同根fixture；公开 Registry capability 失败时在写root之前 fail-closed |
| T04 UI/会话 | 保留包/工作台/隐藏功能；组件布局/导航/mock合约测试；真实 create/scope/CAS adapter 的离线契约；B已准备分支 | 未装/停用准备依赖T03；AC38–44/52及AC01/12/50/53–57真实 UI 均待L2/ego；不能把组件fixture当已上线 | 同ID响应丢失、attach失败、A有草稿附件、B新增附件/文字、切C、composer迟到、重放过期；断言从不调用submit/prompt |

其他依赖：推荐封面与版权是内容验收，不妨碍合成fixture技术验证；fixture不得发布为真实精选。本地直接导入/unknown源不可自动更新；开关保存不等自动更新完成。

## 8. 请主理人转架构的精确更正（不重做设计）

1. 明确写成“所查公共 Registry 接口缺统一 deny/barrier”，不要仅凭 alpha pin 标签声称所有实际安装版不支持；本轮补充 rc.1 安装 JS 后仍是静态结论。
2. **首装同样受 barrier 约束**；默认安装根不是 profile 级，catalog cfg/JIT root 偏差需在适配器入口统一，不能仅重命名 scopeKey。
3. 现 Registry definition 校验不拒绝空 content，不强制 definition 的 source/provider/path 等于 winning candidate；产品精确验证要追加比对。`getExact` / `noJit` / `commitBarrier` 只是计划适配接口，不是官方 API。
4. 输入 insert-text 实现只 text rev CAS，附件和phase不在同一CAS；无副作用的同步业务检查是额外必要保护。禁止假设公开 `.input` 访问器、异步 bail 或自动 actionId 去重。
5. 连接认证 seam 已存在，应明确复用；不是所有安全条件都“宿主不支持”。但操作授权、精确 Origin、stream上限需另行完成；公共 fetch routes 不支持 POST。
6. L2 start 会在 preflight 前写task home/种子，且未直接生成 `.l2-dev.env`；报告不能写“检查失败前完全无写”或依赖不存在的自动身份文件。
7. 已批准自动更新冷却24h覆盖原稿6h；受管 dsh-ui-kit 依赖路径在当前 P/Market package.json:66 实为 `file:../../../../personal/dsh-ui-kit`，不是架构泛指 `../../shared/dsh-ui-kit`。T01 本轮不改依赖；后续按正式 snapshot 合同核实路径，不照稿新增旁路。

## 9. 检查、残留与交付状态

- 已进行：全部指定输入读取；AGENTS/workflow/dev/ops/hub契约；三个消费面相关公开源码与安装包声明；必要根目录元信息；只读 package resolution、关键源码hash对照、脱敏seed/锁断言。
- 未执行：安装、构建、测试套件、真实 Registry get/list、读取用户Skill正文、创建会话、模型调用、HTTP认证探测、L2/Dev启动、浏览器/原生App操作、写配置、远端Issue/PR/push/merge。
- `pnpm --filter omnimux-market test` 含build清理lib（P/plugins/omnimux-market/package.json:45–47），不适用本次仅文档核验，未执行。
- 依赖仅核对声明：P/pnpm-lock.yaml:2697、5144 出现 yaml@2.9.0，未发现 yauzl；Market 未直接声明二者。当前 shell Node v25.8.0 不等实际 Host Node，未锁定 ZIP/CRC 实现版本、未做供应链审计。这是下一阶段依赖授权后的最小核验，不在本次安装或修改清单。
- 读取不存在的发行包 `.d.ts` 后确认文件未随包分发，转只读同包编译JS，不安装；直接CLI解析不存在包名的初查不作缺闭包证据，已改按真实public包名/依赖链核对。
- 外部源码不是审查目标：H 有非任务的 cli untracked test；D/preset-profile有他人dirty。都未修改，相关事实不用于隐式扩权。
- 最终文档完整性检查结果在报告末尾记录；**IS_PASS仅表示此核验报告覆盖任务要求且证据等级正确，不表示任何功能通过、T01完整基础设施实现完成或Issue可关闭**。


## 已确认边界

- 历史记忆仅作线索，不把其他任务 L2 seed 故障自动认定为本任务已 BLOCKED。
- 所查官方 clone 未发现统一拒绝/屏障，只能形成静态范围结论；首次安装同样依赖加载屏障。
- `harness-pin` alpha.3 + SHA 登记不是实际 shipping 或安装版本证据。
- DSH GUI `43120` 不是 OmniMux Dev `45120`。

## 最终完整性判定

- `git diff --check` 与 `git diff --no-index --check /dev/null docs/implementation/issue-773-capabilities.md` 均无格式错误；另直接检查未跟踪报告，C01–C20唯一完整、代码围栏成对、无行尾空白、命令与合同路径存在。
- 最终 HEAD 仍 `580234923268673562cacb5cd01aebdb780339e1`；无提交/推送。任务树出现并行 PM/架构的5份 specs（prd/acceptance/architecture/class/sequence），未读取为依赖或修改；本代理唯一产品文件改动是本报告。
- 主理人下一步：接收本报告并转架构第8节更正；明确下一阶段代码范围后可安排 T02 与 T04契约/fixture、T03离线验证器/事务模型。公共 deny/barrier、精确验证/作用域/操作权限及当次L2 seed前提未解除前，不开放完整生命周期成功链、不关闭对应AC。
- **IS_PASS: YES — 仅对本次 T01 公共能力核验报告的完整性；功能、运行验收、完整T01基础设施实施及Issue关闭均未通过。**
