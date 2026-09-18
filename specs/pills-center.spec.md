# 输入框下快捷按钮组居中

## 目标与验收
用户明确要求四个现有快捷按钮整体以输入框为基准水平居中，仍在输入框下方。桌面按钮组与输入框中心差不超过 1 CSS px；窄屏折行后各行居中且无横向溢出。保留文字、图标、间距、顺序和点击行为。

## 实施
沿用 React 内联 flex 样式，仅补充按钮组 justifyContent: 'center'。不变更入口挂载、菜单或模型功能。新用户无需任何新增配置或凭据；不存在新增缺配置错误。文档影响仅此任务规格，无公共功能或契约变化。

## 项目结构和风格
源码 plugins/omnimux/src/client/session-guide/CreatifyPillsBar.jsx；现有测试同目录 creatify-pills-composer.test.js。沿用单引号与现有内联样式。

## 命令及验证
node --test plugins/omnimux/src/client/session-guide/creatify-pills-composer.test.js
pnpm verify:stages
git diff --check
浏览器按 docs/contracts/plugin-qa.md 在隔离工作树运行，保留截图与几何证据。未取得证据不得声称界面验收完成。

## 边界
始终保持主工作区与无关文件不变；独立审查与测试分开；不改官方宿主或其他仓库。不部署未合并代码，不发布生产。不新增只重述低风险样式修改的测试。
