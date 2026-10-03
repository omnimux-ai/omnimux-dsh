# 「优化提示词」按钮不可点 — 浏览器验收

环境：ego-browser 空间 #261，本地 http.server 47613 静态页（真实 bundle + 模拟 host GET/POST）。

| 步骤 | 结果 |
|---|---|
| 空草稿初始 | `disabled:true`，外层 seat 提示生效（图 s1） |
| 输入「帮我写一个短视频脚本文案」 | `disabled:false`——DOM 草稿订阅生效（图 s2） |
| 点击按钮 | POST 发出原文，草稿回写为「【已优化】…」（图 s3） |

证据：s1-disabled-empty.png / s2-enabled-typed.png / s3-applied.png。
