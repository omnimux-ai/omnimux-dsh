# 规范：推特就地助手本机大模型补全通道 (Twitter Copilot Local Gateway)

## 1. 业务痛点与架构目标
- **业务痛点**：
  浏览器扩展受限于现代浏览器安全防泄漏策略（Content Security Policy `connect-src` 仅放行 127.0.0.1 环回），无法直连云端外部大模型接口；且在前端浏览器扩展内存储或写死 API 密钥严重违反 DSH 插件安全规范。
- **架构目标**：
  1. 在执行枢纽 `plugins/omnimux` 中挂载标准本机 HTTP 路由 `POST /omnimux/text/complete`，复用宿主现成的 `textComplete`（文案补全管道）与用户在 DSH 客户端配置的模型凭据及路由；
  2. 将浏览器扩展后台的大模型请求彻底切至本机环回接口（`http://127.0.0.1:<port>/omnimux/text/complete`），彻底拔除前端直连外网与代码中硬编码/混淆凭据的冗余；
  3. 实机验证推特推文下点击生成、7~10 秒深度推理、真实文案回填推特富文本框并点亮回复按钮的端到端全链路。

---

## 2. 详细接口契约与实现规范

### 2.1 枢纽本机接口 (`plugins/omnimux/src/text/http.js`)
- **路由路径**：`POST /omnimux/text/complete`
- **入参（JSON）**：
  ```json
  {
    "prompt": "推文正文或上下文",
    "system": "可选系统指令（如神评专家设定）",
    "model": "可选指定模型ID",
    "maxTokens": 1000
  }
  ```
- **出参（JSON）**：
  - 成功：`{ "ok": true, "text": "生成的神评内容" }`
  - 失败：`{ "ok": false, "error": "错误原因描述" }`（状态码 400 或 500）
- **安全与跨域**：
  - 必须支持来自本地浏览器扩展（`chrome-extension://*`）的跨域 OPTIONS 预检与 POST 请求（`Access-Control-Allow-Origin: *`）。

### 2.2 扩展后台调用对齐 (`plugins/omnimux-browser/extension/src/background/index.ts`)
- 当收到 `DSH_TWITTER_COPILOT_GENERATE` 消息时：
  - 自动探测本机 OmniMux 运行端口（优先探测 45120、43120）；
  - 向 `http://127.0.0.1:<port>/omnimux/text/complete` 发送 POST 请求；
  - 获得模型文案后回复 `sendResponse({ ok: true, text })`；
  - 彻底移除对 `api.deepseek.com`、`api.apikey.fun` 以及 `atob(...)` 的一切依赖。

---

## 3. 验收标准
1. **静态门禁**：通过 L0 质量门禁与安全扫描，无敏感凭据报警、无生命周期残留报警；
2. **单元测试**：枢纽 HTTP 路由测试全绿；扩展自身测试通过；
3. **端到端实机验证**：在推特推文 `https://x.com/jaxxchen003/status/2099056701865607327` 页面，点击小幽灵图标选择“高赞神评生成”，经历真实大模型推理（非秒填），输入框成功填入针对楼主内容的高质量神评，推特原生回复按钮激活。
