# 规格：画布执行器远程素材元数据异步探测与自愈 (Issue #2722)

## 一、背景与问题陈述
在 Issue #2722 中，用户在画布中使用含有远程素材（如预设商品图 `https://cdn.creatify.ai/...`）接入带有 `maxSizeMb` 约束的模型（如 `minimax-h3` 极速版的 `first_frame` 槽位，声明 `maxSizeMb: 30`）时，点击重新生成或运行必然报错：
`[omnimux:metadata_required] 来源 node-slot-product-image 缺少槽位 first_frame 校验所需的素材信息，请重新读取素材`

### 根因分析
1. **合同与门禁约束**：`submitGuard.ts:66` 严格要求：若槽位声明了有限的 `maxSizeMb`，则素材必须具备有效的 `sizeBytes`，否则抛出 `metadata_required`。
2. **远程素材元数据天然缺失**：在画布直接运行路径中，当上游节点为网络图片/视频时，客户端无法通过本地文件 `statSync` 同步获得文件字节大小（`sizeBytes`），因此 `sizeBytes` 恒为 `undefined`。
3. **断路点**：在 `plugins/omnimux-workflow/src/workflow/execution/materialGatewayExecutor.ts` 中，向 `gateway.submit` 发送生成请求前，未对远程网络引用的 `sizeBytes` 与 `mimeType` 进行异步探测补齐，直接将 `sizeBytes: undefined` 传入网关，触发门禁拦截。

## 二、架构设计与解决规范
1. **异步探测与优雅补齐 (enrichRemoteReferencesMetadata)**：
   - 在 `materialGatewayExecutor.ts` 收集到 `upstream.references` 后，在执行 `gateway.submit(request)` 之前，遍历所有引用；
   - 凡 `pathOrUrl` 以 `http://` 或 `https://` 开头且缺失 `sizeBytes` 的素材，通过异步 `fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) })` 探测；
   - 提取 `content-length` 填充为 `sizeBytes`（数值有限且大于等于0）；
   - 若 `mimeType` 缺失或为通用 `application/octet-stream`，尝试提取 `content-type` 并格式化填充；
   - 若远程服务器不支持 HEAD、返回错误或超时，保持原样，绝不崩溃中断。
2. **零副作用**：
   - 不修改 `submitGuard.ts` 的严格约束契约，不影响本地文件的门禁逻辑；
   - 纯异步非阻塞探测，设置 3000ms 严格超时控制，防止悬挂；
   - 支持并发多素材快速解析。

## 三、验收标准
1. **单测覆盖**：在带有 `maxSizeMb` 约束的视频首帧插槽中，传入未携带 `sizeBytes` 的远程 HTTP 图片 URL，经过执行器探测后，自动补全 `sizeBytes` 并顺利通过网关提交；
2. **降级保障**：探测失败或非 HTTP 素材平稳降级；
3. **实机验证**：在包含商品图远程地址的画布中，视频节点重新生成不再报错 `metadata_required`。
