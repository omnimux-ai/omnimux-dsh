---
title: "灵感分析服务与账号凭据恢复验收"
id: "evidence-analysis-service-recovery-3412"
type: "evidence"
status: "verified"
authority: "L3"
date: "2026-10-18"
authors: ["agent"]
subsystem: "omnimux-inspiration"
---

# 灵感分析服务与账号凭据恢复

Issue #3412；[任务规格](../../specs/analysis-service-recovery-3412.spec.md)。基准 `dd3587fd6d46c9f7819953de216f5d6b9d9559d5`，验收运行的是该基准上的任务候选改动，不是未修改基准。

2026-10-18 10:23:15–10:26:00 UTC，在任务工作树 `cross-analysis-service-issue-3412` 启动仅监听本机随机端口62961的合成宿主与上游，进程94204，Ego空间242。加载真实预览/个人资料组件、Hub注册API、灵感分发器/文件存储和Hub文字分析执行器。真实账号、模型服务、共享Dev与生产均未访问。

实际观察21项通过，保留12张PNG：

- pending准确提示；显式确认只写analysis一次，不启动分析或改变其他用途。
- 无执行凭据时显示个人资料启用入口；用户显式选择本人已有模拟密钥，无密钥创建请求，身份令牌从未进入模型请求。
- 视频运行中按钮禁用并显示“解析中...”；真关闭重开保持，完成自动刷新，无重复提交。
- 凭据读取失败、401、403分别显示真实中文原因，保留旧结果，不静默切换服务。
- 普通图片可用账号凭据；analysis仍pending时纯正文不受阻断。
- 共7份分析提交、5次本机模拟模型请求，两份在网络前失败；页面及三个公开端点未泄露凭据，运行错误为空。

前后15项产品运行源码指纹无漂移；前端bundle SHA256 `60772ca0c4537ba51aa66a1356ecc6e685a9963d3a5f4dd9c72542dbd8018f29`。关键截图：pending `25bc67a75b044dcffe0af2ad326f61673e0371d03878d7e15081e8baa9847348`；重开运行 `c3c21d12814e1801a01c80273c21f8dd02483701b3dcb8d058cd6a3f85df7d65`；结果 `0dfd5d3c8517d407a0de4f842d348fba0b26f6fa7c4cee86543d2c5c91258ccd`。完整脚本、报告、源码指纹与截图保存在任务本地证据目录 `.agent-reports/logged-in-analysis-key/browser/`。

空间已关闭、服务退出、端口释放、合成凭据目录删除。Hub包2+3457+82项、灵感包1531+261项通过；最后新增恢复UI回归2项及错误格式1项单独通过。边界、产品基线、模型合同、Stage、anti-slop、agent-tools、加载测试8项与插件加载22/22通过；独立复审27项通过。

该证据只证明真实组件与执行链在合成依赖下的局部功能，不证明完整Host装配、真实账号启用、真实模型质量或共享Dev人工验收。
