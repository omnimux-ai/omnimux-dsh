# #3071 核验结算（合入前）

## 当前范围
标准 default 原单次提交真实生成已确认，PNG 2185451 字节、1312×1199、完整解码。更新中枢收取同原任务 GET2/POST0，未重投。经济/旗舰各一次524，未证明本次可用；不增付费验证。新提交映射用正式执行函数离线发包核验，不冒充新线上出图。

## 最终已执行检查
- 中枢整包：3125通过、0失败、0跳过，真实exit0。一次相同源码整包Electron teardown exit2保留，不修改断言，同源复验恢复；日志 hub-release.log/hub-release-serial.log。
- 画布整包：2373通过、0失败、0跳过，真实exit0；末次workflow-frozen.log。
- 应用整包：88通过、0失败、0跳过，真实exit0；Apps宿主和客户端正式产物已构建，未依无产物return算通过。日志apps-release.log。
- 查看器整包：315通过、0失败；2个既有Office转换用例因未装LibreOffice跳过，不算通过；viewer-release.log。
- 新消费端7项定向回归全部通过；画布类型检查、strict模型合同、product-baseline、plugin-boundaries、14Stage/8sidebar及anti-slop3项通过。
- 已读取独立 final-review.md，两轴开放已证实阻塞0；先前所有反例记录保持原样。

## 实际浏览器与视觉
共享查看器控件：taskSpace18/p1，经济3:2/4K/4→标准保3:2并归1K/1；旗舰2:3/4K/4→标准保2:3并归1K/1。九比例正几何；原真实图片natural1312×1199；标准/旗舰范围截图绑定本任务。最终finish({keep:[]})回执成功，任务本地服务已取消。

应用/画布：真实生产AppTab表单与ImageParamPopover/适配器在工作树临时动态端口、自清理浏览器中点击。默认表单仅1K；保存经济线路（含前置import、后置同型号standard节点）仍1K/2K/4K；画布默认standard仅1K且无quality，选经济恢复并集。consumer-browser-report.json逐次可见点击几何和状态、三个cleanup均true。截图已display人工目检。

此范围是生产控件/生产表单功能验证，不是完整宿主导航/生成恢复或共享Dev人工验收。外壳诊断按钮/文字不发布。初浅色/暗色截图缺宿主token/reset只作初记录；standard-parameters-final.png为可读最终共享控件证据，未宣称全主题矩阵。

## 用户许可与收尾
用户通过确认卡选择“确认，检查通过后合入并更新开发版”，生产与桌面重启明确不授权。实施不再待UI拍板。合并后只物化Dev；脚本ship含自动宿主restart，不能直接触发：先精确同步与静默物化并验证一致，再让ship走“开发版已包含”分支跳过reload后清理。安装到磁盘不等于当前宿主已加载。

## 文档影响
更新任务规格、主模型官方来源/线路说明与自动接口全景。公开单一产品模型ID不变，模型广域并集及参考操作上架状态不改；所有未知/超时与真实证据分开。ignored原图、live证据、调查和各次审查报告在清理前迁移至主检出.agent-reports/gpt-image-25-gateway-20261004/，不含秘密。
