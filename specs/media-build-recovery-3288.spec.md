# #3288 本次媒体生成物限定恢复

## 目标

仅恢复#3283交付构建产生的单文件未提交差异，用户已授权精准恢复及自主决策限定恢复通道。不得恢复任何其他文件或关闭主检出保护。

## 基线与成功标准

基线f3876a31bc126e41d3033ea7a11846afc214088d。当前已知变更文件plugins/omnimux/lib/video-inspect.js，SHA256为0f17992b82ec8b0a9864835fc68c7c5b6eaa29a71365e4aa20ec265cfd3048a4。恢复通道仅在已合并main执行、HEAD=origin/main、唯一dirty路径精确相同、无staged修改、目标/祖先普通受管、哈希相符、备份已成功时允许写入HEAD版本；恢复后完整字节/模式匹配并记录回执。

## 结构与合同

新增scripts/recover-media-build-3288.mjs，只通过固定调用执行；hook仅精确允许node scripts/recover-media-build-3288.mjs --apply，拒绝额外参数、shell串联或替代路径。恢复脚本本身按固定目标/哈希/当前Git身份校验，不使用任意file参数。不引入环境变量绕过。

## 验证

先新增运行失败测试，拒绝错误哈希、linked/非main、staged、其他dirty、symlink等；通过合成Git临时仓库证明只恢复本次目标，回执与备份验证。完整既有guard测试和相关gates保持。独立安全审查、正常PR/MQ合并后才执行真实恢复。

## 边界和计划

先核对共享备份工具并保存本次源；限定实现与失败先行回归；review/CI/正常合并；仅执行已合并入口恢复本次生成文件；继续构建修复PR3287合并与Dev交付。生产/凭据/otherworkspace/业务素材禁止。不跳过dirty-source或构建保护。

## 文档影响

本规格记录一次性恢复范围；将精确通道用途记录代码中，不扩常规主线写权限。
