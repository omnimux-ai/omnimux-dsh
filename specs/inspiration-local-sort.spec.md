# 灵感社区本地默认最新排序

## 目标与确认
Issue #1762。用户已确认按保存到本地的时间倒序；只调整本地默认排序，其他页签不变，仍可手动切换。

## 验收标准
- 打开灵感社区，全部页签仍默认热门。
- 点击本地，排序显示最新，首次请求使用 new；按 created_at 倒序排列而非原平台发布时间。
- 本地手动切换热门或收藏仍有效；切换其他页签不把本地默认最新泄漏给它们。
- 本次页面生命周期中保留本地手动选择，重新打开的新实例仍默认最新。
- 页面布局、配色、分页和筛选保持不变。

## 结构与最小设计
plugins/omnimux-inspiration/src/client/use-inspiration-feed.js 管理本地独立排序状态，复用现有 new 排序和 local-store.js 的 created_at 倒序，不增加后端排序逻辑。
测试复用现有渲染测试基础设施；不新增公共配置或持久化存储。

## 实施计划
1. 在既有行为测试中新增本地默认 new 与其他页签 hot、手动选择隔离用例，运行并确认正确失败。
2. 最小修改过滤状态，运行同一测试确认通过。
3. 在任务隔离工作树浏览器挂载真实组件，观察实际页签与排序控件，执行切换并保留截图与请求证据。
4. 执行插件测试及静态校验，独立评审。未通过检查不得合入。

## 命令与测试策略
node --test plugins/omnimux-inspiration/src/client/use-inspiration-feed.test.js
pnpm --filter omnimux-inspiration test
pnpm verify:stages
git diff --check
node --test tests/e2e/inspiration-local-sort.test.mjs
正式 E2E 固化已观察的真实 tab/menuitem/排序按钮 DOM：打包生产组件和 UI kit、连接真实临时 local-store，动态端口运行 ego-browser；成功或异常均 finally 清理任务空间、HTTP 服务与临时存储，保留截图、请求、源码身份和结构化报告。历史观察证据在 .agent-reports/local-sort/browser-verification.json。
真实浏览器使用 ego-browser 或仓库工作树 Web QA 运行器，动态端口、自清理。测试数据须含发布时间与入库时间相反的记录。

## 代码风格
遵循既有具名函数、React hooks、单引号与无分号风格；示例 `const [localSort, setLocalSort] = useState('new')`。

## 边界
总是：先失败测试后生产实现，验证真实交互，保留独立报告。
先问：扩大到其他页签默认值、修改存储或部署生产。
绝不：修改官方 DSH、覆盖其他工作树、向共享开发环境装载未合入源码。
文档影响仅本规格，无公共接口与操作流程文档变更。

## 自审
口径明确为 created_at；范围仅本地排序状态；无占位符；不改发布时间含义。
