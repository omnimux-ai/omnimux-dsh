# 修复 execute 模块缺少 getModelChannelGroups 导出导入规格

## 1. 业务目标
解决在媒体生成链路执行中，调用 getModelChannelGroups 时因头部解构缺失引起的 ReferenceError 异常。

## 2. 方案实现
在 execute.js 的头部 import 列表中补齐 getModelChannelGroups。

## 3. 验收标准
1. execute.js 正常加载并执行无未定义报错；
2. 图像生成请求正常调用底层中枢。
