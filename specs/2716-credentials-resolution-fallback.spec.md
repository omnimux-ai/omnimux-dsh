# 规格：官方凭据解析多层级回退与运行态补全 (Issue #2716)

## 一、问题背景与根因
在 Issue #2685 与 #2694 中，我们解除了 \`runtimeMode === 'agent'\` 对官方媒体专线和文本模型的连坐截胡。
但在判定是否为官方凭据 (\`hasOfficialToken\`) 时，\`media/mount.js\`、\`text/mount.js\` 与 \`text/execute.js\` 仅读取了全局环境变量 \`process.env.OMNIMUX_API_KEY\`。
在桌面客户端（Electron）以及外置浏览器运行态下，用户登录官方账号后，Token 权威存储在：
1. 宿主 \`credentials\` 存储（由 \`ctx.get('credentials')\` 或 \`input.credentials\` 管理）；
2. Profile 根目录凭据文件（\`~/.omnimux-dev/.credentials.yaml\` 或 \`~/.dsh/.credentials.yaml\` 中的 \`refs.OMNIMUX_API_KEY\`）；
3. CLI 凭据文件（\`~/.config/omnimux/secrets.json\`）。

当 \`process.env.OMNIMUX_API_KEY\` 未注入时，上述模块错误判定 \`hasOfficialToken = false\`，导致已登录用户在画布选择官方中枢模型时，请求被误判为“无官方凭据”，再次触发本地 Agent 劫持（塞给本地 Codex CLI 导致 400 报错）或媒体未配置拦截。

## 二、架构设计与解决规范
1. **统一权威凭据多层级解析（resolveSyncOfficialToken / resolveAuthoritativeOfficialToken）**：
   - 第一层：显式进程环境（\`input.env\` / \`process.env\`）；
   - 第二层：Profile 凭据文件（\`$DSH_HOME/.credentials.yaml\`、\`~/.omnimux-dev/.credentials.yaml\`、\`~/.dsh/.credentials.yaml\` 中的 \`refs.OMNIMUX_API_KEY\` / \`OMNIMUX_TOKEN\`）；
   - 第三层：CLI 凭据文件（\`~/.config/omnimux/secrets.json\`）；
   - 异步环境补充：\`input.credentials.resolve('OMNIMUX_API_KEY')\` / \`('OMNIMUX_TOKEN')\`。
2. **防伪验证不变**：
   - 解析出的 Token 必须 100% 经过 \`isAuthenticOfficialToken\` 校验（拒绝 undefined、null、false 等伪造占位符）。
3. **彻底闭环**：
   - 画布上选择 \`gemini-3.8-flash\` 等官方中枢模型时，只要用户在客户端登录过官方账号，直接识别并放行由中枢执行，绝不被本地 CLI 劫持。

## 三、验收标准
- 单元测试：在 \`process.env.OMNIMUX_API_KEY\` 为空但 credentials 存在有效 Token 时，\`executeOmnimuxText\` 与 \`mountMedia\` 均能成功识别 \`hasOfficialToken\` 并放行；
- 端到端：通过 ego-browser / CDP 在真实运行的 OmniMux Dev 客户端画布中，直接发起文本生成并成功出结果。
