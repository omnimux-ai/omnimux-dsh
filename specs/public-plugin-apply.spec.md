# #3326 精准识别公开插件安装入口

Parent3312。用户本会话明确允许修复测试保护误报并继续交付（2026-10-14约21:47）。基线6f7a4194c3c5536bf16578c149ffa21efe45a8b0。只scripts/test-authoring-inspection.mjs、guard-anti-cheat.mjs调用上下文、对应静态tests与合同一句，R1；不关闭保护/自述intent/豁免/官方或个人配置。严格旧原断言保留。

## Objective
允许已确认本项目插件真实静态公开安装函数的导入及直接调用，在测试候选语法检查中不把它当Function.prototype.apply。不是允许任何名apply/任意相对import，不能以字符串source伪装绕执行缩窄。

最小选择：不以测试路径白名单或apply文件名放宽；检查器接受调用者提供的只读import解析事实resolver。Guard根据filePath resolve本repo内静态relative源、真实内容AST证明导出function apply或只读固定reexport到同repo插件src/host/apply.js，拒源出repo、非regular/symlink、变动、未确认源、动态导出/传递。public imported apply binding只能直接CallExpression，不允许赋值/重绑定/传参/导出/alias其它binding/成员apply/call/bind/reflection。return apply绑定值拒绝；return apply(ctx)与普通安装返回结果检查允许，立即apply(ctx)()或new (apply(ctx))()拒绝；不扩展通用结果taint，存入变量后的未知有限结果流不能声称安全。源函数能够做正常plugin运行但不是test的任意动态js安全证明，因此来源核对仅用于已确认public API（repo plugins/*/src/index.js→host/apply.js）；来源自身不能newFunction/eval/skip外包伪造。读取仅代码不执行source。

更简单可优先：提供布尔静态verifiedImports map由guard固定解析，不信toolinput/user意图。检查完整JS仍必须parse；source parse或path异常failclosed。所有newFunction/eval/constructor/call/apply/bind、computed、spreads、危险内建imports、skip/only/todo继续deny。

## Agreed seams/tests
inspectTestAuthoring纯公共接口和guard.handle完整write/edit真实候选；静态合法Plugin入口case在旧版本真实deny→新allow；任意fake相对路径apply、nodevm/childprocess、function.apply、plugin.apply、namespace/applyalias逃逸、绑定重赋值/return传参/only false、skip/todo多值、动态source和跨repo/symlink拒。不能删除旧14/quality27/registry tests或放宽expected。

## Project/style/commands
scripts目录具名ESM/acorn既有不新deps，guardstdin JSON decision保存EventName。新JS静态test不得import namedapply来再次被旧gate阻，用字符串source合法候选测试。node --test scripts/guard-anti-cheat.test.mjs scripts/guard-quality-loop.test.mjs与新typedJS tests；pnpm test:gates按影响必跑若原存量failure固定base对照如实，不skip。git diff --check/linkedcontract。独立非实施Agent固定commit/source review，requiredCI/MQ，mergeconfirmed后ship纯脚本文档不Dev。

## P1 repair acceptance
Actual main-loaded/task-loaded guard routing to an existing registered sibling task target disproved the former single-checkout requirement. The user explicitly approved precise same-repository registered worktree selection, not cross-repository authority. Derive the shared common Git directory from the guard's own verified checkout. Select only its main root or a directly registered mainRoot/.worktrees/task root with canonical regular .git pointer, matching common directory, reciprocal gitdir and exact registry record. Reject nested repositories and non-direct task roots. Target and every source must remain in the selected tree; use that tree's fixed HEAD and jointly recheck registration metadata, source, target and ancestors after all Git queries. Tool cwd only resolves relative input; tool-supplied facts, I/O or approved values never establish authority. Existing write/edit targets must be canonical regular files in this selected tree, not symlinks or special files; only an ENOENT write leaf may be new, with existing canonical directory ancestors. Reconstructed edits use the checked descriptor bytes and target identity. Reject the root itself with bounded root-to-leaf traversal. Fix one HEAD generation per inspection; confirm all entry/host bytes against that commit, then jointly recheck every source and ancestor identity, target identity, and current HEAD after the last source AST read. These are write-time observations, not persistent authorization or a guarantee about later execution. Add deterministic public-handle regressions for target-own symlink write/edit, canonical source symlink, source/entry/ancestor replacement at Git child return, and HEAD changes; never execute candidate strings. Keep original anti-cheat 14, quality 27 and registry files/expectations unchanged. Run the unchanged full test:gates script via node --run and record skips/failures with a fixed baseline comparison; no shared installs or gate weakening. Scope stays the four implementation files plus this spec, not AGENTS; no commit/push by the repair author.

## New user / bounds
不是产品功能，无dev路径runtime变化。只任务worktree，主镜像只merge后ff。审批来自上述用户直接选择，不在tool参数生造approved字段。保持所有保护，precision界限若需要扩通用授权系统另问。不能为赶3312恢复test而无独审合入。
