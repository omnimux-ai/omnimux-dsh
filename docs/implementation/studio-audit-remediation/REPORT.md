# Studio 审计整改工程报告

## 结论

IS_PASS: NO。已有可审查的前端实现与17项通过的离线测试，但不是完整验收交付。L2 readiness: NOT READY（依赖安装/lock及真实Host浏览器证据未闭合）。禁止据此合并、发布或称F01–F14全部关闭。

工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/studio-audit-remediation`；分支 `agent/studio-audit-remediation`；base `93a36e19e59fb8b7b7ee0ad32e08f46efe12f137`。交付commit请以本报告所在提交的Git HEAD核对。

## 已执行证据

- Node插件测试17/17，0失败/skip，包括实际React+jsdom编辑事件（UI kit Button为测试替身，非真实浏览器）。
- build-client成功，最终本地输出171868 bytes，输出不纳入源码提交。
- verify-plugin-boundaries通过：2232 sources。
- verify-stage-contracts通过：11 Stage、8已有sidebar targets；本插件另外有十轮注册/释放单测，不将8个targets当Studio live验收。
- scan-ui-gates exit0（最后一轮新增不兼容引用提示后尚未重跑）。
- git diff --check及cached check通过。
- 所选仓库gate suite149 tests：128通过、21失败，exit1。14项临时fixture无法resolve pngjs，1项fixture esbuild缺失，4项Corepack离线无法获取pnpm11.7，2项CPython双架构制品缺失。未改门禁或测试绕过失败。
- 默认pnpm --filter omnimux-studio test自动install失败，ENOENT主仓personal/dsh-ui-kit。设置pnpm_config_verify_deps_before_run=false后17/17通过，只证明现有环境可测试，不证明安装可复现。

## F01–F14 对应实现与限制

| 项 | 实现/证据 | 未关闭事项 |
|---|---|---|
| F01 | 移除Header及旧SVG池，Stage无全局chrome；静态测试 | 原型视觉对比未做 |
| F02 | CSS全部data属性作用域；依赖effect拥有style disposer | kit全局影响、浅/暗Host未验证 |
| F03 | 局部滚动容器、dock/overlay，无fixed | 参数栏仍wrap，窄屏和像素基线未验证 |
| F04 | tuple scope registry，空身份拒绝，5种隔离组合 | Host真实scope切换未验证 |
| F05 | Mock任务与下载文案；媒体ready/error与实际元信息 | 在线媒体/版权未核；media状态为组件局部状态 |
| F06 | remaining-time暂停恢复、cancel/dispose、epoch/attempt保护 | 浏览器卸载重载待QA |
| F07 | 有序UUID文本/Token，URL语法，Enter/IME/两次退格测试 | CJK真实输入法、粘贴和焦点完整矩阵未做 |
| F08 | 主区和详情同DraftWorkspace/store；Agent dock保持Agent草稿 | 不提供刷新持久化/deep link；真实导航待QA |
| F09 | 精确12/4/6模型及cost；三维AND过滤测试 | 菜单视觉/可访问性待QA |
| F10 | 冻结request、UUID、余额/批量/退款测试；引用槽不兼容阻止 | 未覆盖畸形外部文档，类型声明需再核对实际result |
| F11 | 社区依赖声明；locale register/bind、释放 | 实机冷启动/+菜单、干净安装未做 |
| F12 | inner.effect释放tab/locale/style/registry；十轮测试 | 真实依赖重载待QA |
| F13 | types.d.ts、类与scope实现、局部dialog焦点 | 未完成全量跨文件/图契约审核；原型全文阅读尚未完成 |
| F14 | 声明esbuild，无绝对路径build fallback；test入口 | 新workspace importer lock缺失，file依赖在嵌套worktree路径不匹配 |

## 版本归属与边界

只纳管任务树plugins/omnimux-studio及本目录。主仓原Studio symlink、兄弟payload、shared exclude均不修改；原型仅读取/hash，不修改。任务私有node_modules包含只读复用kit的绝对链接，未纳入Git。未新增真实工具、HTTP/provider客户端、后端或官方源码改动。未push/merge/Dev/Prod物化。

## 下一步（工程，不是已通过）

1. 在本任务树完成workspace依赖/lock闭合，避免沿用临时kit链接作为交付前提；只改本任务批准范围。
2. 完成设计/原型全文与全局一致性审核，补畸形document/参考槽/同步adapter/Agent详情回归与类型契约。
3. 按本仓plugin-qa合同由主理人独立QA在最终SHA绑定的单插件L2 profile执行ego-browser+verify:live。当前未启动Host、未建立profile、未使用HTTP或jsdom替代浏览器验收。
4. 修复QA发现后再给出IS_PASS，保持无push/merge/物化限制。
