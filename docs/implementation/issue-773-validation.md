# #773/#775 T03 有界离线验证：依赖核验与实施阻断

## 结果与基线

**IS_PASS: NO — 仅指本轮 T03 验证增量未实现；不是规格 FAIL，也不是完整包测试结论。**

- 固定任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`。
- base = HEAD：`580234923268673562cacb5cd01aebdb780339e1`；目标为该树本地未提交增量，不是已 fetch 的远端 tip。
- 完整读取 PRD（906行）、architecture（796行）、acceptance（169行）、revision-notes（83行）、capabilities（244行）及 spec-review（133行）。规格 Round 2 已 PASS，不重开产品选择。
- 本轮唯一产品文件产出为本文。未创建生产接口 stub、ZIP parser、worker 或测试；不会把依赖核验写成可运行验证器。
- query/type/catalog/aggregate 的现有未提交改动保留；query 独立 QA 84/84 是前序证据，本轮未重跑、未借作 T03 证据。

## 已核验现有依赖，不以未声明推定不能复用

核验范围为本任务树的 Market 解析链、只读共享主仓工具依赖和本树 lock；没有安装、修改或复制 node_modules，没有检查官方源码或发行包。

| 能力 | 当次证据 | 判定 |
| --- | --- | --- |
| ZIP reader | Market 和共享 Market `createRequire` 对 `yauzl`、`fflate`、`unzipper`、`adm-zip` 均 NOT_AVAILABLE；前者额外检查 `yazl` 也不可用。共享 `node_modules` glob `**/*zip*/package.json` 无结果；本树 lock 搜索同名 ZIP 包无结果 | 当前允许复用面没有已安装 ZIP reader；不是声称这些库能力不足 |
| YAML | 共享 pnpm store 存在 `yaml@2.9.0`，package 声明 ISC；本树 lock 有此版本，但 Market 未直接声明且正常解析不可用 | 可复用既有版本，不应另写 YAML parser；最终需依赖负责人把它直接声明给 Market |
| YAML 安全能力 | 已读公开 `parseDocument`、ParseOptions、SchemaOptions、ToJSOptions 类型。内存探针：合法 mapping 接受；重复键拒绝；自定义 tag 拒绝；alias 在 `maxAliasCount:0` 拒绝 | 4/4 预期结果，仅依赖能力探针，不是 T03 产品测试 |
| Unicode 碰撞 | 两条解析链均无 `unicode-case-folding` / `@unicode/unicode-15.1.0`；共享依赖无 unicode 包或 case-fold 数据文件。Node v25.8.0 声明 Unicode 17.0 | 不能用宿主 Unicode 17、locale lower 或简单 lower 代替固定 Unicode 15.1 C/F full folding |
| 解压与 CRC | 当前 Node v25.8.0 的 `node:zlib.crc32` 为 function | 仅证明本次 Node 存在该公开函数；不等于 package 的所有 Node >=22 或实际 Host 已验证 |
| 定向编译 | 共享 Market 能解析 TypeScript 5.9.3、@types/node 24.13.3；可沿既有任务只读命令消费 | 并非因缺 cordis/dsh-tools/schemastery 而放弃离线编译；本轮没有新代码，未运行 strict |

### 为什么在此停止，而不是自行扩写 ZIP 库

用户允许在无允许依赖时说明最小 parser 理由，同时明确要求“最小依赖确实需要新增，读现状后停新增并列 exact 方案”。正式架构 §6 已选 lazy-entry ZIP reader 与严格 YAML，并要求 CRC 缺失时选成熟实现，不临时自造解析器。

本任务要求中央/本地头一致性、payload 消耗、descriptor、CRC、特殊文件/extra fields、编码歧义、ZIP64/多卷拒绝以及可终止流式输出。为省一个未安装依赖而重写这些职责，不是必要的小型适配器；尤其不能退回旧同步无界 `unzip.ts`。当前没有“已核实库不足”的证据，故不自建第二 ZIP 实现，也不以限制为 ASCII、拒绝全部 ZIP 或总返回能力缺失的 stub 冒充完成。

## 交主理人的最小依赖方案

下述为明确的后续工作项，不是已执行的依赖安装或已证供应链审计；仅依赖负责人获授权后执行。

1. **Market 直接依赖 `yaml` 精确 2.9.0**：复用本树 lock/store 的现有版本。消费 `parseDocument`，开启 strict/uniqueKeys/stringKeys、关闭 merge/customTags/resolveKnownTags，检查 document errors/warnings 和 AST，拒绝 alias/custom tag 后才投影字段。不通过 `.pnpm` 绝对路径、`NODE_PATH`、其他包私有依赖或源码内 fallback loader 消费生产依赖。
2. **Market 直接依赖 `yauzl`**：按已批架构候选 3.2.0 进行维护/安全状态核验后精确锁定；新增匹配的 `@types/yauzl` 仅当该锁定版本不自带类型。当前未安装，不能伪称已读其源码或已经证明能覆盖所有特殊头。负责人需核验 `fromBuffer`、`lazyEntries:true`、`decodeStrings:false`、`validateEntrySizes:true`、`openReadStream` 的实际公开签名/行为；应用负责结构/路径/CRC/计量，不以库默认开关替代全部安全检查。
3. **固定 Unicode 15.1.0 CaseFolding 数据**：优先采用经核验的 `@unicode/unicode-15.1.0` 发布包，核实它确实提供 C/F 映射（忽略 S/T），再精确锁定发布版本及完整性。`15.1.0` 在此是 Unicode 数据版本，不冒称 npm 包 semver。若包没有所需公开映射，由负责人提供官方 Unicode 15.1.0 `CaseFolding.txt` 的受控、带许可证/指纹的数据输入；不得用当前 runtime 的折叠近似。无准确已核验 npm semver时不编造版本号。
4. **CRC 的最小选择**：在实际最低 Node 消费版本验证 `node:zlib.crc32`；具备时复用 built-in。若不能覆盖已声明 Node >=22，依赖负责人选择并锁定成熟小型 CRC 实现（候选 `buffer-crc32`，检查是否已由 ZIP reader 带入；生产消费仍需显式声明），或另行批准精确 Node 最低版本。不得本轮改 engines，也不自写 CRC 表来隐藏兼容缺口。

依赖负责人的允许改动面应仅为 Market package、根 lock、所需合法工作树依赖准备；不能顺带修官方/外包/共享 profile。本轮不获该写授权，不自行运行 pnpm add/install。恢复后工程重核安装字节、类型与公开能力，若库确实缺一项结构检查，仅补该项有界适配，不扩展成通用 archive 框架。

## 后续接线契约（尚未实施）

- `install-validation.ts` 为唯一离线入口，只接受调用方已经有界接收的一份 ZIP 或文件名严格为 `SKILL.md` 的原始字节及 AbortSignal；不接 URL、真实目录路径、安装 scope、注册服务或 shell。
- 入口在第一次异步让出前复制有界输入；拒绝 SharedArrayBuffer 等并发可变来源。worker 使用自有转移缓冲，不把调用方内存直接 transfer；输出不暴露可变内部字节引用。确认 hash 绑定原字节，后续提交前须在受管 staging 重核 hash，不建通用事务系统。
- worker 生命周期从创建起按 monotonic deadline 计30秒，取消/超时实际 terminate 并等待退出；不能仅 `Promise.race`，不能在 Host 主线程同步 inflate。输出仅有限 manifest、hash、白名单描述元数据与有限报告；失败不返回包正文、绝对路径或原始异常堆栈。
- 稳定主错误码沿正式契约：`PACKAGE_FORMAT`、`PACKAGE_LIMIT`、`UNSAFE_PATH`、`INVALID_SKILL`；取消/超时需以精确 typed 原因区分，不能伪装解析成功。结果阶段仅 validated，不含 installed/registered/committed 成功承诺。
- 所有限额固定按 architecture §4.2/SPEC-03：ZIP20MiB、独立及包内 SKILL.md1MiB、资源单文件10MiB、实际累计100MiB、含目录1000 entry、剥层前后深8、NFC240 code points/960 UTF-8 bytes/组件255bytes、单项及总 payload ratio100、原字节 frontmatter64KiB。测试只可下调预算，不允许通过生产调用提高硬上限。
- 路径先严格解码再逐组件 NFC，拒绝非法根、遍历、空/点组件、反斜线、设备/链接、编码歧义及规范化 full-fold 碰撞。离线平台规则通过不等于实际落点可写：未来提交方仍负责真实根/no-follow/平台更严约束；本轮不落盘。
- 单 Skill 根或唯一一层公共包装，剥层前后都检查；多根拒绝。不递归解压嵌套资源；脚本/hooks只作普通字节，不执行、不联网、不调用模型。
- name/description/version 只作格式和显示元数据；包字段不得授予推荐/权限/认证/自动更新许可。缺失 name/description 须按实际正式 Skill 格式契约处理，不自行增加强制字段或以旧宽松 `parseFrontmatter` 代替完整验证。当前仅有规格“有效name/description”，没有本轮新实现或新强制要求。

## 当次实际命令与证据限度

以下 shell 的 cwd 均为本任务树；工具 glob/read/grep 为只读核验，不计作产品测试。复合命令的总体 exit0不掩盖中间诊断。

| 检查 | 次数 | 结果 |
| --- | --- | --- |
| `pwd; git rev-parse HEAD; git status --short` | 1 | exit0；HEAD固定，已有 query/types 等 dirty 与 docs untracked 保留 |
| `createRequire` 本任务 Market 逐包 resolve + Node/Unicode版本 | 1 | exit0；只有 esbuild 可直接解析，其余所查包不可解析 |
| `ls -ld node_modules plugins/omnimux-market/node_modules; ls node_modules/.bin; command -v tsc; node` CRC探针 | 1 | shell exit0；前三处 ls 报不存在，末尾 Node 成功遮蔽中间退出。已调查：任务树没有 node_modules，不是代码错误或可用依赖证明 |
| `createRequire` 共享主仓 Market 逐包 resolve | 1 | exit0；TypeScript/Node types 存在，所查 ZIP/YAML/Unicode 不可经该包解析 |
| 共享 `yaml@2.9.0` 公开 API 内存探针 | 1 | exit0；4个场景全部符合预期，不使用用户文本、不写 fixture、不执行 YAML 内容 |

YAML 探针设置为 `{strict:true,uniqueKeys:true,stringKeys:true,customTags:[],resolveKnownTags:false,merge:false,logLevel:'silent'}`；先检查 errors/warnings，再 `toJS({maxAliasCount:0})`。输入分别为普通 name/description mapping、重复 name、自定义 `!evil`、anchor/alias；只输出场景及 accepted/rejected 状态。

**未执行项**：T03 strict 编译0次、T03 产品测试0项、worker终止测试0项、真实ZIP/阈值验证0项。没有新增测试源码，不把4个依赖探针计成T03四个通过用例。正式全包 test 未运行：既有报告已证 Host 依赖缺失且 build 会删除跟踪 lib，本轮不重复破坏性失败路径；全包非PASS。UI/L2/App/模型/真实安装注册/库存读取全部未做。未创建需清理的临时编译输出或 fixture。

最终文档核验1次：`set -e` 下 Python直接检查未跟踪报告的末尾换行、尾随空白、围栏及4份规格路径，再执行 `git diff --check`、`git rev-parse HEAD`、`git status --short`，整体exit0；HEAD仍固定5802349。此检查仅DOC，不授予功能PASS。没有源码可进行跨文件实现一致性审查。

## 下一责任与关闭条件

主理人安排最小依赖核验/合法准备后，再派本任务授权文件面完成实际验证器与快速恶意 fixture、strict 和定向测试，随后独立 QA。未恢复依赖前不要要求 query 任务改 types 或用旧 unzip 接线。本文是依赖阻断交接，不是 T03 源码交付；#773/#775业务完整仍未实现，不具备关闭条件。

## 获批实施阶段（2026-09-08，进行中）

本次授权解除 Market 最小 package/lock 限制，采用 dependency-decision 的精确版本，不再等待产品或主理人重复批准。前述阻断是历史状态。完整读取 decision153行、本文74行、dependencies279行、独立依赖QA115行，以及正式PRD906/architecture796/acceptance169/revision-notes83行。固定base/HEAD仍5802349；query及兼容源码保持原样。

已向 Market 清单增加 yauzl3.4.0、yaml2.9.0、Unicode15.1数据包2.0.2、buffer-crc32 1.0.0和@types/yauzl3.4.0。任务内 `.task-tmp/validation/` 承载隔离安装与证据，第三方生命周期禁用，HOME/TMPDIR/cache/config/store均任务内；现有共享目录链只允许unlink本链接后装配旧包逐项只读links。真实lock尚未生成，安装/实现/测试尚未签PASS。根node_modules不存在、根.npmrc不存在属已核实环境，不是依赖错误。

本机Node25.8.0且已有22.22.2可执行文件；后续两者分别验证，不把22.22.2称最低22.0实测。不修改旧query/types/host/client/安装代码，不开放runtime route、不落真实安装目录。

### 依赖准备已完成（16:28）

- 独立npm安装两批exit0：验证依赖8包，工具pnpm11.7.0；全部ignore-scripts/package-lock=false/no-audit/no-fund/workspaces=false。无第三方脚本执行。
- 真实pnpm11.7.0 `install --lockfile-only --ignore-scripts --store-dir <task>/store` 在仅13个workspace清单、配置、原lock及kit清单镜像内exit0，19.7秒；未安装workspace或build任何kit。保留原相对file语义；全量比对原packages/snapshots及非Market importer不变，仅5个新增package/snapshot与Market五项声明，整体复制真实生成lock，不人工造SRI。@types/yauzl复用原lock已存在的@types/node25.9.5闭包；Market直接types仍24.13.3未升级。
- 仅unlink本包原node_modules目录链，改为真实任务目录；旧10包逐项链接到原真实包根，新增5项只指任务安装。未建根node_modules，.bin与@types目录均本地。
- 定向strict首轮exit2：12条mapped readonly赋值诊断已修本域类型；另2条Unicode CJS/ESM声明形状诊断。精确小样本：symbols.d.ts为`export default Map`，实际Node ESM default是Map、C条数1426、A→a；采用同一公开import后unknown运行边界Map/字符串检查，不改外包声明/数据/安全规格。此为报告给主理人的专业设计实现差异，不回退宿主lower或另vendor表。最终strict及产品测试见以下阶段记录。

## T03 离线验证器实际交付（2026-09-08 16:40）

**IS_PASS: YES — 限本轮离线 ZIP/独立 SKILL.md 验证器工程自检；独立 QA 未执行，完整 #773/#775、安装提交与运行验收不在本结论内。**

### 源码及生成面

本轮新增7个生产模块，均位于 `plugins/omnimux-market/src/`：

| 文件 | 职责 |
|---|---|
| `install-validation.ts` | 唯一有界字节入口、同步复制/SAB拒绝、monotonic deadline、worker terminate并等待exit、Abort |
| `install-validation-contract.ts` | 本域类型、冻结硬限额、只能下调的预算、稳定错误投影 |
| `install-validation-worker.ts` | worker内原字节SHA256、格式验证、有限结果回传；validated不等installed |
| `install-validation-zip.ts` | yauzl callback/raw reader、完整元数据先行、自持inflater、流式单/总量、实际consumed/CRC/hash、单根/一层包装 |
| `install-validation-structure.ts` | 有界EOCD/中央补检、local一致性、extra/encoding/特殊文件、12/16字节descriptor、区间重叠及padding检查 |
| `install-validation-path.ts` | 逐组件NFC、固定Unicode15.1 C/F fullfold、穿越/设备名/平台字节规则、重复与隐式目录冲突 |
| `install-validation-markdown.ts` | 原字节frontmatter计量、严格UTF8、yaml2.9 AST、拒多文档/alias/tag/duplicate、有效metadata与非空正文 |

新增 `src/tests/install-validation.test.ts` 与 `src/tests/install-validation-fixture.ts`，最终128个用例。测试ZIP writer只生成fixture，不用于生产解析。Market `THIRD_PARTY_NOTICES.md` 原文件已确认存在，在原通知上增加npm MIT声明及Unicode License V3完整通知；其来源指纹与专业decision一致。

仅改本包package及根lock的上述闭包；peer/engines/scripts/tsconfig/file路径不改。lib仅由正式build生成，新增7个生产JS与2个测试/helper JS；原query/compat生成物保持其前序版本。没有exports/Host/API/runtime route接线，未写旧unzip/install/provider/types/query/client或其他report/spec。

### 接口和安全口径

调用 `validateInstallPackage({format:'zip'|'markdown',fileName,bytes}, {signal?,limits?})`；返回判别联合 `ok:false + code/reason` 或 `ok:true + stage:'validated' + contentHash/inputBytes/totalBytes/metadata/manifest`。失败只有有限固定原因，不带绝对路径、堆栈、包正文；metadata仅name/description/version，无推荐/权限/自动更新等字段。manifest只含规范相对path、kind、实际bytes、SHA256，目录无内容hash；资源不缓存全文、不执行、不联网、不递归解包。SHA256绑定包含BOM/ZIP头在内的原字节，后续提交方必须重核同一原字节/受管staging映射。

name使用仓内 `src/expert/catalog-provider.test.js:166–189` 已有公开Registry镜像语法 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；description必须非空字符串，正文trim非空。未添加未经规格批准的name64/description1024上限，整体白名单仍受64KiB frontmatter硬预算。路径通过不声称实际根/no-follow/FS等价性已验证；这些仍属未来落盘方。

ZIP总20MiB、Skill1MiB、单资源10MiB、实际总100MiB、目录计入1000条、剥层前后深8、NFC240cp/960bytes/组件255bytes、普通文件单项与总实际payload ratio100、frontmatter原字节64KiB不含BOM但含分隔行和换行，均未放宽。压缩空目录也验证真实零输出/consumed，但不贡献ratio分母；包含被剥除包装目录。STORE/DEFLATE及带/不带签名descriptor正常路径均通过，所有header/payload/descriptor区间无空洞、无重叠；SFX前缀/未解释padding拒绝。

### 实际测试、命令和退出码

下述所有命令cwd为本任务树。`V=$PWD/.task-tmp/validation`；安装/执行环境HOME/TMPDIR/DSH_HOME/XDG cache/config/data/npm cache/store均为V内，禁用NODE_OPTIONS及Node compile cache；第三方安装ignore-scripts，正式包test显式运行仓内build，不是生命周期自动执行。未运行递归workspace install/build/postinstall。

| 阶段/命令 | 实际结果 | 证据 |
|---|---|---|
| 精确依赖npm install、pnpm工具npm install | 各exit0；8包与pnpm11.7.0 | `deps-install.log`、`tools-install.log` |
| pnpm11.7.0隔离清单镜像lock-only | exit0，真实生成；只新增46行 | `lock.log`、metadata镜像原生成lock |
| 首轮定向strict | exit2，14条类型诊断；随后本域修复，无外包补丁 | 本文前节，首轮诊断内容已记录 |
| 修复后定向strict/全包noEmit | exit0，0诊断 | `strict-final.log`、`noemit-final.log` |
| 初次build后定向fixture | exit1，114项113过1失败，无skip | `targeted.log`（原失败保留） |
| 第二阶段正式Node25 test | exit0，471/471、7 suites、0 fail/cancel/skip/todo | `formal25.log` |
| Node22.22.2定向fixture | exit0，119/119、0 fail/cancel/skip/todo | `targeted22.log` |
| 最终Node25.8.0 `npm --prefix plugins/omnimux-market run test` | exit0，480/480、7 suites、0 fail/cancel/skip/todo | `formal25-final.log` |
| 最终Node22.22.2同一正式test | exit0，480/480、7 suites、0 fail/cancel/skip/todo | `formal22-final.log` |
| Node22全包noEmit | exit0，0诊断 | `noemit22-final.log` |
| task-local types对齐真实lock、再全包noEmit | exit0；只将本地@types/node/undici-types对齐原lock已有25.9.5/7.24.6，Market直接24.13.3与runtime包字节未变 | `types-align.log` |
| 保护集/共享指纹全量deepEqual | exit0：共享35703项、原包links18项、外kit3文件、原保护源码等3163文件未变 | before/after.json、verification.log |
| npm隐藏安装锁逐包version/SRI对照真实pnpm锁 | exit0，8/8一致；不是供应链签名/provenance认证 | 实际版本及SRI脚本输出 |
| `git diff --check` | exit0 | 最终文档另直接查未跟踪新文件 |

精确命令模板：

```sh
node plugins/omnimux-market/node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --module Node16 --moduleResolution Node16 --target ES2022 --esModuleInterop plugins/omnimux-market/src/install-validation*.ts plugins/omnimux-market/src/tests/install-validation*.ts
node plugins/omnimux-market/node_modules/typescript/bin/tsc -p plugins/omnimux-market/tsconfig.json --noEmit
npm --prefix plugins/omnimux-market run test
/Users/x/.nvm/versions/node/v22.22.2/bin/node --test --test-concurrency=1 plugins/omnimux-market/lib/tests/install-validation.test.js
```

Node22正式test通过把PATH前置已有 `/Users/x/.nvm/versions/node/v22.22.2/bin` 运行，并实读`node --version`。**这不是最低22.0/22.1实测**，没有安装全局runtime。正式480=既有352+新增128；query独立84是其中子集，不重复相加。

### 失败修正与边界证据

唯一首轮产品失败为多文档：`parseDocument`返回首文档且忽略结束标记后的第二段，fixture真实复现；改用同库公开 `parseAllDocuments` 并要求length=1、所有errors/warnings为空，AST逐项拒alias/tag/复杂键。未改变安全规格/删测；不调用toJS，直接AST白名单get，避免不必要对象构造。精确小样本/差异向主理人披露在此，不把专业选型当运行保证。

最终fixtures包含正常MD/BOM/CRLF/STORE/DEFLATE、签名/无签名descriptor；CRC（包括空文件）、local mismatch、坏descriptor、truncated deflate、padding/第二deflate流、NTFS坏extra、Unix link/多种special mode、ZIP64/split/encrypted/重叠、CP437/UTF8/Unicode extra与原编码穿越、C/F/NFC/隐式目录冲突、多根；YAML alias/tag/duplicate/multidoc/deep嵌套、原字节frontmatter边界；入口同步copy/SAB/子视图hash；Abort与下调timeout真实worker退出（async_hooks WORKER destroy可观测后才通过）。

实际大小测试包含1MiB与+1、10MiB与+1、100MiB累计与+1、1000/1001条、深8/9、240/241cp、255/256组件bytes、64KiB/+1原frontmatter；ZIP20MiB输入准入与+1拒绝（20MiB全零非合法ZIP，不将其当合法最大ZIP通过）；真实deflate1200bytes/12bytes=100接受、1201/12拒绝，实际chunk输出超限假声明拒绝。960bytes在240cp和组件255的联合预算下非独立可达满值，测试947bytes合法多组件emoji以及下调946拒绝，不改生产限制。worker30s机制测试只下调1ms，不伪称整30s耗时实跑或已测最低Node。

### 最终工程审查与移交

已完成全局跨文件一致性检查：所有新导入在本域/Node/已声明公开依赖；类型与入口/worker/流计量一致；不依赖yauzl私有CRC、decodeFileData:true或新增有误的Promise wrapper；无Host路由、无包脚本执行。发现并收紧了独立MD的下调total预算、压缩空目录（含被剥wrapper）的真实验证、原CP437路径不能被Unicode extra掩盖、name与既有Registry镜像一致；最终双Node正式脚本绑定这些源码后全部通过。

原共享完整指纹SHA256仍为`fe0861d106dd5ad9d25b7fd268b0fdb03f26197928eaadb5bacc95fe93e7e868`；原包link集`37715317029168106c9bc388be90ca74d5bc38dbe0689a287df810e3de62323a`；外kit三文件`4a74b68d97dfed09772c28804d56205cfead66a65752bbbd7cdb41e8df47461e`。正式Node25日志SHA256 `6037332953b1ddb902880a2ac5901298700ce4ebd5b433efedbfa154bd6da6ba`；Node22日志`e69a9ec6c6b123ed3208579f1eabfc83f4030f712f1a4126f4609142d5578411`。

本任务临时依赖/fixture/cache/evidence只在 `.task-tmp/validation/`，不纳入源码提交；依赖links目前依赖该目录，QA前不能清理。首轮只读发现根node_modules/.npmrc不存在、误查catalog-provider.test.ts（实际JS）以及一次相同文本edit被拒均已解释，不是产品失败；没有越界重试、代码或锁伪造。

下一责任：主理人安排独立QA核验上述源码、真实lock与128项对抗fixtures，再按原门槛推进后续安装/库存/UI/会话。真实受管staging/提交前hash/no-follow、G-01/02/03、认证/Origin、Registry、实际安装scope、UI/L2/Electron均未签；本轮不处理共享profile、官方/外仓、提交/push/部署或外仓Issue，完整工坊尚不能关闭。



## QA-VAL-01 / QA-VAL-02 工程返修（2026-09-08）

**IS_PASS: YES — 仅限本次两组 P2 同根因修复及工程自检；独立第二轮 QA 尚待主理人安排，不代表 T03 最终验收、完整 #773/#775、合并或部署通过。**

### 基线与真实复现

固定工作树、base/HEAD 仍为 `580234923268673562cacb5cd01aebdb780339e1`，目标为该树未提交增量。完整读取第一轮独立 QA 报告133行、QA测试194行/73项、独立fixture78行、原工程报告172行、依赖decision153行、原工程测试235行/128项、fixture67行；安全约束以正式 architecture §4.2 和前序工程/依赖契约为准。

修改前 Node25.8.0 对既有正式lib执行：

```sh
node --test --test-name-pattern='SAB backing|input accessor|accessor cannot|intrinsic byte' plugins/omnimux-market/lib/tests/install-validation.qa.test.js
```

实际 **4项、0通过、4失败、exit1**；两个 Markdown 场景返回 validated/inputBytes82；两个ZIP场景返回 validated/inputBytes20971521、hash `e2937a062f4dba9e318199ef74bf076d6014d122a8012bb8a9a2c9b7d01b3acc`。这是修复前工程复现，不是把历史 QA 日志当新结果；本次未再次在 Node22 运行未修版本，双Node历史复现由第一轮QA报告提供。

### 最小修复与边界

手写改动仅 `src/install-validation.ts`、`src/install-validation-worker.ts`、`src/tests/install-validation.test.ts` 与本文；`src/install-validation-contract.ts` 无需修改，公共函数/类型签名不变。lib只通过本包正式build生成，未手改。没有改QA测试/fixture、其他模块、query、规格、package/lock/依赖/外仓/profile；没有安装、清理依赖、提交、push、模型调用或App/L2操作。

- 入口拒绝 input Proxy，三个字段仅从自有 data descriptor 捕获一次；不遍历继承链、不执行输入accessor。format/fileName accessor返回 `PACKAGE_FORMAT/INPUT_FORMAT`。bytes accessor或缺少自有bytes：Markdown返回 `PACKAGE_FORMAT/INPUT_BYTES_DESCRIPTOR`，ZIP返回 `PACKAGE_LIMIT/INPUT_BYTES_DESCRIPTOR`，表示无法无执行地建立ZIP输入预算；**不是宣称已测量其隐藏内容超限**。此为明确fail-closed准入口径，不依QA样本内容或读取次数分支，QA原断言无需调整。
- 使用 `node:util.types.isUint8Array/isArrayBuffer` 验证真实brand，缓存 `%TypedArray%.prototype` 的 buffer/byteOffset/byteLength getter，忽略实例遮蔽属性及iterator。SAB真实backing必拒；伪造原型/Proxy不成为真实view。可信真实长度先与20MiB/1MiB比较，再建立同范围原生view并分配copy，不执行调用方getter；构造原生view会拒绝已detached的ArrayBuffer，异常仍走有限脱敏failure。
- 同步段没有异步让出或调用方字段回调；复制只用真实范围。普通Buffer、Uint8Array、其子类子视图hash/原buffer所有权、调用后mutation隔离保持；signal引用捕获一次，原Abort/deadline/terminate后await exit语义保持。此处不是任意同进程恶意全局intrinsic重写/原生扩展内存攻击的隔离沙箱。
- worker在try内先验证format并通过原resolveLimits重新应用不能提高的硬预算，再调用自身ArrayBuffer内建byteLength getter进行真实brand/尺寸核验；ZIP zipBytes、MD skillBytes及MD totalBytes在Buffer视图/hash/parser前检查。SAB/错误对象异常只返回有限failure；ZIP实际总解压预算仍由原流计量约束，不把压缩包头大小错误计入totalBytes。未增加框架或依赖。

### 工程回归与实际检查

新增 **22项**工程回归，原128项所有字节保持为测试文件前缀：六个format/name/bytes accessor拒绝且getter零调用、重入/断开getter零调用、Proxy零trap、继承accessor拒绝、三类有遮蔽属性子视图精确hash与mutation隔离、遮蔽SAB、已detached且无worker、真实合法20MiB+1 ZIP真实限额拒绝且无worker、直接worker两格式硬限额/三项下调预算/SAB及非法格式/提高预算拒绝。fixture只在内存合成，不依赖修改QA writer；直接worker测试绕过入口用于证明纵深检查。

| 本次实际检查 | 计数 / 结果 |
|---|---|
| Node25.8.0 修复前定向QA复现 | 4项，0 pass / 4 fail，exit1 |
| Node25 定向strict / 全包noEmit | 各exit0，0诊断 |
| Node25 正式build + 完整验证器影响面 | build exit0；223/223，0 fail/skip/cancel/todo |
| Node22.22.2 完整验证器影响面 | 223/223，0 fail/skip/cancel/todo，exit0 |
| Node22 定向strict / 全包noEmit | 各exit0，0诊断 |
| Node25 正式 `npm --prefix plugins/omnimux-market run test`（含build） | **575/575**，7 suites，0 fail/skip/cancel/todo，exit0 |
| Node22 同一正式test（PATH前置现有Node22目录，含build） | **575/575**，7 suites，0 fail/skip/cancel/todo，exit0 |
| 原测试前缀及QA/fixture/contract/package/lock/query/四规格指纹复核 | exit0，见下表 |
| `git diff --check` / HEAD及dirty路径复核 | exit0，HEAD未变，原有其他dirty保留 |

计数：223 = 原工程128 + 原QA73 + 工程新增22；575 = 原全包480 + 原QA73 + 工程新增22。原480全部通过，原QA73全部通过，不重复加query子集。修复后上述实跑没有失败；不是独立第二轮QA，不能把第一轮QA的两次断言校正算作工程修后验收。

环境沿第一轮QA命令：`V=$PWD/.task-tmp/validation`，HOME/TMPDIR/DSH_HOME/XDG/npm cache都位于V，`npm_config_offline=true`、ignore_scripts/update_notifier关闭，unset NODE_OPTIONS/NODE_PATH、禁compile cache。使用现有Node25.8.0和 `/Users/x/.nvm/versions/node/v22.22.2/bin/node`，未下载runtime。正式build是显式仓内脚本，不是执行上传包脚本或依赖生命周期。根测试/别包build/安装均未运行。

定向strict和全包noEmit使用前节完整命令；影响面命令为 `node --test --test-concurrency=1 plugins/omnimux-market/lib/tests/install-validation.test.js plugins/omnimux-market/lib/tests/install-validation.qa.test.js`。运行记录：工程job `bash-339` 为Node25 strict/noEmit/build/223；`bash-342` 顺序记录Node22 223/strict/noEmit、Node25 575、Node22 575，已全部收集exit0。后者完整工具日志为 `/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/dsh-subprocess-xl4elP/dsh-subprocess-75281-170-76623c8cc76c-stdout.log`，SHA256 `84a94ded5794f7d6d9110641fb6a30468b148ca1806b45ceb0ef24173c4374ce`；1342–1349行是223汇总，1966–1973是Node25 575汇总，5486–5494是Node22 575及ALL_CHECKS_EXIT_ZERO。该日志为工具托管临时证据，未额外写超出授权的项目文件，本文保留计数/命令/指纹供独立复跑。

### 不变指纹与最终一致性审查

| 文件 / 原有内容 | SHA256（修前=修后） |
|---|---|
| 工程原测试前19427字节（235行/128项） | `eb3d99ea49aed0ee7e3b5c32c126856d21a16ba8c629c27a236e0ef3313b76cf` |
| QA测试194行/73项 | `12ec9339e89bea0ba402d2c04e9280568e5b883bc360f1868338e0f909537a00` |
| QA fixture78行 | `c28ecff3b87576a9cc7b52d82af460c63d6fb3025596e3c5c4e1710e9149096e` |
| 工程fixture67行 | `1ca9baffa453a3a1c5e273c0fdd20f4f817d8368d4a400f695858c216a4b151b` |
| QA正式报告133行 | `0d6521c1b2f9f79089f32feb657859d5f4c70cfef916e3f67603d31aa3c1a315` |
| contract | `80b64e9586a8640598e44ce70389f396e89476429db36bedf10ad41ad87d357a` |
| Market package | `eb0ad7da02d1096819ca55ed246b3aac83fbbd5a8a3b5c4ec467fc15a728b478` |
| 根lock | `3cce2f364bcf1a547ae65f51fe566a1928a7edaa2e2db65c63908df8053d3ba2` |

最终生产入口SHA256 `77b0f360ded0c39d9f073c22e2816c8832f36ababd3e25b37ddc572c3ce4d027`；worker `9fe52c5b057a6333b1f6dfc6bc469ef346c56d7837496a7f603c42f033e97986`；含新增工程测试 `79b19a41e7cdb873343d5fafab1e37be3800ebe8bc7dac550570bc8c3daea05a`。

全局一致性审查：入口/worker相同format与预算传递，复制buffer唯一转移；helper导入与生成URL一致；无公开签名或manifest/hash语义破坏；尺寸检查先于copy/hash/parser，ZIP压缩与解压总量没有混用；原取消/timeout用例和QA真实worker destroy检查均通过。节点范围与Node类型已由双版本编译/测试确认。本次没有重做35703共享项完整盘审计或供应链认证，不借前序结果宣称本轮重跑；没有依赖写操作。

**交主理人：安排独立第二轮QA验收修复，不自动第三轮。** 最低Node22.0/22.1未实跑，完整30秒deadline未实耗等待；Registry/认证/Origin、真实scope/staging/hash复核/no-follow、安装生命周期、UI/L2/ego/Electron均未验，相关原门槛不变。任务依赖仍引用 `.task-tmp/validation/`，保持现场，不清理。完整工坊未具备关闭条件。
