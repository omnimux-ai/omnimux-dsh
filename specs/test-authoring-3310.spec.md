# #3310 有界JS测试候选编写

Parent#3301 PhaseA#3302用户已批准。MDbootstrap已交付，正式测试仍旧hook默认deny。此次修写前分类以完整语法而非skip字符串扫描，让可核JS正常候选能形成；不是完整阶段A，不假认证独审来源，不放开unsupported语法。

## 范围
scripts/test-authoring-inspection.mjs复用已锁acorn，无新dependency，parse完整JS/module/hashbang，AST真实member/option/import selector skip/only/todo拒；空白/评论/quoted/转义成员同一节点判；字符串/评论/URL不当实际skip执行。已识别动态member/option/import/eval/Function和内建代码执行模块保守拒，TS/JSX/incomplete拒；不是任意JavaScript沙箱，未知第三方函数和所有间接执行不在安全证明内，旧标准及执行范围仍需独立审查，明确布尔false选项可编写；Node实际将0/null/空string视为跳过或待办，不能按JavaScript假值放行但旧标准独审仍必需。未知别名不冒全JS分析，只声明该保守语法判据。
guard-anti-cheat保持production/approved原行为暂不改，原test_authoring兼容字段不新增来源。默认JS测试不需自设intent；edit重建实际整个file，再完整parse，oldmatch不唯一/不可读拒；write完整候选parse。Markdownbootstrap保持。
manual登记helper，不叫真实CI接入；本slice规格、拥有合同一句明确限制。正式test受root旧hook拒不换shell/name/intent；原14/27与inline正负真实CLI先验，正常可编写新root后再新增正式test固化、full权限边界+旧标准reviewreceipt后继闭合。保existingBLACK003 describe.skip deny。

## 验收
normalassert JS、URL/string.skip示例允许；三轮真实skip形态dotspace/comment/bracketquoted/quotedobjectkeycoloncomment/skip1全部deny；computedunknown/dependenttruth/eval/dynamicimport拒；false explicit正例。完整edit引入skip即deny，删改注释正常上下文不要求newstring重复assert。不能用通过数量替代旧标准diff审查。

## 验证
node--check/helper+guard；node--test原anti/quality套件保持；inlinepureAST和stdin真实CLI，先旧normaldeny新allow，mutationreturnallow强负例红后restore绿；fulltest:gates原存量stylefail如实不刷绿。定向源码文档不产品browser/物化；必要锁定depsignore-scripts本树。

## 交付
独立固定base/head/spec/sources审查，requiredCI/MQ正常，MERGEDtimeSHA后ship源同步；artifact原件主.agent-reports核保存再清树，不prod/official/crossrepo/global/realvideo/pay/nightreview。若独审发现通路不绕，继续收紧最小范围或撤候选。