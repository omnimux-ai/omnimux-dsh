# 验证证据 · 时长滑块刻度两端对齐

- 方式：隔离工作树 + 真实 Chrome headless CDP 截图
- 脚本：.tmp/qa/duration-limits-qa.mjs（临时探针）
- 断言：.omx-duration-limits 计算样式 display:flex / justify-content:space-between；4s 左缘与容器左缘偏差 <2px；15s 右缘与容器右缘偏差 <2px
- 结果：全部 PASS；截图 duration-limits-verified.png（时长 6s 居左标题/右值，4s 贴左、15s 贴右）
