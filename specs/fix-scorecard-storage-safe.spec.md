# 任务规格：打分台本地缓存读取异常兜底

- 目标：修复 scorecard.html 在沙箱化预览环境（如侧边栏 iframe）中因 localStorage 访问被拒（SecurityError）导致整个页面初始化中断、左侧脚本清单渲染为空的问题。

## 核心变更
1. `scripts/workflows/evaluation/scorecard.html` 与生成器 `scripts/workflows/evaluation/build-scorecard.mjs`：
   - 将 localStorage 的读/写封装为带 try/catch 的安全函数（loadCache / saveCache）；
   - 缓存不可用时静默降级（不持久化评分），页面初始化与渲染不中断。

## 验收标准
1. 模拟 localStorage 抛错的环境下执行页面脚本，左侧能正常产出 12 条脚本卡片；
2. localStorage 正常环境下评分持久化不受影响；
3. 页面内联 JS 语法校验通过；L0 自动化门禁 PASS。
