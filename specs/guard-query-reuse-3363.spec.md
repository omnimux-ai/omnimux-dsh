# #3363 同次判定同目录查询复用

## 目标
既有decideMainCheckoutBuildCommand公开入口中，同一次同步判定、同一resolve后的完整currentCwd首次执行原查询链，后续同cwd复用结果；不跨调用、不按共同root/realpath合并。cd新目录首次重新查，返回可复用。不是旧来源观察实验恢复，不证明其超时唯一原因，不改变hooks预算或权限。

## 写集与设计
仅scripts/guard-worktree.mjs、scripts/guard-worktree.test.mjs与本spec。函数内Map，首次仍原顺序isWorktreePath(cwd)→gitRoot(cwd)→root非空时isWorktreePath(root)，相同短路与原错误返回。模块级缓存/私有测试出口/新deps参数/新runner/执行意图豁免禁止；写目标/Git错误/其他后续安全判定不复用。同步请求是元数据快照，不承诺外部并发变更逐时刻等价。

## 正式测试公共接缝
复用原测试现成临时真实primary/registered worktree与PATH fakeGit模式，通过既有公开decideMainCheckoutBuildCommand或decideBashCommand，命令文本只作为数据。临时Git wrapper仅追加调用日志后exec绝对真实Git，不能伪造元数据或吞exitstderr。首个固定字面量案例：同cwd多段新普通文本与单段查询链同为7次（旧实际14次或更多RED→最小改GREEN）。后续逐纵切验证cd不同完整cwd/返回复用、主↔worktree旧决策与同模块两次请求不缓存。保留原全部旧测试/错误QA语义；不得将来源观察、3342/3343/3357受拒payload搬入测试或缩改重送。

## 实施后实测状态（如实收敛本轮交付）
首例已真实完成 RED→GREEN：旧实现单段查询链 7 项、两段普通文本 14 项，断言失败后最小函数内 Map 修改，完整 `node --test scripts/guard-worktree.test.mjs` 67/67 通过 0 skip。第二完整cwd案例（同 root 子目录不合并与返回复用）在正常测试编辑中被作者门禁硬拒，原文『测试用例与断言属于只读评估契约，严禁新增执行风险；旧标准变更仍须独立审查。』独立静态复核确认被拒正文确实新增数组展开风险形状；该载荷已保存于实施报告并保持停止，不挪位置、不改字面量、不拆送、不换工具/别名/helper。
因此本轮实际覆盖只含：同 cwd 普通文本重复查询合并、有序链完整核对，以及跨调用复现完整首次链（部分排除跨请求缓存）；显式 cd 新目录/返回复用、主↔registered worktree、包修改/direct vite/esbuild 完整对象、连续两次显式调用与独立 QA 仍未覆盖，不得据此宣称规格全部达成或原超时唯一根因。

## 验证与交付
定向guard-worktree.test.mjs、guard-worktree.qa.test.mjs及相关现有测试；node --check/diff --check/impact；适用fullgates最后父运行，已知本机宿主缺失失败保原件不skip刷绿。固定候选独审、requiredCI、nativeMQ实际merge、标准ship，无插件运行码无需Dev。测试写前先读现文件，正常工具安全deny/timeout停止整个受影响请求，完整保payload与返回，不换工具/helper/分拆重送。无依赖安装/refs/remote/App/profile/official/global写（父后交付另按既有授权）。

## 新用户基线与非目标
开发检查脚本使用现有Git/Node，不要求产品用户新配置。工具缺失/查询错误保原语义，缓存不把unknown提升allow。性能收益须实际有限数据，不承诺所有命令或原来源观察可恢复。