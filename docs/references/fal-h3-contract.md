# fal MiniMax H3 契约修复依据

核对日期：2026-09-09。仅公开文档、离线 fixture，无真实模型或账务调用。

## 端点与规范字段

- Max 文生：https://fal.ai/models/minimax/h3-max/text-to-video/api
- Max 首帧：https://fal.ai/models/minimax/h3-max/image-to-video/api
- Max 参考：https://fal.ai/models/minimax/h3-max/reference-to-video/api
- Turbo 文生：https://fal.ai/models/minimax/h3-max-turbo/text-to-video/api
- Turbo 首帧：https://fal.ai/models/minimax/h3-max-turbo/image-to-video/api

Hub 保持 canonical `operation`、`image_with_roles`、`image_urls`、`video_urls`、`audio_urls`；网关 #192 消费这些字段。首帧只允许一个 first_frame，参考集合映射为 `reference_image_urls` / `reference_video_urls` / `reference_audio_urls`，保持集合内顺序；混合冲突、非法角色和不支持模式在提交前拒绝，不降级为文生。

参考端点公开 schema：图片最多9、视频最多3、音频最多3；总和最多12。视频每条2–15秒、合计最多15秒；音频也为2–15秒、合计最多15秒，且不能是唯一参考类型。产品目录本轮仍只开放既有图/视频参考，不新增音频槽或Turbo参考能力。

## 官方能力与产品子集

公开对应端点schema的prompt maxLength为50000，resolution为480P/768P/1080P，duration为5–15整数。页面包含多个共享schema，不能单凭类名前缀推导URL映射。本产品本轮保留5秒/10秒与768p/1080p子集，不扩大其他模型能力。

旧720p不是768P的正确名称。目录改为768p，旧持久化值在SubmitGuard及网关明确拒绝并提示重新选择；不自动改写保存值，不静默转换。

在上述fal端点页未找到30MB图片、50MB视频、HEIC/HEIF/QuickTime逐项官方限制。现有体积及MIME集合保留为产品兼容/资源子集，`limitSource.kind=policy_conservative`，不得冒充官方verified，也不能据缺项推断渠道明确不支持。9图3视频的官方证据独立保留，不因体积/MIME缺项删除。

## 验证与部署依赖

插件Issue #838依赖网关Issue laozhong86/OmniMux#192。`scripts/h3-cross-repo-fixtures.mjs`实际执行Hub guard与mapper；网关`TestHubToFalFixtures`读取该输出，执行真实Adaptor验证、最终URL和完整JSON body断言。设置`OMNIMUX_DSH_FIXTURE_ROOT`为插件隔离树后运行对应Go测试。测试不证明真实上游可用性。

独立QA仍需按正式L2和共享verify:live核对当前SHA、单link及页面输入。旧44204双主树link、历史手写PASS均不构成本次验收；本工程不签署QA或操作viewer/官方DSH/共享profile。
