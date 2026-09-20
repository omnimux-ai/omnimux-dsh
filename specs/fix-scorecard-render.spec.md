# 任务规格：修复第一关分镜脚本打分台 HTML 渲染与语法错误

- 目标：修复 scorecard.html 中缺失引号导致的 JavaScript SyntaxError，确保页面在浏览器中正常加载与渲染 12 条脚本明细与八维度评分控件。

## 验收标准
1. `scorecard.html` 内联 JavaScript 通过 `node --check` 语法检查，无任何 SyntaxError；
2. 浏览器打开 `scorecard.html` 左侧正常展示 12 条候选脚本卡片，中间正常展示当前脚本的分镜明细与口播话术；
3. 右侧八维度打分与 G7 平台合规勾选交互正常，实时计算均分与通过状态；
4. 自动化回归门禁全绿通过。
