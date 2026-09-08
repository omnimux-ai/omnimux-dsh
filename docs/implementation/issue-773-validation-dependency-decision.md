# #773/#775 验证器依赖最小技术确认

## 结论与适用范围

**DEPENDENCY_SELECTION: READY；实现、安装、strict、T03 验收：NOT_RUN。** 主理人可据此授权工程准备精确依赖并实现既有离线验证器，不需要重复产品决策。选 `yauzl@3.4.0`，不锁有已披露漏洞的候选 3.2.0；复用 `yaml@2.9.0`；新增固定数据 `@unicode/unicode-15.1.0@2.0.2`；保留 Node `>=22` 并使用 `buffer-crc32@1.0.0`。

- 核验时间：2026-09-08，Asia/Shanghai；版本指当次官方 npm registry 返回值，不能作为未来 latest 承诺。
- 任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`；本地 HEAD `580234923268673562cacb5cd01aebdb780339e1`，目标为本树未提交增量。未 fetch，不是远端最新代码审查。
- 完整读取 [architecture §4.2](../specs/2026-09-08-skill-workshop/architecture.md#42-安装资源阈值)、[§6](../specs/2026-09-08-skill-workshop/architecture.md#6-所需依赖)、[验证工程报告全部74行](issue-773-validation.md)，以及 Market package/tsconfig。工程已证无可复用 ZIP 库、现有 yaml 2.9.0、无固定 Unicode full-fold；此处不把历史探针冒充本次产品测试。
- 本轮只新增本文。未安装依赖、执行第三方包代码或脚本、修改 package/lock/源码/规范、触碰共享 node_modules/profile、联系工程80、创建外仓 Issue、提交/推送/部署。公开元数据、tarball、源码和 Unicode 文本只在内存读取分析，未落公开包临时文件。
- 官方库并不替代中央/本地头、descriptor、CRC、严格编码与字节计量；下列是有界适配，不是另写通用 ZIP parser 或重新架构。所有已批准阈值不变，真实提交仍受原 G 门槛约束。

## 1. 精确依赖清单

仅合并下列字段，不替换 Market 整份 package：

```json
{
  "dependencies": {
    "yauzl": "3.4.0",
    "yaml": "2.9.0",
    "@unicode/unicode-15.1.0": "2.0.2",
    "buffer-crc32": "1.0.0"
  },
  "devDependencies": {
    "@types/yauzl": "3.4.0"
  }
}
```

| 依赖 | Node/类型/传递依赖 | 许可证及主源 |
|---|---|---|
| yauzl 3.4.0 | engines `>=12`，覆盖声明 Node >=22；CJS `index.js`，无 exports map、无内置 TS；runtime 仅 `pend ~1.2.0` | MIT；[npm精确元数据](https://registry.npmjs.org/yauzl/3.4.0)、[上游](https://github.com/thejoshwolfe/yauzl) |
| @types/yauzl 3.4.0 | `index.d.ts`；依赖 `@types/node:*`，锁复用现有 Node types，不升级工具链 | MIT；[npm](https://registry.npmjs.org/@types/yauzl/3.4.0)、[DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/yauzl) |
| yaml 2.9.0 | engines `>=14.6`；自带 `dist/index.d.ts`；零 runtime 外依赖；无需 @types/yaml | ISC；[npm](https://registry.npmjs.org/yaml/2.9.0)、[上游](https://github.com/eemeli/yaml) |
| @unicode/unicode-15.1.0 2.0.2 | 包 semver **2.0.2**，数据版本 **15.1.0**；未声明 engines；零 runtime 外依赖；公开子路径附带 d.ts | npm 声明 MIT；[npm](https://registry.npmjs.org/@unicode%2funicode-15.1.0/2.0.2)、[上游](https://github.com/node-unicode/unicode-15.1.0)；底层数据另保留 Unicode 许可说明 |
| buffer-crc32 1.0.0 | engines `>=8.0.0`；零 runtime 外依赖；自带 `index.d.ts`、`dist/index.d.cts`/`.d.mts`；无需 @types/buffer-crc32 | MIT；[npm](https://registry.npmjs.org/buffer-crc32/1.0.0)、[上游/许可证](https://github.com/brianloveswords/buffer-crc32/blob/master/LICENSE) |

yauzl 当前不再传递安装 buffer-crc32：3.3.2 起在库内保留私有 CRC 实现并优先内置 zlib。**不得导入 `yauzl/crc32.js` 私有实现代替直接依赖。** `pend` 当次 latest 1.2.0/MIT、零 runtime 外依赖；最终 transitive resolution 交 lock 记录，已有同版本则复用。

### 1.1 完整性与体积证据

| 精确包 | tarball实际字节 | registry unpackedSize | registry SRI（sha512） |
|---|---:|---:|---|
| yauzl 3.4.0 | 31577 | 109901 | `sha512-jIH9yLR9wqr0wOS0TpBvo/g/2UgZH5qePVbjgRliiF0BYvOZyaBknKsF+x9Iht0O6sqgnB93rCICdOZFecJuDw==` |
| @types/yauzl 3.4.0 | 2914 | 9181 | `sha512-NRPn5w6h8dhcnmx3YIRQcqMywY/+nND/uOkJessedcrowO3C0AssHp3tMJpxKAwOhFOo0OV1y9VtsC5hbKKBAw==` |
| yaml 2.9.0 | 未单列实测 | 685953 | `sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA==` |
| Unicode 2.0.2 | 1105871 | 2815737 | `sha512-tpIvbVM0/2cverqR9uIy/f3lT3XLkHMP/8WW9Wf3EHhu86ZSB7wUFdP1dtTE7vHDTuNeFvvipLGVK4kRrXuegA==` |
| buffer-crc32 1.0.0 | 4958 | 16801 | `sha512-Db1SbgBS/fg/392AblrMJk97KggmvYhr4pB5ZIMTWtaivCPMWLkmb7m21cJvpvgK+J3nsU2CmmixNBZx4vFj/w==` |

除 yaml 未另做 SRI 对照外，表中四个下载 tarball 均用 Python SHA-512 对照当次 registry SRI，一致。yaml tarball 后续也只读检查了公开 options 类型。SRI 一致只证明与所取元数据一致；没有验证 npm 签名密钥链、provenance、维护者账号安全或发布过程，不作供应链认证与“无漏洞”保证。

## 2. yauzl 版本选择与已披露安全问题

- [GHSA-gmq8-994r-jv83 / CVE-2026-31988](https://github.com/advisories/GHSA-gmq8-994r-jv83)：GitHub reviewed advisory 精确受影响范围 `=3.2.0`，首次修复 **3.2.1**。NTFS timestamp extra 的 `getLastModDate()` 越界导致 `ERR_OUT_OF_RANGE`/进程崩溃；[上游修复 commit](https://github.com/thejoshwolfe/yauzl/commit/c4695215b05c6adffda613b9051a2a85429b33fe)。不调用日期函数可缩小暴露面，但不是选择旧漏洞版本的理由。
- 3.2.1 是该 CVE 最小修复版，不是当次最新版本。3.3.1 修复流 `destroy()`/异步迭代问题，3.3.2 修复少见 I/O 错误处理并移除 CRC 外依赖；3.4.0（2026-06-07 发布）保留这些修复并新增 Promise/entry iterator。依据所下载 3.4.0 README Change History 与源码，选 **3.4.0**，不是声称每个后续版本都在修新的 CVE。
- GitHub **仓库级** security-advisories 返回空数组，而 **全局** `advisories?ecosystem=npm&affects=yauzl` 返回上述 CVE；空仓库列表不能证明无漏洞。限定检索未发现影响 3.4.0 的另一条 reviewed advisory，不等于完整审计。
- yaml 查询命中 [CVE-2026-33532](https://github.com/advisories/GHSA-48c2-rrv3-qjmp)（深嵌套 collection 栈溢出；2.x 首修2.8.3）及 [CVE-2023-2251](https://github.com/advisories/GHSA-f9xv-q969-pqx4)（2.x 首修2.2.2）。2.9.0 不在这两条公布的受影响范围。buffer-crc32/Unicode 的同类查询为空，也不作无风险承诺。

## 3. yauzl API 是否足够

**足以充当 reader；只开所列五个选项不足以满足全部安全规格。** 3.4.0 已发布 tarball 的 `index.js`/README 和 @types 3.4.0 共同确认：

| 公开面 | 确认行为及工程用法 |
|---|---|
| `fromBuffer(buffer, options, callback)` | 支持已限20MiB、归 worker 自有的 Buffer；不需要真实文件路径；不会替调用方复制/冻结输入。`autoClose` 对此入口无作用，终止资源仍由 worker/streams 负责 |
| `lazyEntries:true` + `readEntry()` | 逐条中央 entry，含目录全部计数；先完成全部元数据验证，再开始提取。不要边发现路径边写输出 |
| `decodeStrings:false` | 原始名称/注释保留 Buffer；不会应用 Unicode Path extra，也不会自动验证文件名；`strictFileNames` 此时无效。使用有明确 Buffer 类型的 `entry.fileNameRaw`/`extraFieldRaw`，不要假定 `entry.fileName` 是 string |
| `validateEntrySizes:true` | STORE 提前核对声明尺寸、默认 inflate 输出核对 uncompressedSize；不是总量/压缩比/CRC/descriptor保证。在 raw stream + 自己的 inflater 路径，应用必须主动核对实际 u |
| `readLocalFileHeader(entry, {minimal:false}, cb)` | 公开完整本地头与 `fileDataStart`；默认 openReadStream 内部只用 minimal:true，不比较本地与中央元数据 |
| `openReadStream(entry,{decodeFileData:false},cb)` | 提供原始压缩 payload，STORE/DEFLATE统一可用；应用可接公开 `node:zlib.createInflateRaw()`，保留自己的 inflater 以核对实际压缩输入消耗 |

**命名纠正：没有需要调用的独立 `readStream()` API；`readStream` 是 `openReadStream` 回调返回的 Readable。** 生产可保持 callback API，仅做本域 Promise 包装；无需引入新的 archive 抽象。

### 3.1 已发现的精确版本注意事项

- @types/yauzl 3.4.0 仍将 `fileName`、`fileComment`、zip comment 标为 string，没有表达 `decodeStrings:false` 的 Buffer 分支。选择 `fileNameRaw` 等公开字段可避免 `as string` 或全局类型补丁；运行边界仍检查 Buffer。
- **3.4.0 实际发布源码 `index.js:575` 为 `decompress = options.decodeFileData !== true`**，与 README“true会解码”不符。因此本方案固定 `{decodeFileData:false}` 取 raw bytes，绝不显式传 true 期待 inflate。默认省略选项的旧 callback 解压路径源码仍会 inflate，但会隐藏压缩消耗计量，不作为本验证器的最终数据路径。
- 同 tarball `openReadStreamLowLevelPromise` 包装调用了 `this.openReadStream(...)` 而非 low-level 方法；不使用这个新增包装。该发现是静态源码缺陷迹象，本轮没有执行第三方包复现，也未创建外仓 Issue。
- `openReadStreamLowLevel` 本身文档明确无整数/压缩/加密参数校验；这里不需要直接调用。坚持 `fromBuffer`、`readEntry`、完整 `readLocalFileHeader`、raw `openReadStream` 即可避开上述不用的分支，不降级回3.2.0。

### 3.2 应用必须保留的检查

1. **EOCD/中央目录有限结构**：从同一原始 Buffer 做有界结构核对，检查 EOCD 和 comment 终点、中央偏移/长度/条数/单盘字段、每条记录长度与中央区间；拒 ZIP64 sentinel/locator/extra、多卷、越界、重叠、重复 offset、截断。yauzl 支持 ZIP64且忽略部分 EOCD 字段，不能靠其“能打开”放行。只补不暴露的原始字段检查，不另建解压库。
2. **本地头一致性**：逐条调用完整本地头 API，比对原始名称、flags、method及须一致的版本/相关元数据；检查 local header、payload、descriptor 和中央目录互不重叠且边界自洽。extra 的合法差异不能机械要求全部 bytes 相等，但结构必须严格有界、禁止类型必须拒绝；不以库宽容解析掩盖残缺 extra。
3. **descriptor**：bit3未设时本地 CRC/尺寸必须与中央一致；设时按合法占位规则接受本地值，在经核实 payload 末端验证12字节无签名或16字节带签名的普通 descriptor，其 CRC/c/u与中央及实际值一致。拒 ZIP64 descriptor、截断、歧义或不匹配，不在任意 payload 扫描 signature 猜边界。signature与CRC同值时依据完整字段及区间判定，无法唯一判定则拒绝。
4. **类型/名称**：只接受已批准 STORE/DEFLATE、普通文件/目录；检查 flags、外部attrs、extra所携链接/特殊文件信息，拒加密/设备/链接等。严格UTF-8 fatal解码；未设UTF-8位时可用公开低层函数复用ZIP定义的CP437解码，但须自行严格检查Unicode Path extra的版本、CRC与UTF-8、中央/本地编码信息及歧义；不能依赖宽松 Buffer UTF-8替换字符。逐组件NFC及固定15.1 full fold后再NFC碰撞；保留剥层前后路径、深度、字节、文件目录冲突及平台等价规则，不把整个输入限制成ASCII。
5. **实际压缩/解压量**：raw流统计cDelivered；DEFLATE接应用持有的 `createInflateRaw`，结束核对 `inflater.bytesWritten`、cDelivered、结构声明c相等。不能把“投喂过的字节数”当“实际消耗”；尾随padding/拼接stream不能成为ratio分母。逐chunk核对单文件/总u及 `u≤100*cBudget`，结束再以确认消耗c复核单项与总比；不为计数把所有输出汇总内存后再检查。STORE要求实际u=c；目录零输出且不贡献ratio分母。中央header/comment/填充不计c。
6. **CRC**：对每个普通文件实际解压 Buffer chunk 增量计算，与中央CRC及descriptor/有效本地值比对；空文件同样验证。yauzl README明确“不做CRC-32校验”，内部名称extra CRC不等于文件payload CRC。CRC用于损坏检测，不作密码学认证，原字节内容哈希职责不变。
7. **资源/错误**：所有入口限额、1000条、SKILL.md 1MiB、资源10MiB、总100MiB、64KiB frontmatter和30秒worker预算均按原规格；监听zip、raw、inflate、下游错误，失败销毁链，取消/超时terminate worker并等待退出。不能仅Promise.race或以destroy代替worker退出证明。最终真实落盘的no-follow/root/platform检查仍属于未来提交方。

压缩消耗证据：已读 [Node22.0 zlib公开文档](https://github.com/nodejs/node/blob/v22.0.0/doc/api/zlib.md#zlibbyteswritten) 与 [实现](https://github.com/nodejs/node/blob/v22.0.0/lib/zlib.js)，计数累加 `availInBefore-availInAfter`。本机 v25.8.0 **仅内置模块**探针：17字节deflate输入→consumed17/output15；追加9字节padding→offered26/consumed17/output15。最低22.0的实际执行、chunk切分、拼接流、early-error仍须工程fixture覆盖，不能以v25运行替代。

## 4. Unicode 15.1 Default Full Folding

选择 npm直接dependency，不vendor大表、不在运行时联网。2.0.2 包没有 `exports` map，package main是 `index.mjs`；**不要导入顶层main期待折叠函数**。所需公开已发布子路径为：

```ts
import common from '@unicode/unicode-15.1.0/Case_Folding/C/symbols.js';
import full from '@unicode/unicode-15.1.0/Case_Folding/F/symbols.js';
// 两者均 Map<string,string>，同目录 symbols.d.ts；.js为CJS default互操作。
// 对逐组件NFC后的字符串逐code point遍历：full.get(ch) ?? common.get(ch) ?? ch；
// 拼接后再NFC。不要应用S/T，也不要locale lower或按UTF-16单元遍历。
```

- 也有 `C/code-points.js`（`Map<number,number>`）与 `F/code-points.js`（`Map<number,number[]>`）；不是普通code point集合。2.0.2还提供 `.mjs`，但现有TS Node16配置优先 `.js`配套`.d.ts`，不用为了数据导入升级tsconfig。
- 只读解出code-points模块中base64/gzip承载的JSON，没有eval/require第三方JS。C **1426条**、F **104条**与官方15.1文本逐键逐值相等。symbols两个运行模块分别9688/788字节；整个npm包约1.05MiB压缩/2.69MiB展开、11681文件。选择直接声明承担包管理成本，避免复制整个Unicode表到产品源码。
- 模块内部使用Node内置gunzipSync载入固定发布数据，属于未来runtime导入行为，不是包脚本或不可信上传的inflate；建议在校验worker内载入。默认模块Map不向其他调用方暴露、不得修改。
- 数据例：`ß→ss`、`İ→i\u0307`、`Σ/ς→σ`；应与ASCII/NFC/扩展字符边界共同进入工程fixture。未知于15.1表的字符保持自身，不能补用宿主Unicode17的lower。

### 4.1 官方文本备用证据（本方案不采用vendor）

[Unicode官方15.1 CaseFolding.txt](https://www.unicode.org/Public/15.1.0/ucd/CaseFolding.txt)：**84870字节**，SHA-256 `4e55acfdc32825a22e87670e9056a3bf94ad7c5400065778e9e10f8314372bcf`；header为CaseFolding-15.1.0、2023-05-12、©2023 Unicode；C1426/F104/S31/T2。官方说明明确full用C+F、默认排除T。

npm包声明MIT，但tarball条目未发现独立LICENSE文件；不能把此简化为Unicode原始数据也是MIT。[Unicode terms](https://www.unicode.org/terms_of_use.html)、[当次官方LICENSE](https://www.unicode.org/license.txt)提供 **Unicode License V3**，允许使用/修改/分发并要求保留版权许可通知（文件或配套文档）。当次license.txt 1995字节，SHA-256 `e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96`，版权1991–2026；该URL会更新，不冒称2023历史文本原封不动。本报告不是法律意见；分发方按现有THIRD_PARTY_NOTICES流程保留npm MIT声明及Unicode通知，不通过随意vendor绕过许可。

## 5. YAML 与 CRC 最小用法

**YAML**：2.9.0根exports为types `./dist/index.d.ts`、node `./dist/index.js`；公开 `parseDocument`/AST访问足够。保留工程报告的strict、uniqueKeys、stringKeys、customTags:[]、resolveKnownTags:false、merge:false、logLevel:'silent'，显式YAML1.2；errors/warnings都检查，AST先拒Alias/自定义tag再`toJS({maxAliasCount:0})`和字段投影。`customTags:[]`不是自动拒绝所有tag的独立证明，`maxAliasCount:0`也不替代AST拒Alias。多文档、重复键、复杂键、别名、自定义tag、超长frontmatter及深嵌套必须作为产品测试；parser读取前按原始字节执行64KiB/1MiB预算，不替换成手写YAML parser。

**CRC**：[Node22.2.0官方文档](https://github.com/nodejs/node/blob/v22.2.0/doc/api/zlib.md#zlibcrc32data-value)标注`zlib.crc32` added v22.2.0，22.0文档无此API，因此`>=22`包含不能用内置CRC的22.0/22.1。最小选择是**统一使用buffer-crc32 1.0.0**，不提高engines、不增加runtime双实现分支。

```ts
// 现有 module/moduleResolution=Node16；明确走包的require公开exports及.d.cts。
import crc32 = require('buffer-crc32');
let checksum = 0;
// 对解压后的每个Buffer：checksum = crc32.unsigned(chunk, checksum);
// 结束与entry.crc32作unsigned数值比较；不要以大端Buffer直接和ZIP小端字节比较。
```

buffer-crc32公开exports：import `./dist/index.mjs`，require `./dist/index.cjs`。发布`.d.mts`仍含`export =`，直接ESM default导入的TS兼容性不在本轮实跑范围；上述TS import-assignment选择CJS公开分支，避免依赖有疑问的.mts形状。工程应在现有strict配置实证，不添加@types旧版本或修改外包声明。

## 6. 最小package/lock改动及任务本地安装建议

**这里是下一位获授权依赖工程的执行方案，本轮均未执行。** 代码实现另按既有T03写面。工程80正在准备共享依赖/build，主理人先收集其结果再串行安排依赖改动；本代理不直接协调、覆盖或拆其链接。

1. 产品跟踪文件仅 Market `plugins/omnimux-market/package.json`新增上述4 runtime+1 dev项，以及根`pnpm-lock.yaml`中Market importer、相应package/snapshot及必要传递项。yaml2.9.0/现有@types/node若已锁则复用；新增pend通常1.2.0。保持lockfile版本、其他importer、file:外包路径、engines、scripts、peer、tsconfig不变，不全仓update/dedupe、不新增npm package-lock。许可通知按既有发布流程处理，若需要改THIRD_PARTY_NOTICES须由主理人把该文件明确纳入后续工程写面，本轮未改。
2. **禁止在任何指向主树/外仓的node_modules链上执行add/install。** `--filter`和`--ignore-scripts`都不保证文件写入隔离；先用lstat/readlink/realpath逐级检查任务root及Market/node_modules、`.pnpm`、store、缓存的归属。不能用`rm -rf`跟随清共享依赖。
3. 新包能力验证先在任务树内独立临时项目（例如`<task>/.task-tmp/validation-deps/`），使用仅含上述公开registry依赖的临时package、独立node_modules/store/cache；没有workspace成员、没有`file:`外包、没有prepare/postinstall。与真实Market工程构建分开，不能把临时项目通过误称正式Market通过。
4. 可用**已有npm二进制**在此临时项目安装（仅为后续建议）：`npm install --ignore-scripts --package-lock=false --no-audit --no-fund --workspaces=false --cache "$TASK_TMP/npm-cache"`；cwd必须是该独立临时项目。不要用npx下载工具、Corepack自动全局引导、全局cache或全workspace递归postinstall。临时package中精确声明本报告版本；未使用此命令验证，也未安装任何包。
5. 正式pnpm lock由授权依赖负责人用仓内固定pnpm版本在**任务本地、非共享链接的隔离解析工作区**生成；带`--lockfile-only --ignore-scripts`、task-local `--store-dir`及cache，保留完整workspace importer拓扑和原始file:依赖语义，不把临时绝对路径写回正式lock。若需workspace镜像，仅复制必要清单/配置/lock，外包只读解析，不能运行其build。无法维持相同importer/file语义时停止回填，不手造SRI或从独立npm安装拼一个假pnpm-lock。
6. 正式测试的依赖装配必须由单负责人在工程80退出后完成：将task的包级node_modules做成**真实任务本地目录**，新依赖链接只指向task-local安装；复用旧依赖时可逐项只读链接到已证旧包，绝不向其目标写入。根与包级目录、.bin、@types作用域均检查，不通过NODE_PATH、源码fallback loader或`.pnpm`绝对路径消费生产新依赖。若改用全本地pnpm安装，同样隔离node_modules/store/cache且`--ignore-scripts`，只显式执行Market的已批准定向编译/测试，不递归workspace build。
7. 回填前审查package/lock diff仅覆盖上述闭包，安装后逐项核对实际resolved版本和tarball完整性；strict/noEmit先行，再运行T03定向fixtures及worker终止测试；与工程80已有baseline区分。正式全包build会删除跟踪lib，只能由获授权工程按原任务流程运行并记录其生成面，不能在本轮替跑。

## 7. 收口与剩余验证

本轮已完成：主源版本/许可证元数据、yauzl关键API源码/类型、CVE首修范围、Unicode C/F逐项数据一致性、官方文本指纹体积、Node最低CRC公开证据、内置inflater有界探针。一次可选重复tarball详情读取出现TLS `UNEXPECTED_EOF_WHILE_READING`，改为固定已知tarball URL做一次有界重试成功；未关闭TLS校验。read skill更新检查脚本经只读检查会写全局cache，本任务禁止该写面，故未运行更新检查或安装skill依赖。

**尚未验证**：第三方实际运行/Node22.0与22.1 strict兼容、恶意ZIP/descriptor/编码/CRC/阈值fixture、worker终止、最终锁文件最小差异、正式依赖装配与Market构建；这些交授权工程及独立QA，不是选型未决或要求用户重选。尤其3.4.0不用的API静态问题已明列，需对本方案实际使用路径作fixture证明。

文档检查：限定本文执行 `git diff --check`（未跟踪文件无diff可查），另用Python直接检查末尾换行、所有行无尾随空白、围栏成对、本地引用路径存在，结果PASS；HEAD未变。未执行产品构建或测试。

本报告只解除“精确依赖选型未知”，不宣称验证器安全认证、功能PASS、#773/#775完成或外部公共能力门槛解除。下一责任人为主理人：串行安排合法依赖准备和既有T03实现，再独立QA；本轮不需要再作产品授权决策。
