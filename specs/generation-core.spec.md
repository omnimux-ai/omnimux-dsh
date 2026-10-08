# 共享生成纯规则基础（#3255）

## 目标、授权及本切片界限
用户2026-10-08批准#3247统一角色生图/生视频实施；本子票#3250下的独立基础切片，只搬已证纯规则并让中枢现有入口消费同一核心。禁止宣称单素材规则等于完整候选匹配；产品视图、完整可行性求解、消费者UI、上市、价格、路由、真实生成均不在本切片。

## 已读依据与新用户基线
父报告.agent-reports/generation-unification-20261008/shared-decision-extraction.md（232行）逐行复核：Hub units/codes/slots单素材纯规则可提取，两greedy不能当完整终局；普通sync只特判kit，不能新运行file依赖。新用户收到插件包时必须含内联规则产物，脱离开发仓库照常加载；缺生成物必须明确失败、不跨仓源码fallback。构建缺源必须失败，不静默沿用陈旧产物。

## 本切片成功标准
1. 新packages/generation-capabilities：private零runtime dependencies原生ESM JS、精确JSDoc+d.ts、sideEffects:false。仅提取现有units.js、GUARD_CODES稳定码、SLOT_ALIASES/getSlotAliases、validateAssetAgainstSlot函数，单一源码无Node/React/Hub私有模块/HTTP/读文件/环境/凭据。复制原函数后删除中枢重复实现、保留原path facade和导出签名；不能把全guard或legacy-operation-map搬入。
2. 中枢units/codes仅重导出；slots保持现有aggregate/greedy实现及assignAndValidateSlots/operationAcceptsAssets外形，单素材判据改import共享生成产物。旧成功/失败样本返回值、异常、Map、原asset引用与稳定codes全部兼容。本切片不顺手变更MIME未知、role回退、数量、累计时长等legacy政策；下一完整匹配切片另明确strict政策，不保留第二判断体。
3. 单素材共享package入口JS可被浏览器及Node bundle内联。中枢Host直接src，因此通过当前真正build-client.mjs入口先esbuild产出lib/generation-core.js(ESM neutral)；package files覆盖该产物。无新runtime file依赖、不扩sync/不改另一桌面仓。构建时package作为devDependency声明，pnpm-lock本地link importer须严格一致，lock治理不得广泛变更依赖版本。
4. 中枢原路径facade只依赖包内lib产物。允许生成物按Hub既有跟踪策略跟踪，source digest标明生成身份，重建证明确定相等；不把手抄源码当bundle。不复制源码到src/generated或跨profile软链。
5. hard tests真实检测package源码纯度、无外部runtime imports的bundle、自有temp内npm pack→解包→只执行这些原facade离开repo可工作。隔离解析阻止node_modules向上漏入或../../packages路径。本scope不导入全index.js证明所有provider正常，只证明核心facade闭包。故意删除产物必须失败、不fallback；fixture source改后实际build会换产物，不能重用过期文件假绿。
6. 核心test是真实低层反例而非重复函数常量：大小边界/时长/role/alias/MIME/缺metadata/异常、原slots标准fixture对照。先引入期望单真源和纯度/relocation反例得到红，再搬规则得到绿；不弱化既有断言。

## 后续已固定方向（不在本切片做）
完整求解基于同核心：显式绑槽优先+确定性回溯+剪枝，inputGroups及总数量/累计时长同时检查；超预算indeterminate不可提交。新产品strictMimes仅在已声明非空allowedMimes时未知不ready；用户显式role与targetSlot矛盾拒绝，不按两图猜首尾；options与range并列域，显式option命中不再二次range覆盖，range分支含step与合理浮点容差。legacy兼容字段不顺手拒；新参数白名单、唯一默认来源由产品定义。旧编辑/延长/digital_human保护、旧在途不标记回填。完整求解/参数新语义必须再写单独可测切片再实施。

## 写集、风格和验证
写集：packages/generation-capabilities/{package.json,src/index.js,src/units.js,src/codes.js,src/assets.js,types/index.d.ts,test/core.test.mjs}；Hub units.js、submit-guard/codes.js、submit-guard/slots.js；Hub scripts/build-client.mjs、package.json、lib/generation-core.js；新增src/catalog/generation-core-package.test.js；pnpm-lock.yaml由协调者负责。仅需规格/内部生成入口说明，公开返回schema/operation不变无需改公开合同。
先read真实现有源码，ESM、精准JSDoc、稳定typed results；共享codes不扩枚举。构建外部脚本枚举只调用build-client，因此不得只改package build命令。测试仅临时tree.tmp/3255自有fixture，禁止profile/Dev/Prod/重启/网络模型探测。
命令并集：纯包node --test/test type声明验证，Hub node scripts/run-tests.mjs及专项，正常build-client/重复构建字节比较，boundary/product-baseline/strict model-contracts，package files/relocation专项，diff check，impact判断browser=false。不跑无关全仓；CI远端完整套照required执行。

## 交付与回退
独立评审固定base/head/字节、PR关联#3255、完整required CI/Merge Queue后Dev安装字节核验（不重启，若Host未重读需如实说明）。本任务父#3250/#3247继续OPEN。回退整个PR恢复原纯规则，无用户数据迁移；不能只删产物留下facade导入。#3244独立图片成果不复制未提交。
