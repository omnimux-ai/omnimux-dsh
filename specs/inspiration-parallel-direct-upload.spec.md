# 灵感分享素材并发并行直传与降级拉黑策略优化规格说明 (Issue #2175)

## 1. 业务目标与背景
上游 OmniMux 网关已升级为 R2 预签名直连上传（PR #263 / PR #264）。端侧虽然接入了直传凭证机制，但在体验上仍存在两个关键性能与稳定性短板：
1. **封面与视频串行排队**：灵感分享发表时，先等待封面直传完成，再等待视频直传完成，经历双倍的往返等待时间。
2. **直传异常回退拉黑过于激进**：单次直传过程若发生偶发网络抖动、超时或 R2 临时错误，端侧直接永久拉黑该网关直传能力（加入 `directUploadUnavailable`），导致后续所有上传全部强制降级为老版慢速中转。

## 2. 关键设计与实现方案

### 2.1 灵感分享素材并发并行上传
在 `plugins/omnimux/src/official/inspiration-share.js` 中的 `publishLocal`：
- 将封面资产 `uploadAsset(cover)` 与媒体视频资产 `uploadAsset(media)` 的上传由串行 `await` 改为 `Promise.all` 并行触发。
- 两个资产同时发起直传或中转，耗时由 `T(cover) + T(media)` 缩减至 `max(T(cover), T(media))`。
- 保持既有错误捕获、取消与阶段状态上报能力。

### 2.2 直传降级策略精准化（避免误拉黑）
在 `plugins/omnimux/src/media/gateway-upload.js` 中：
- 区分**网关不支持直传能力**与**偶发传输网络错误**：
  - 仅当网关预签名端点明确返回 `HTTP 501`（Not Implemented）或 `HTTP 404`（Not Found）时，表明该部署环境不支持直传凭证签发，才将该网关 `baseUrl` 记录至 `directUploadUnavailable`，避免后续文件重复探测无效路由。
  - 若预签名正常签发，但在 PUT 到 R2 或网关 Confirm 登记阶段遇到偶发网络错误、HTTP 4xx/5xx 等异常：当次上传自动安全回退到 `uploadViaGateway` 保障当次分享成功，但**不得**将 `baseUrl` 加入 `directUploadUnavailable`。后续文件上传依然优先尝试极速直传。

## 3. 验收标准 (Acceptance Criteria)

- [ ] **AC-1 (并发并行上传)**：`publishLocal` 针对包含封面与视频的本地素材分享，两个资产的上传为并发执行，且二者均成功后正常进入发布阶段；
- [ ] **AC-2 (精准记住不支持)**：当网关预签名接口返回 `HTTP 501` 或 `HTTP 404` 时，回退到中转路由，并将 `baseUrl` 记住，后续上传直接走中转；
- [ ] **AC-3 (临时错误回退但不拉黑)**：当预签名成功但存储 PUT 发生错误或 Confirm 发生错误时，当次顺利回退到中转路由保证成功，且网关未被拉黑，后续文件上传依然优先尝试直传通道；
- [ ] **AC-4 (回归与门禁)**：既有单元测试与 E2E 自动化测试全量通过，无边界或回归问题。
