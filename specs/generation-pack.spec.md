# #3259 已内联纯规则包的离仓物化打包纠正

## 目标与事实
#3255/PR#3257已正式MERGED9d617d99bf68c958bc2ba337d9bf447cbed06819。正式sync-to-app omnimux成功构建/复制/安装，但最后受管副本pnpm pack --dry-run核验exit1，ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL @omnimux/generation-capabilities devDependency workspace:*未装；脚本恢复暂存file安装入口。不能把前几步成功叫Dev安装完成。用户#3247批准连续交付覆盖本直接回归修复，无生产/桌面重启授权。

## 最小修正与新用户基线
Host核心已内联且只相对lib，无runtime shared依赖；build-client使用明确相对src入口并不import共享包名字，workspace build依赖若确实冗余可删该edge及锁三行，保留pure workspace importer。已实读builder：coreRoot相对源目录、entryPoints为src/index.js，不消费共享包名；本切片删除Hub冗余devDependency及锁对应三行，保留pure workspace importer。禁止runtime新增file，禁止sync剥掉问题字段/跳检查、复制packages到profile、修改profile包或安装sharedtarget。新用户仅需正式Hub自身产物，不依赖开发仓。

## 验收、结构与写集
先read真实Hub package/build-client、正常sync-stable.sh真实物化与pack段。增加现generation-core-package.test.js中的真实corepack pnpm --config.ignore-scripts=true pack --dry-run反例：任务自有.tmp/3259造受管样式Hub副本（实际source files包含lib产物，但没有packages、没有node_modules、无pnpm-workspace），真实pnpm11.7.0入口，pack不跑构建/隐式prepare。必须先旧workspace声明真红exit非0且准确code，修后相同目录/相同命令绿并核lib产物列出及corefacade包内闭包；不能只npm pack绿、不删除或改弱已有npm隔离与pure/scope断言。
src/core/shared/bundle运行字节不得改；manifest及lock只删确实冗余edge（或经实证file）且不改任何registry版本，builder未变仍fresh重建六源digest；整套现pure/pack4、core5、相关Hub至少正式包测试跑（依赖正常解析或明确task-only已锁TS临时工具，remoteCI正常frozeninstall再证）。新作用域门、Map/asset身份、缺源缺产物拒绝保持。cached diffcheck、边界/productbaseline/impact(browserfalse)、真正pack外依赖禁止。
仅Hub package.json、pnpm-lock.yaml、Hub src/catalog/generation-core-package.test.js、本spec；不新增构建入口/改sync/CI/governance/publicschema/model/profile/tool/价格。

## 测试及命令
node --test --test-name-pattern=materialized src/catalog/generation-core-package.test.js先红；正式node scripts/build-client.mjs；core/package全scope+TS正负原证据；corepack pnpm --config.ignore-scripts=true pack --dry-run --json（fixture workdir明确）；Hub正常run-tests；verify-plugin-boundaries/product-baseline/model--strict/impact/diffcached。fixture/n​​pmcache仅自有.tmp/3259 finally清理；logs真实exit保留，不继承真实凭据。规格拥有内部打包验收，公开contract无变化。

## 本切片验证与交接边界
新增materialized测试在任务.tmp/3259复制实际Hub全部受管源（排除node_modules及*.test.js/*.spec.js），仅做同步原有的kit路径与development渠道元数据转换，不剥devDependencies；先写旧workspace声明并精确验证pnpm JSON错误code，再恢复当前manifest以同目录同命令打包。子进程环境仅PATH/HOME/TMPDIR及自有npmcache，不继承凭据或TS工具alias；fixture及cache在finally删除。保留全部旧pure/scope/MIME/Map/asset/boundary/npm隔离/缺产物/缺源断言，仅临时根由3255改为本任务3259。实际源打包508项，低facade闭包4项。所有旧scope5+4+新pack共10项绿；Hub正式347测试文件、网络守卫2项及其余3240项全绿，无fail/skip。TS5.9.3源码与声明正负消费者、正式build、边界/基线/strict/modality/impact全部出口0；impact browser=false。
本子任务只本地实施/验证并freeze交父独审，不commit/push/remote/profile/生产/重启，不把pack验收声称为全Hub离仓安装或Host实际加载。公开contract无变化，只此内部spec更新；cached diffcheck必须含本untracked spec以关闭EOF漏检。

## 父协调交付
固定字节独审、当前requiredCI/MQ真实MERGED，主干ff，正式sync-to-app仅omnimux Dev无重启，源码/受管/安装manifest+core+facade字节一致、出口0才闭合；仍不声称Host实际加载/生成。保持3255tree证据直到这项成功，届时只清自有两个已合入树。#3256在独立树可并行纯规则实施，但合入前应吸收本pack闭合不重引workspaceedge/旧test。回退本PR只依赖元数据，原runtime产物不变；不得生产/其他仓/桌面重启/实际video。
